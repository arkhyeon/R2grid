// 그리드 엔진 본체. React 와 무관한 순수 JS — 상태 + AG-Grid 호환 api + 이벤트.
// React 레이어는 useSyncExternalStore(subscribe, getVersion) 로 구독해 렌더만 담당한다.
import { EventService } from './EventService.js';
import { RowNode } from './RowNode.js';
import { Column, ColumnGroup, ROW_NUMBERS_COL_ID, SELECTION_COL_ID, normalizePinned } from './Column.js';
import { getGlobalGridOptions } from './globals.js';
import { resolveTheme } from './theme.js';
import { setFilterKey } from './filterService.js';
import {
  clamp,
  defaultComparator,
  evaluateExpression,
  eventPropName,
  getFieldValue,
  isPrintableKey,
  setFieldValue,
  toText,
} from './utils.js';
import { localeText } from './locale.js';
import { createApi } from './api.js';
import { pasteTextIntoGrid } from './clipboard.js';
import { AUTO_GROUP_COL_ID, groupingMethods } from './grouping.js';
import { ssrmMethods } from './ssrm.js';
import { rowDragMethods } from './rowDrag.js';
import { undoMethods } from './undo.js';
import { pinnedMethods } from './pinned.js';
import { customFilterMethods } from './customFilter.js';
import { fillHandleMethods } from './fillHandle.js';
import { statusBarMethods } from './statusBar.js';

export const DEFAULT_ROW_HEIGHT = 42;
export const DEFAULT_HEADER_HEIGHT = 48;
export const DEFAULT_DETAIL_ROW_HEIGHT = 300;

const BUILTIN_COLUMN_TYPES = {
  numericColumn: { headerClass: 'r2-right-aligned-header', cellClass: 'r2-right-aligned-cell' },
  rightAligned: { headerClass: 'r2-right-aligned-header', cellClass: 'r2-right-aligned-cell' },
};

let gridSeq = 0;

// 값이 바뀌어도 화면을 다시 그릴 필요가 없는 콜백 옵션
const SILENT_OPTION_KEYS = new Set([
  'getContextMenuItems',
  'getMainMenuItems',
  'processCellForClipboard',
  'processHeaderForClipboard',
  'processCellFromClipboard',
  'processDataFromClipboard',
  'sendToClipboard',
  'navigateToNextCell',
  'tabToNextCell',
  'postSortRows',
  'isExternalFilterPresent',
  'doesExternalFilterPass',
  'noRowsOverlayComponent',
  'loadingOverlayComponent',
  'loadingCellRenderer',
  'getLocaleText',
  'getRowId',
  'gridOptions',
]);

export function camelToHuman(field) {
  if (!field) return '';
  const last = String(field).split('.').pop();
  return last
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, c => c.toUpperCase());
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

export class GridCore {
  constructor(props) {
    this.gridId = String(props.gridId ?? ++gridSeq);
    this.events = new EventService();
    this.storeListeners = new Set();
    this.version = 0;
    this.destroyed = false;
    this.initializing = true;
    this.props = {};
    this.gos = {};
    this.overrides = {};

    // 컬럼
    this.allColumns = [];
    this.columnById = new Map();
    this.columnTree = [];
    this.headerGroupDepth = 0;
    this.displayedLeft = [];
    this.displayedCenter = [];
    this.displayedRight = [];
    this.displayedColumns = [];
    this.displayedIndex = new Map();
    this.leftWidth = 0;
    this.centerWidth = 0;
    this.rightWidth = 0;
    this.bodyWidth = 0;
    this.bodyHeight = 0;
    this.columnsVersion = 0;

    // 행
    this.rootNodes = [];
    this.nodeById = new Map();
    this.nextId = 0;
    this.rowDataSet = false;
    this.filteredNodes = [];
    this.sortedNodes = [];
    this.displayedNodes = [];
    this.filterModels = new Map();
    this.quickFilterVersion = 0;

    // 선택/포커스/범위/편집
    this.rsOpts = null;
    this.selected = new Map();
    this.lastSelectedNode = null;
    this.selectableCount = 0;
    this.focus = null;
    this.ranges = [];
    this.rangeSeq = 0;
    this.rangeDragging = false;
    this.editing = null;

    // UI
    this.popup = null;
    this.sideBarDef = null;
    this.sideBarOpenId = null;
    this.sideBarVisible = true;
    this.sideBarPosition = 'right';
    this.mountedPanels = new Set();
    this.manualOverlay = null;
    this.hoveredRowIndex = null;

    // 페이지네이션/행 위치
    this.currentPage = 0;
    this.pageSizeOverride = null;
    this.pageFirstRow = 0;
    this.pageLastRow = 0;
    this.totalPages = 0;
    this.uniformRowHeight = DEFAULT_ROW_HEIGHT;
    this.rowTops = null;
    this.pageHeight = 0;

    this.flashes = new Map();
    this.flashSeq = 0;
    this.timers = new Set();
    this.renderedRange = { first: -1, last: -1 };
    this.viewport = null;
    this.pendingScroll = null;
    this.eRoot = null;
    this.firstDataRenderedFired = false;
    this.pendingInitialEvents = [];

    // 고정행 / 그룹 / SSRM / 행드래그 / undo
    this.pinnedTop = [];
    this.pinnedBottom = [];
    this.groupMode = null;
    this.groupsDirty = true;
    this.groupTop = null;
    this.ssrm = null;
    this.rowDragState = null;
    this.undoStack = [];
    this.redoStack = [];

    this.api = createApi(this);
    this.applyProps(props, true);
    this.initializing = false;
  }

  // ── store ────────────────────────────────────────────────
  subscribe = listener => {
    this.storeListeners.add(listener);
    return () => this.storeListeners.delete(listener);
  };

  getVersion = () => this.version;

  notify() {
    this.version++;
    for (const l of [...this.storeListeners]) l();
  }

  get(key) {
    return this.gos[key];
  }

  setTimer(fn, ms) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  // ── 이벤트 ───────────────────────────────────────────────
  dispatch(type, params = {}) {
    if (this.destroyed) return;
    const event = { type, api: this.api, context: this.gos.context, ...params };
    const handler = this.gos[eventPropName(type)];
    if (typeof handler === 'function') handler(event);
    this.events.dispatch(event);
  }

  // ── 옵션 ─────────────────────────────────────────────────
  applyProps(props, initial = false) {
    const prevProps = this.props;
    if (!initial && props === prevProps) return;
    this.props = props;
    if (!initial) {
      for (const k in props) {
        if (props[k] !== prevProps[k] && k in this.overrides) delete this.overrides[k];
      }
      const pg = props.gridOptions;
      const ppg = prevProps.gridOptions;
      if (pg && pg !== ppg) {
        for (const k in pg) if (pg[k] !== ppg?.[k] && k in this.overrides) delete this.overrides[k];
      }
    }
    const merged = { ...getGlobalGridOptions(), ...(props.gridOptions || {}) };
    for (const k in props) {
      if (k === 'gridOptions') continue;
      const v = props[k];
      if (v !== undefined) merged[k] = v;
    }
    Object.assign(merged, this.overrides);
    this.applyGos(merged, initial);
  }

  setGridOption(key, value) {
    this.overrides[key] = value;
    this.applyGos({ ...this.gos, [key]: value }, false);
  }

  updateGridOptions(options) {
    Object.assign(this.overrides, options);
    this.applyGos({ ...this.gos, ...options }, false);
  }

  applyGos(next, initial) {
    const prev = this.gos;
    this.gos = next;
    if (initial) {
      this.theme = resolveTheme(next.theme);
      this.theme.install();
      this.rsOpts = this.normalizeRowSelection();
      this.buildColumns(true);
      this.buildPinnedRows();
      this.groupMode = this.computeGroupMode();
      this.normalizeSideBar(true);
      if (this.isSsrm()) {
        this.ssrmReset('init');
        return;
      }
      this.setRowData(next.rowData, true);
      return;
    }
    const changed = k => prev[k] !== next[k];
    // 바뀐 키가 이벤트 핸들러/콜백뿐이면 재렌더 없이 옵션만 갱신 (인라인 함수 props 대응)
    let renderRelevant = false;
    for (const k in next) {
      if (next[k] !== prev[k] && !SILENT_OPTION_KEYS.has(k) && !/^on[A-Z]/.test(k)) {
        renderRelevant = true;
        break;
      }
    }
    if (!renderRelevant) {
      for (const k in prev) {
        if (!(k in next) && !SILENT_OPTION_KEYS.has(k) && !/^on[A-Z]/.test(k)) {
          renderRelevant = true;
          break;
        }
      }
    }
    if (!renderRelevant) return;
    if (changed('theme')) {
      this.theme = resolveTheme(next.theme);
      this.theme.install();
    }
    let rebuild = false;
    if (
      changed('rowSelection') ||
      changed('suppressRowClickSelection') ||
      changed('rowMultiSelectWithClick') ||
      changed('isRowSelectable')
    ) {
      this.rsOpts = this.normalizeRowSelection();
      if (changed('rowSelection')) rebuild = true;
      this.updateSelectableAll();
    }
    if (
      changed('columnDefs') ||
      changed('defaultColDef') ||
      changed('columnTypes') ||
      changed('rowNumbers') ||
      changed('selectionColumnDef') ||
      changed('autoGroupColumnDef') ||
      changed('treeData') ||
      changed('groupDisplayType')
    ) {
      rebuild = true;
    }
    if (rebuild) this.buildColumns(false);
    if (changed('sideBar')) this.normalizeSideBar(false);
    if (changed('pinnedTopRowData') || changed('pinnedBottomRowData')) this.buildPinnedRows();

    const prevGroupMode = this.groupMode;
    this.groupMode = this.computeGroupMode();
    let groupRefresh = false;
    if (prevGroupMode !== this.groupMode || changed('getDataPath') || changed('treeData')) {
      this.groupsDirty = true;
      groupRefresh = true;
    }

    if (changed('rowModelType') || changed('serverSideDatasource')) {
      if (this.isSsrm()) {
        this.ssrmReset('datasource');
        this.notify();
        return;
      }
    }
    if (this.isSsrm()) {
      this.notify();
      return;
    }

    if (changed('rowData')) {
      const a = prev.rowData;
      const b = next.rowData;
      const bothEmpty =
        Array.isArray(a) && Array.isArray(b) && !a.length && !b.length && !this.rootNodes.length;
      if (!bothEmpty) this.setRowData(b, false);
    } else {
      let refresh = false;
      if (changed('quickFilterText')) refresh = true;
      if (
        changed('pagination') ||
        changed('paginationPageSize') ||
        changed('paginationAutoPageSize') ||
        changed('rowHeight') ||
        changed('getRowHeight') ||
        changed('detailRowHeight')
      ) {
        refresh = true;
      }
      if (changed('masterDetail') || changed('isRowMaster')) {
        this.updateMasterFlags(this.rootNodes);
        refresh = true;
      }
      if (changed('paginationPageSize')) this.pageSizeOverride = null;
      if (groupRefresh || changed('groupSelectsChildren')) refresh = true;
      if (refresh) {
        this.refreshModel({ newPageSize: changed('paginationPageSize') });
        if (changed('quickFilterText')) this.dispatch('filterChanged', { source: 'quickFilter', columns: [] });
      }
    }
    this.notify();
  }

  // ── 행 선택 옵션 정규화 (v34 객체형 + 레거시 문자열) ─────────
  normalizeRowSelection() {
    const g = this.gos;
    const rs = g.rowSelection;
    if (!rs) return null;
    if (typeof rs === 'string') {
      if (rs !== 'single' && rs !== 'multiple') return null;
      return {
        mode: rs === 'multiple' ? 'multiRow' : 'singleRow',
        legacy: true,
        checkboxes: false,
        headerCheckbox: false,
        enableClickSelection: !g.suppressRowClickSelection,
        enableSelectionWithoutKeys: !!g.rowMultiSelectWithClick,
        isRowSelectable: g.isRowSelectable,
        hideDisabledCheckboxes: false,
        selectAll: 'all',
        copySelectedRows: !g.suppressCopyRowsToClipboard,
        checkboxLocation: 'selectionColumn',
      };
    }
    if (typeof rs !== 'object' || !rs.mode) return null;
    const multi = rs.mode === 'multiRow';
    return {
      mode: multi ? 'multiRow' : 'singleRow',
      legacy: false,
      checkboxes: rs.checkboxes ?? true,
      headerCheckbox: multi ? rs.headerCheckbox ?? true : false,
      enableClickSelection: rs.enableClickSelection ?? false,
      enableSelectionWithoutKeys: multi ? !!rs.enableSelectionWithoutKeys : false,
      isRowSelectable: rs.isRowSelectable ?? g.isRowSelectable,
      hideDisabledCheckboxes: !!rs.hideDisabledCheckboxes,
      selectAll: rs.selectAll ?? 'all',
      copySelectedRows: !!rs.copySelectedRows,
      checkboxLocation: rs.checkboxLocation ?? 'selectionColumn',
    };
  }

  get cellSelectionOpts() {
    const cs = this.gos.cellSelection ?? this.gos.enableRangeSelection;
    if (!cs) return null;
    if (typeof cs === 'object') return { suppressMultiRanges: !!cs.suppressMultiRanges, handle: cs.handle };
    return { suppressMultiRanges: !!this.gos.suppressMultiRangeSelection };
  }

  // ── 컬럼 구성 ─────────────────────────────────────────────
  buildColumns(initial) {
    const g = this.gos;
    const defs = g.columnDefs || [];
    const defaultColDef = g.defaultColDef || {};
    const types = { ...BUILTIN_COLUMN_TYPES, ...(g.columnTypes || {}) };
    const prevById = this.columnById;
    const newById = new Map();
    const leaves = [];
    let autoSeq = 0;
    let groupSeq = 0;
    const prevSortSig = this.sortSignature();

    const mergeDef = def => {
      let merged = { ...defaultColDef };
      if (def.type) {
        const list = Array.isArray(def.type) ? def.type : String(def.type).split(',');
        list.forEach(t => {
          const td = types[t.trim()];
          if (td) merged = { ...merged, ...td };
        });
      }
      return { ...merged, ...def };
    };

    const prevGroups = this.groupById || new Map();
    const newGroups = new Map();
    const walk = (list, chain, level) => {
      const out = [];
      list.forEach(def => {
        if (!def) return;
        if (Array.isArray(def.children)) {
          const groupId = def.groupId != null ? String(def.groupId) : `__group_${groupSeq++}`;
          const gdef = g.defaultColGroupDef ? { ...g.defaultColGroupDef, ...def } : def;
          const group = new ColumnGroup(gdef, groupId, level);
          // 같은 groupId 그룹의 열림 상태 유지 (AG 동일)
          const prevGroup = prevGroups.get(groupId);
          if (prevGroup && !initial) group.expanded = prevGroup.expanded;
          group.parent = chain.length ? chain[chain.length - 1] : null;
          group.children = walk(def.children, [...chain, group], level + 1);
          group.computeExpandable();
          newGroups.set(groupId, group);
          out.push(group);
          return;
        }
        const merged = mergeDef(def);
        let base = merged.colId ?? merged.field;
        if (base == null) base = String(autoSeq++);
        base = String(base);
        let colId = base;
        let n = 1;
        while (newById.has(colId)) colId = `${base}_${n++}`;
        const prev = prevById.get(colId);
        let col;
        if (prev && !prev.isAuto && !initial) {
          col = prev;
          col.applyColDef(merged, def, false, prev.colDef);
          col.groupChain = chain;
          col.parent = chain.length ? chain[chain.length - 1] : null;
        } else {
          col = new Column(this, merged, def, colId, chain);
        }
        newById.set(colId, col);
        leaves.push(col);
        out.push(col);
      });
      return out;
    };
    this.columnTree = walk(defs, [], 0);
    this.groupById = newGroups;
    this.headerGroupDepth = leaves.reduce((m, c) => Math.max(m, c.groupChain.length), 0);

    // 자동 컬럼: 행번호 → 선택 체크박스
    const autoCols = [];
    const makeAuto = (colId, def, autoType) => {
      const prev = prevById.get(colId);
      let col;
      if (prev && prev.isAuto) {
        col = prev;
        col.applyColDef(def, def, false, prev.colDef);
      } else {
        col = new Column(this, def, def, colId, []);
      }
      col.isAuto = true;
      col.autoType = autoType;
      newById.set(colId, col);
      autoCols.push(col);
    };
    if (g.rowNumbers) {
      makeAuto(
        ROW_NUMBERS_COL_ID,
        {
          colId: ROW_NUMBERS_COL_ID,
          headerName: '',
          width: 60,
          minWidth: 40,
          sortable: false,
          resizable: true,
          filter: false,
          editable: false,
          suppressHeaderMenuButton: true,
          suppressMovable: true,
          lockPosition: 'left',
          suppressColumnsToolPanel: true,
          cellClass: 'r2-row-number-cell r2-row-number',
          headerClass: 'r2-row-number-header',
          ...(typeof g.rowNumbers === 'object' ? g.rowNumbers : {}),
        },
        'rowNumbers',
      );
    }
    const rs = this.rsOpts;
    if (rs && !rs.legacy && rs.checkboxes !== false && rs.checkboxLocation === 'selectionColumn') {
      makeAuto(
        SELECTION_COL_ID,
        {
          colId: SELECTION_COL_ID,
          headerName: '',
          width: 48,
          minWidth: 48,
          maxWidth: 48,
          sortable: false,
          resizable: false,
          filter: false,
          editable: false,
          suppressHeaderMenuButton: true,
          suppressHeaderFilterButton: true,
          suppressMovable: true,
          lockPosition: 'left',
          suppressColumnsToolPanel: true,
          suppressFiltersToolPanel: true,
          ...(g.selectionColumnDef || {}),
        },
        'selection',
      );
    }
    // 그룹핑/트리데이터 자동 그룹 컬럼 (defaultColDef → 기본값 → autoGroupColumnDef 순으로 병합)
    if (this.wantsAutoGroupColumn()) {
      makeAuto(
        AUTO_GROUP_COL_ID,
        {
          ...defaultColDef,
          headerName: localeText(this, 'group'),
          minWidth: 200,
          cellRenderer: 'agGroupCellRenderer',
          suppressColumnsToolPanel: true,
          ...(g.autoGroupColumnDef || {}),
          colId: AUTO_GROUP_COL_ID,
        },
        'group',
      );
      const gc = autoCols[autoCols.length - 1];
      gc.isAuto = false;
    }

    // 이동된 컬럼 순서 보존 (maintainColumnOrder) 또는 colDefs 순서
    let ordered = [...autoCols, ...leaves];
    if (!initial && g.maintainColumnOrder) {
      const prevOrder = new Map(this.allColumns.map((c, i) => [c.colId, i]));
      ordered = ordered
        .map((c, i) => ({ c, i, p: prevOrder.has(c.colId) ? prevOrder.get(c.colId) : 1e9 + i }))
        .sort((a, b) => a.p - b.p)
        .map(x => x.c);
    }
    this.allColumns = ordered;
    this.columnById = newById;

    // 사라진 컬럼의 필터 제거
    for (const colId of [...this.filterModels.keys()]) {
      if (!newById.has(colId)) this.filterModels.delete(colId);
    }
    // 사라졌거나 더 이상 커스텀 필터가 아닌 컬럼의 필터 인스턴스 제거
    if (this.customFilters) {
      for (const colId of [...this.customFilters.keys()]) {
        const c = newById.get(colId);
        if (!c || !this.isCustomFilter(c)) this.customFilters.delete(colId);
      }
    }
    if (this.rootNodes.length) this.inferDataTypes();
    this.columnsVersion++;
    this.layoutColumns();

    if (!initial) {
      if (this.sortSignature() !== prevSortSig) this.refreshModel({});
      this.dispatch('newColumnsLoaded', { source: 'gridOptionsUpdated' });
      this.dispatch('displayedColumnsChanged', { source: 'gridOptionsUpdated' });
    }
  }

  sortSignature() {
    return this.allColumns
      .filter(c => c.sort)
      .map(c => `${c.colId}:${c.sort}:${c.sortIndex}`)
      .join('|');
  }

  // 첫 행 기준 cellDataType 추론 (AG-Grid v31+ 동작)
  inferDataTypes() {
    const first = this.rootNodes[0]?.data;
    for (const col of this.allColumns) {
      if (col.isAuto) continue;
      const cdt = col.colDef.cellDataType;
      if (cdt === false) {
        col.dataType = null;
        continue;
      }
      if (typeof cdt === 'string') {
        col.dataType = cdt;
        continue;
      }
      if (col.dataTypeInferred || col.colDef.valueGetter || !col.colDef.field || !first) continue;
      const v = getFieldValue(first, col.colDef.field, this.gos.suppressFieldDotNotation);
      if (v == null) continue;
      let t;
      if (typeof v === 'number') t = 'number';
      else if (typeof v === 'boolean') t = 'boolean';
      else if (v instanceof Date) t = 'date';
      else if (typeof v === 'string') t = /^\d{4}-\d{2}-\d{2}$/.test(v) ? 'dateString' : 'text';
      else t = 'object';
      col.dataType = t;
      col.dataTypeInferred = true;
    }
  }

  // 표시 컬럼 분할 + flex 폭 계산 + left 오프셋
  // columnGroupShow: 부모 그룹이 접기 가능할 때 'open' 자식은 열림에서만, 'closed' 자식은 닫힘에서만 표시
  computeGroupShown(col) {
    const chain = col.groupChain;
    for (let i = 0; i < chain.length; i++) {
      const group = chain[i];
      if (!group.expandable) continue;
      const child = chain[i + 1] || col;
      const show = child.isColumn ? child.colDef.columnGroupShow : child.colGroupDef.columnGroupShow;
      if (show === 'open' && !group.expanded) return false;
      if (show === 'closed' && group.expanded) return false;
    }
    return true;
  }

  layoutColumns() {
    this.allColumns.forEach(c => {
      c.groupShown = this.computeGroupShown(c);
    });
    const visible = this.allColumns.filter(c => c.visible && c.groupShown);
    const left = [];
    const center = [];
    const right = [];
    visible.forEach(c => {
      if (c.pinned === 'left') left.push(c);
      else if (c.pinned === 'right') right.push(c);
      else center.push(c);
    });
    const clampW = (c, w) => {
      let x = Math.max(c.minWidth, w);
      if (c.maxWidth) x = Math.min(x, c.maxWidth);
      return x;
    };
    let fixed = 0;
    const flexCols = [];
    visible.forEach(c => {
      if (c.flex) flexCols.push(c);
      else {
        c.actualWidth = clampW(c, c.width);
        fixed += c.actualWidth;
      }
    });
    if (flexCols.length) {
      const avail = this.bodyWidth;
      if (avail > 0) {
        const pinnedW = new Map();
        let remaining = [...flexCols];
        let again = true;
        while (again && remaining.length) {
          again = false;
          const space = avail - fixed - [...pinnedW.values()].reduce((s, w) => s + w, 0);
          const totalFlex = remaining.reduce((s, c) => s + c.flex, 0);
          for (const c of remaining) {
            const w = (space * c.flex) / totalFlex;
            if (w < c.minWidth) {
              pinnedW.set(c, c.minWidth);
              remaining = remaining.filter(x => x !== c);
              again = true;
              break;
            }
            if (c.maxWidth && w > c.maxWidth) {
              pinnedW.set(c, c.maxWidth);
              remaining = remaining.filter(x => x !== c);
              again = true;
              break;
            }
          }
        }
        pinnedW.forEach((w, c) => {
          c.actualWidth = w;
        });
        const space = avail - fixed - [...pinnedW.values()].reduce((s, w) => s + w, 0);
        const totalFlex = remaining.reduce((s, c) => s + c.flex, 0);
        let used = 0;
        remaining.forEach((c, i) => {
          let w;
          if (i === remaining.length - 1) w = Math.max(c.minWidth, Math.round(space - used));
          else w = Math.floor((space * c.flex) / totalFlex);
          c.actualWidth = clampW(c, w);
          used += c.actualWidth;
        });
      } else {
        flexCols.forEach(c => {
          c.actualWidth = clampW(c, c.width);
        });
      }
    }
    let x = 0;
    left.forEach(c => {
      c.left = x;
      x += c.actualWidth;
    });
    this.leftWidth = x;
    x = 0;
    center.forEach(c => {
      c.left = x;
      x += c.actualWidth;
    });
    this.centerWidth = x;
    x = 0;
    right.forEach(c => {
      c.left = x;
      x += c.actualWidth;
    });
    this.rightWidth = x;
    this.displayedLeft = left;
    this.displayedCenter = center;
    this.displayedRight = right;
    this.displayedColumns = [...left, ...center, ...right];
    this.displayedIndex = new Map(this.displayedColumns.map((c, i) => [c.colId, i]));
  }

  setViewportSize(width, height) {
    const wChanged = width !== this.bodyWidth;
    const hChanged = height !== this.bodyHeight;
    if (!wChanged && !hChanged) return;
    this.bodyWidth = width;
    this.bodyHeight = height;
    if (wChanged) this.layoutColumns();
    if (wChanged && /^fit(GridWidth|ProvidedWidth)$/.test(this.gos.autoSizeStrategy?.type || '')) this.applyAutoSizeStrategy(false);
    if (hChanged && this.gos.pagination && this.gos.paginationAutoPageSize) {
      this.refreshModel({ newPageSize: true });
    }
    this.notify();
    this.dispatch('gridSizeChanged', { clientWidth: width, clientHeight: height });
  }

  getColumn(key) {
    if (key == null) return null;
    if (key instanceof Column) return key;
    if (typeof key === 'object') {
      return this.allColumns.find(c => c.userProvidedColDef === key || c.colDef === key) ?? null;
    }
    return this.columnById.get(String(key)) ?? null;
  }

  getColumnsFromKeys(keys) {
    return (keys || []).map(k => this.getColumn(k)).filter(Boolean);
  }

  getDisplayName(column) {
    if (!column) return '';
    const cd = column.colDef;
    if (cd.headerValueGetter) {
      const p = { colDef: cd, column, api: this.api, context: this.gos.context, location: 'header' };
      return typeof cd.headerValueGetter === 'function' ? cd.headerValueGetter(p) : String(cd.headerValueGetter);
    }
    let name;
    if (cd.headerName != null) name = cd.headerName;
    else if (column.isAuto) return '';
    else name = camelToHuman(cd.field ?? column.colId);
    // 그룹 집계 컬럼: "sum(가격)" (suppressAggFuncInHeader 로 끔)
    if (this.groupMode && cd.aggFunc && !this.gos.suppressAggFuncInHeader && column.autoType !== 'group') {
      const fnName = typeof cd.aggFunc === 'string' ? cd.aggFunc : 'func';
      return `${fnName}(${name})`;
    }
    return name;
  }

  // 컬럼 상태 변경 공통 (가시성/고정/폭/순서)
  setColumnsVisible(keys, visible, source = 'api') {
    const cols = this.getColumnsFromKeys(keys).filter(c => c.visible !== !!visible);
    if (!cols.length) return;
    cols.forEach(c => {
      c.visible = !!visible;
    });
    this.afterColumnLayoutChange();
    this.dispatch('columnVisible', {
      columns: cols,
      column: cols.length === 1 ? cols[0] : null,
      visible: !!visible,
      source,
    });
  }

  setColumnsPinned(keys, pinned, source = 'api') {
    const p = normalizePinned(pinned);
    const cols = this.getColumnsFromKeys(keys).filter(c => c.pinned !== p);
    if (!cols.length) return;
    cols.forEach(c => {
      c.pinned = p;
    });
    this.afterColumnLayoutChange();
    this.dispatch('columnPinned', {
      columns: cols,
      column: cols.length === 1 ? cols[0] : null,
      pinned: p,
      source,
    });
  }

  setColumnWidth(key, width, finished = true, source = 'api') {
    const col = this.getColumn(key);
    if (!col) return;
    let w = Math.max(col.minWidth, Math.round(width));
    if (col.maxWidth) w = Math.min(w, col.maxWidth);
    col.width = w;
    col.flex = null;
    this.afterColumnLayoutChange();
    this.dispatch('columnResized', { columns: [col], column: col, finished, source });
  }

  moveColumns(keys, toIndex, source = 'api') {
    const cols = this.getColumnsFromKeys(keys);
    if (!cols.length) return;
    const rest = this.allColumns.filter(c => !cols.includes(c));
    const idx = clamp(toIndex, 0, rest.length);
    rest.splice(idx, 0, ...cols);
    // lockPosition 'left'/'right' 유지
    const lockedLeft = rest.filter(c => c.colDef.lockPosition === 'left' || c.colDef.lockPosition === true);
    const lockedRight = rest.filter(c => c.colDef.lockPosition === 'right');
    const middle = rest.filter(c => !lockedLeft.includes(c) && !lockedRight.includes(c));
    const next = [...lockedLeft, ...middle, ...lockedRight];
    // marryChildren 그룹은 자식이 연속해야 함 → 깨지는 이동은 무시 (AG 동일)
    if (!this.isMarriedOrderValid(next)) return;
    this.allColumns = next;
    this.afterColumnLayoutChange();
    this.dispatch('columnMoved', {
      columns: cols,
      column: cols.length === 1 ? cols[0] : null,
      toIndex: idx,
      finished: true,
      source,
    });
  }

  isMarriedOrderValid(order) {
    const pos = new Map(order.map((c, i) => [c, i]));
    for (const group of this.groupById?.values() || []) {
      if (!group.colGroupDef.marryChildren) continue;
      const idx = group.getLeafColumns().map(c => pos.get(c)).sort((a, b) => a - b);
      if (idx.length && idx[idx.length - 1] - idx[0] !== idx.length - 1) return false;
    }
    return true;
  }

  getColumnGroup(key) {
    if (key == null) return null;
    if (key instanceof ColumnGroup) return key;
    return this.groupById?.get(String(key)) ?? null;
  }

  setColumnGroupOpened(key, open, source = 'api') {
    const group = this.getColumnGroup(key);
    if (!group || group.expanded === !!open) return;
    group.setExpanded(open);
    this.afterColumnLayoutChange();
    this.dispatch('columnGroupOpened', { columnGroup: group, columnGroups: [group], source });
  }

  getColumnGroupState() {
    return [...(this.groupById?.values() || [])].map(g => ({ groupId: g.groupId, open: g.expanded }));
  }

  setColumnGroupState(state) {
    const changed = [];
    (state || []).forEach(s => {
      const group = this.getColumnGroup(s.groupId);
      if (group && group.expanded !== !!s.open) {
        group.setExpanded(s.open);
        changed.push(group);
      }
    });
    if (!changed.length) return;
    this.afterColumnLayoutChange();
    this.dispatch('columnGroupOpened', { columnGroup: changed.length === 1 ? changed[0] : undefined, columnGroups: changed, source: 'api' });
  }

  afterColumnLayoutChange() {
    this.columnsVersion++;
    this.quickFilterVersion++;
    this.layoutColumns();
    this.notify();
    this.dispatch('displayedColumnsChanged', { source: 'api' });
  }

  getColumnState() {
    return this.allColumns.map(c => ({
      colId: c.colId,
      width: c.actualWidth,
      hide: !c.visible,
      pinned: c.pinned,
      sort: c.sort || null,
      sortIndex: c.sort ? c.sortIndex : null,
      aggFunc: null,
      rowGroup: false,
      rowGroupIndex: null,
      pivot: false,
      pivotIndex: null,
      flex: c.flex ?? null,
    }));
  }

  applyColumnState({ state, applyOrder, defaultState } = {}) {
    const touched = new Set();
    const visChanged = [];
    let sortChanged = false;
    const apply = (col, s) => {
      if (!col || !s) return;
      if (s.hide !== undefined && col.visible !== !s.hide) {
        col.visible = !s.hide;
        visChanged.push(col);
      }
      if (s.pinned !== undefined) col.pinned = normalizePinned(s.pinned);
      if (s.width !== undefined && s.width != null) col.width = s.width;
      if (s.flex !== undefined) col.flex = s.flex || null;
      if (s.sort !== undefined && (col.sort || null) !== (s.sort || null)) {
        col.sort = s.sort || null;
        sortChanged = true;
      }
      if (s.sortIndex !== undefined) col.sortIndex = s.sortIndex;
    };
    (state || []).forEach(s => {
      const col = this.getColumn(s.colId);
      if (col) {
        touched.add(col);
        apply(col, s);
      }
    });
    if (defaultState) this.allColumns.forEach(c => !touched.has(c) && apply(c, defaultState));
    if (applyOrder && state) {
      const order = state.map(s => this.getColumn(s.colId)).filter(Boolean);
      const rest = this.allColumns.filter(c => !order.includes(c));
      this.allColumns = [...order, ...rest];
    }
    this.columnsVersion++;
    this.layoutColumns();
    if (sortChanged) {
      if (this.isSsrm()) this.ssrmReset('sort');
      else this.refreshModel({});
    }
    this.notify();
    if (visChanged.length) {
      this.dispatch('columnVisible', {
        columns: visChanged,
        column: visChanged.length === 1 ? visChanged[0] : null,
        visible: visChanged[0].visible,
        source: 'api',
      });
    }
    if (sortChanged) this.dispatch('sortChanged', { source: 'api', columns: [] });
    this.dispatch('displayedColumnsChanged', { source: 'api' });
    return true;
  }

  resetColumnState() {
    const prev = this.columnById;
    this.columnById = new Map();
    this.buildColumns(true);
    prev.clear();
    this.refreshModel({});
    this.notify();
    this.dispatch('displayedColumnsChanged', { source: 'api' });
  }

  // ── 값 ───────────────────────────────────────────────────
  makeValueParams(node, column) {
    return {
      node,
      data: node?.data,
      colDef: column?.colDef,
      column,
      api: this.api,
      context: this.gos.context,
      getValue: field => getFieldValue(node?.data, field),
    };
  }

  getCellValue(node, column) {
    if (!node || !column) return undefined;
    if (column.autoType === 'rowNumbers') return node.rowIndex != null && !node.rowPinned ? node.rowIndex + 1 : null;
    if (column.autoType === 'selection') return undefined;
    if (node.stub) return undefined;
    if (column.autoType === 'group') return this.getAutoGroupValue(node, column);
    // 그룹 노드: 집계값 우선 (트리데이터의 데이터 보유 부모도 동일)
    if (node.group && node.aggData && column.colId in node.aggData) return node.aggData[column.colId];
    if (node.group && node.data === undefined) return undefined;
    const cd = column.colDef;
    if (cd.valueGetter) {
      const p = this.makeValueParams(node, column);
      return typeof cd.valueGetter === 'function' ? cd.valueGetter(p) : evaluateExpression(cd.valueGetter, p);
    }
    if (cd.field) return getFieldValue(node.data, cd.field, this.gos.suppressFieldDotNotation);
    return undefined;
  }

  // valueFormatter 결과 (없으면 null — AG-Grid 와 동일하게 valueFormatted=null)
  formatValue(node, column, value) {
    const cd = column.colDef;
    if (column.autoType === 'group' && node.group) {
      if (node.key == null && this.groupMode === 'group') return localeText(this, 'blanks');
      // 그룹 행 키는 그룹 기준 컬럼의 valueFormatter 로 표시
      const rgc = node.rowGroupColumn;
      if (rgc?.colDef.valueFormatter && typeof rgc.colDef.valueFormatter === 'function') {
        return rgc.colDef.valueFormatter({ ...this.makeValueParams(node, rgc), value: node.groupValue ?? value });
      }
      return null;
    }
    const vf = cd.valueFormatter;
    if (vf) {
      const p = { ...this.makeValueParams(node, column), value };
      return typeof vf === 'function' ? vf(p) : evaluateExpression(vf, p);
    }
    if (cd.refData && value != null) return cd.refData[value] ?? value;
    if (column.dataType === 'date' && value instanceof Date) {
      return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    }
    return null;
  }

  getCellText(node, column) {
    const v = this.getCellValue(node, column);
    const f = this.formatValue(node, column, v);
    const out = f != null ? f : v;
    return out == null ? '' : typeof out === 'object' && !(out instanceof Date) ? String(out) : toText(out);
  }

  cellEventParams(node, column, event) {
    return {
      node,
      data: node?.data,
      value: column ? this.getCellValue(node, column) : undefined,
      rowIndex: node?.rowIndex ?? null,
      rowPinned: node?.rowPinned,
      colDef: column?.colDef,
      column,
      event,
    };
  }

  isCellEditable(column, node) {
    if (!node || !column || node.detail || column.isAuto) return false;
    const e = column.colDef.editable;
    if (typeof e === 'function') return !!e(this.makeValueParams(node, column));
    return !!e;
  }

  setCellValue(node, column, newValue, source = 'api', knownOldValue) {
    if (!node || !column) return false;
    const cd = column.colDef;
    const oldValue = knownOldValue !== undefined ? knownOldValue : this.getCellValue(node, column);
    const params = { ...this.makeValueParams(node, column), oldValue, newValue };
    let changed;
    if (cd.valueSetter) {
      if (typeof cd.valueSetter === 'function') {
        changed = cd.valueSetter(params);
        if (changed === undefined) changed = true;
      } else {
        setFieldValue(node.data, cd.valueSetter, newValue);
        changed = true;
      }
    } else if (cd.field) {
      const eq = cd.equals ? cd.equals(oldValue, newValue) : oldValue === newValue;
      if (eq) changed = false;
      else {
        setFieldValue(node.data, cd.field, newValue, this.gos.suppressFieldDotNotation);
        changed = true;
      }
    } else changed = false;
    if (!changed) return false;
    this.recordUndo(node, column, oldValue, newValue, source);
    node.__version++;
    node.__quickFilterText = null;
    this.dispatch('cellValueChanged', {
      ...this.cellEventParams(node, column),
      value: newValue,
      oldValue,
      newValue,
      source,
    });
    node.__dispatchLocal('cellChanged', { column, newValue, oldValue });
    if (cd.enableCellChangeFlash) this.flashCells({ rowNodes: [node], columns: [column] });
    this.notify();
    return true;
  }

  // ── 행 데이터 ─────────────────────────────────────────────
  makeRowId(data, level = 0) {
    const fn = this.gos.getRowId;
    if (typeof fn === 'function') {
      return String(fn({ data, level, parentKeys: [], api: this.api, context: this.gos.context }));
    }
    return String(this.nextId++);
  }

  setRowData(rowData, initial) {
    if (this.isSsrm()) return;
    const getRowId = this.gos.getRowId;
    let selectionChanged = false;
    this.editing = null;
    this.groupsDirty = true;
    // getRowId 없는 전체 교체면 맨 위로 (suppressScrollOnNewData 로 끔) — AG 동작
    const isDelta = typeof getRowId === 'function' && this.rootNodes.length > 0;
    if (!initial && !isDelta && !this.gos.suppressScrollOnNewData && this.viewport) {
      this.viewport.setScrollTop(0);
    }
    if (rowData == null) {
      this.rowDataSet = false;
      if (this.selected.size) selectionChanged = true;
      this.clearSelectionSilently();
      this.rootNodes = [];
      this.nodeById = new Map();
    } else {
      this.rowDataSet = true;
      if (typeof getRowId === 'function' && this.rootNodes.length) {
        const oldById = this.nodeById;
        const newById = new Map();
        const nodes = new Array(rowData.length);
        for (let i = 0; i < rowData.length; i++) {
          const data = rowData[i];
          const id = this.makeRowId(data);
          let node = oldById.get(id);
          if (node) {
            if (node.data !== data) {
              node.data = data;
              node.__version++;
              node.__quickFilterText = null;
            }
          } else {
            node = new RowNode(this, data, id);
          }
          node.sourceRowIndex = i;
          nodes[i] = node;
          newById.set(id, node);
        }
        for (const [id, node] of [...this.selected]) {
          if (newById.get(id) !== node) {
            node.selected = false;
            this.selected.delete(id);
            selectionChanged = true;
          }
        }
        this.rootNodes = nodes;
        this.nodeById = newById;
      } else {
        if (this.selected.size) selectionChanged = true;
        this.clearSelectionSilently();
        this.nextId = 0;
        const nodes = new Array(rowData.length);
        const byId = new Map();
        for (let i = 0; i < rowData.length; i++) {
          const data = rowData[i];
          const node = new RowNode(this, data, this.makeRowId(data));
          node.sourceRowIndex = i;
          nodes[i] = node;
          byId.set(node.id, node);
        }
        this.rootNodes = nodes;
        this.nodeById = byId;
      }
    }
    this.updateSelectableAll();
    this.updateMasterFlags(this.rootNodes);
    if (this.rootNodes.length) this.inferDataTypes();
    this.quickFilterVersion++;
    this.refreshModel({ newData: true, silent: initial });
    if (initial) {
      if (this.rowDataSet) this.pendingInitialEvents.push(['rowDataUpdated', {}]);
      return;
    }
    this.dispatch('rowDataUpdated', {});
    if (selectionChanged) {
      this.dispatch('selectionChanged', { source: 'rowDataChanged', selectedNodes: this.getSelectedNodes() });
    }
  }

  clearSelectionSilently() {
    for (const n of this.selected.values()) n.selected = false;
    this.selected.clear();
    this.lastSelectedNode = null;
  }

  applyTransaction(tx = {}) {
    const result = { add: [], update: [], remove: [] };
    if (this.isSsrm()) return result;
    this.groupsDirty = true;
    const hasId = typeof this.gos.getRowId === 'function';
    let byData = null;
    const findNode = data => {
      if (hasId) return this.nodeById.get(this.makeRowId(data)) || null;
      if (!byData) byData = new Map(this.rootNodes.map(n => [n.data, n]));
      return byData.get(data) || null;
    };
    let selectionChanged = false;
    if (tx.remove?.length) {
      const removeSet = new Set();
      tx.remove.forEach(d => {
        const node = findNode(d);
        if (node) removeSet.add(node);
      });
      if (removeSet.size) {
        this.rootNodes = this.rootNodes.filter(n => !removeSet.has(n));
        removeSet.forEach(n => {
          this.nodeById.delete(n.id);
          if (n.selected) {
            n.selected = false;
            this.selected.delete(n.id);
            selectionChanged = true;
          }
          result.remove.push(n);
        });
      }
    }
    if (tx.update?.length) {
      tx.update.forEach(d => {
        const node = findNode(d);
        if (!node) return;
        const before = this.flashCandidates(node);
        node.data = d;
        node.__version++;
        node.__quickFilterText = null;
        this.flashChangedCells(node, before);
        result.update.push(node);
      });
    }
    if (tx.add?.length) {
      const newNodes = tx.add.map(d => {
        const node = new RowNode(this, d, this.makeRowId(d));
        this.nodeById.set(node.id, node);
        result.add.push(node);
        return node;
      });
      this.updateMasterFlags(newNodes);
      const idx = tx.addIndex;
      if (idx != null && idx >= 0 && idx < this.rootNodes.length) {
        this.rootNodes = [...this.rootNodes.slice(0, idx), ...newNodes, ...this.rootNodes.slice(idx)];
      } else {
        this.rootNodes = [...this.rootNodes, ...newNodes];
      }
    }
    this.rootNodes.forEach((n, i) => {
      n.sourceRowIndex = i;
    });
    this.rowDataSet = true;
    this.updateSelectableAll();
    if (!this.columnsTypedOnce && this.rootNodes.length) this.inferDataTypes();
    this.quickFilterVersion++;
    this.refreshModel({ keepRenderedRows: true });
    this.dispatch('rowDataUpdated', {});
    if (selectionChanged) {
      this.dispatch('selectionChanged', { source: 'rowDataChanged', selectedNodes: this.getSelectedNodes() });
    }
    return result;
  }

  // enableCellChangeFlash 컬럼의 이전 값 스냅샷
  flashCandidates(node) {
    const cols = this.allColumns.filter(c => c.colDef.enableCellChangeFlash);
    if (!cols.length) return null;
    return cols.map(c => [c, this.getCellValue(node, c)]);
  }

  flashChangedCells(node, before) {
    if (!before) return;
    const changed = before.filter(([c, v]) => this.getCellValue(node, c) !== v).map(([c]) => c);
    if (changed.length) this.flashCells({ rowNodes: [node], columns: changed });
  }

  setNodeData(node, data, isUpdate) {
    const before = isUpdate ? this.flashCandidates(node) : null;
    node.data = data;
    node.__version++;
    node.__quickFilterText = null;
    this.updateSelectable(node);
    if (before) this.flashChangedCells(node, before);
    node.__dispatchLocal('dataChanged', { oldData: null, newData: data, update: isUpdate });
    this.notify();
  }

  updateMasterFlags(nodes) {
    const md = this.gos.masterDetail;
    const isRowMaster = this.gos.isRowMaster;
    const expandDefault = this.gos.groupDefaultExpanded;
    nodes.forEach(n => {
      const wasMaster = n.master;
      n.master = !!md && (typeof isRowMaster === 'function' ? !!isRowMaster(n.data) : true);
      if (n.master && !wasMaster && expandDefault != null && (expandDefault === -1 || expandDefault >= 1)) {
        n.expanded = true;
      }
      if (!n.master) n.expanded = false;
    });
  }

  setNodeExpanded(node, expanded) {
    const expandable = node.master || (node.group && !!node.childrenAll?.length);
    if (!expandable || node.expanded === expanded) return;
    node.expanded = expanded;
    this.refreshModel({ keepRenderedRows: true, skipFilter: true });
    node.__dispatchLocal('expandedChanged', { expanded });
    this.dispatch('rowGroupOpened', { node, data: node.data, rowIndex: node.rowIndex, expanded });
  }

  getDetailNode(master) {
    if (!master.detailNode) {
      const d = new RowNode(this, master.data, `detail_${master.id}`);
      d.detail = true;
      d.parent = master;
      d.selectable = false;
      master.detailNode = d;
    }
    master.detailNode.data = master.data;
    return master.detailNode;
  }

  // ── 모델 파이프라인: 필터 → 정렬 → 표시 → 페이지 → 행 위치 ──────────
  refreshModel({
    newData = false,
    keepRenderedRows = false,
    skipFilter = false,
    newPageSize = false,
    resetPage = false,
    silent = false,
  } = {}) {
    if (this.isSsrm()) {
      this.ssrmRefreshView();
      return;
    }
    if (this.groupMode) {
      if (!skipFilter || !this.filterPreds) this.applyFilters();
      this.runGroupPipeline(this.filterPreds, this.makeSortComparator());
    } else {
      if (!skipFilter) this.applyFilters();
      this.applySort();
      this.buildDisplayed();
    }
    if (resetPage) this.currentPage = 0;
    this.updatePagination();
    this.computeRowTops();
    this.clampFocusAndRanges();
    this.notify();
    if (silent || this.initializing) return;
    this.dispatch('modelUpdated', { newData, newPage: false, keepRenderedRows, animate: false });
    if (this.gos.pagination) {
      this.dispatch('paginationChanged', {
        newData,
        newPage: false,
        newPageSize,
        keepRenderedRows,
        animate: false,
      });
    }
  }

  applyFilters() {
    const preds = [];
    for (const [colId, model] of this.filterModels) {
      const col = this.columnById.get(colId);
      if (!col || !this.isFilterModelActive(col, model)) continue;
      const pred = this.makeColumnFilterPredicate(col, model);
      if (pred) preds.push(pred);
    }
    const qt = this.gos.quickFilterText;
    if (qt && String(qt).trim()) {
      const parser = this.gos.quickFilterParser;
      const matcher = this.gos.quickFilterMatcher;
      const parts = parser
        ? parser(String(qt))
        : String(qt).trim().toLowerCase().split(/\s+/);
      preds.push(node => {
        const text = this.getQuickFilterText(node);
        return matcher ? matcher(parts, text) : parts.every(p => text.includes(p));
      });
    }
    const extPresent = this.gos.isExternalFilterPresent;
    if (typeof extPresent === 'function' && extPresent({ api: this.api, context: this.gos.context })) {
      const pass = this.gos.doesExternalFilterPass;
      if (typeof pass === 'function') preds.push(node => pass(node));
    }
    this.filterPreds = preds;
    if (!this.groupMode) {
      this.filteredNodes = preds.length ? this.rootNodes.filter(n => preds.every(p => p(n))) : this.rootNodes;
    }
    this.updateFilterActiveFlags();
  }

  updateFilterActiveFlags() {
    this.allColumns.forEach(c => {
      c.filterActive = this.isFilterModelActive(c, this.filterModels.get(c.colId));
    });
  }

  // 그룹 모드 형제 정렬용 비교자 (AG 기본 비교자 + colDef.comparator)
  makeSortComparator() {
    const sortCols = this.allColumns
      .filter(c => c.sort)
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    if (!sortCols.length) return null;
    const accented = !!this.gos.accentedSort;
    return (a, b) => {
      for (const c of sortCols) {
        const desc = c.sort === 'desc';
        const va = this.getCellValue(a, c);
        const vb = this.getCellValue(b, c);
        const cmp = c.colDef.comparator;
        const r = cmp ? cmp(va, vb, a, b, desc) : defaultComparator(va, vb, accented);
        if (r !== 0) return desc ? -r : r;
      }
      return 0;
    };
  }

  getQuickFilterText(node) {
    if (node.__quickFilterText != null && node.__qfVer === this.quickFilterVersion) {
      return node.__quickFilterText;
    }
    const cols = this.gos.includeHiddenColumnsInQuickFilter ? this.allColumns : this.displayedColumns;
    const parts = [];
    for (const c of cols) {
      if (c.isAuto) continue;
      let v = this.getCellValue(node, c);
      const qf = c.colDef.getQuickFilterText;
      if (qf) v = qf({ ...this.makeValueParams(node, c), value: v });
      if (v != null && v !== '') parts.push(String(v).toLowerCase());
    }
    node.__quickFilterText = parts.join('\n');
    node.__qfVer = this.quickFilterVersion;
    return node.__quickFilterText;
  }

  applySort() {
    const sortCols = this.allColumns
      .filter(c => c.sort)
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    if (!sortCols.length) {
      this.sortedNodes = this.filteredNodes;
      return;
    }
    this.sortedNodes = this.keyedSort(this.filteredNodes, sortCols);
    const post = this.gos.postSortRows;
    if (typeof post === 'function') post({ nodes: this.sortedNodes, api: this.api, context: this.gos.context });
  }

  // AG 기본 비교자와 같은 결과(null 은 오름차순 앞, 동률은 원래 순서 유지)를 내는 키 정렬.
  // 컬럼마다 값을 한 번만 읽어 타입별 키 배열로 만든다: 숫자 → Float64Array, 문자열 → 직접 비교,
  // 그 외/colDef.comparator → 일반 비교자. 단일·다중 정렬 공통.
  keyedSort(nodes, sortCols) {
    const n = nodes.length;
    const accented = !!this.gos.accentedSort;
    const NUM = 0;
    const STR = 1;
    const GEN = 2;
    const specs = sortCols.map(col => {
      const desc = col.sort === 'desc';
      const cmp = col.colDef.comparator;
      const vals = new Array(n);
      let allNum = true;
      let allStr = true;
      for (let i = 0; i < n; i++) {
        const v = this.getCellValue(nodes[i], col);
        vals[i] = v;
        if (v == null) continue;
        if (typeof v !== 'number') allNum = false;
        if (typeof v !== 'string') allStr = false;
      }
      const spec = { desc, dir: desc ? -1 : 1, cmp, vals, kind: GEN };
      if (!cmp && allNum) {
        spec.kind = NUM;
        spec.keys = new Float64Array(n);
        spec.nul = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          if (vals[i] == null) spec.nul[i] = 1;
          else spec.keys[i] = vals[i];
        }
      } else if (!cmp && allStr && !accented) {
        // 문자열 → 고유값 순위(정수)로 치환해 숫자 비교 (고유값이 행 수보다 충분히 적을 때 이득)
        const uniq = new Map();
        for (let i = 0; i < n; i++) if (vals[i] != null && !uniq.has(vals[i])) uniq.set(vals[i], 0);
        if (uniq.size < n * 0.5) {
          const sorted = [...uniq.keys()].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
          sorted.forEach((v, r) => uniq.set(v, r));
          spec.kind = NUM;
          spec.keys = new Float64Array(n);
          spec.nul = new Uint8Array(n);
          for (let i = 0; i < n; i++) {
            if (vals[i] == null) spec.nul[i] = 1;
            else spec.keys[i] = uniq.get(vals[i]);
          }
        } else spec.kind = STR;
      }
      return spec;
    });
    const k = specs.length;
    const idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort((a, b) => {
      for (let j = 0; j < k; j++) {
        const s = specs[j];
        if (s.kind === NUM) {
          const na = s.nul[a];
          const nb = s.nul[b];
          if (na || nb) {
            if (na && nb) continue;
            return (na ? -1 : 1) * s.dir;
          }
          const d = s.keys[a] - s.keys[b];
          if (d) return d > 0 ? s.dir : -s.dir;
        } else if (s.kind === STR) {
          const x = s.vals[a];
          const y = s.vals[b];
          if (x === y) continue;
          if (x == null || y == null) return (x == null ? -1 : 1) * s.dir;
          return (x < y ? -1 : 1) * s.dir;
        } else {
          const r = s.cmp
            ? s.cmp(s.vals[a], s.vals[b], nodes[a], nodes[b], s.desc)
            : defaultComparator(s.vals[a], s.vals[b], accented);
          if (r) return s.desc ? -r : r;
        }
      }
      return a - b;
    });
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = nodes[idx[i]];
    return out;
  }

  buildDisplayed() {
    for (const n of this.rootNodes) {
      n.rowIndex = null;
      n.displayed = false;
    }
    const md = !!this.gos.masterDetail;
    let out;
    if (md) {
      out = [];
      for (const n of this.sortedNodes) {
        out.push(n);
        if (n.master && n.expanded) out.push(this.getDetailNode(n));
      }
    } else {
      out = this.sortedNodes === this.rootNodes ? this.rootNodes.slice() : this.sortedNodes;
    }
    for (let i = 0; i < out.length; i++) {
      out[i].rowIndex = i;
      out[i].displayed = true;
    }
    this.displayedNodes = out;
  }

  getPageSize() {
    if (this.gos.paginationAutoPageSize) {
      const h = this.getDefaultRowHeight();
      return Math.max(1, Math.floor((this.bodyHeight || h * 10) / h));
    }
    return this.pageSizeOverride ?? this.gos.paginationPageSize ?? 100;
  }

  // 페이지 단위(행) 시작 rowIndex 목록. null 이면 표시 행 하나하나가 단위.
  // AG 동일: paginateChildRows=false(기본) 면 그룹은 최상위 행, 마스터/디테일은 마스터 행 기준으로 자르고
  // 펼친 자식·상세 행은 부모와 같은 페이지에 둔다.
  getPageUnitStarts() {
    if (this.gos.paginateChildRows) return null;
    if (this.groupMode) {
      const top = this.groupSortedTop || [];
      if (top.length === this.displayedNodes.length) return null;
      const out = [];
      for (const n of top) if (n.displayed) out.push(n.rowIndex);
      return out;
    }
    if (this.gos.masterDetail && this.sortedNodes.length !== this.displayedNodes.length) {
      return this.sortedNodes.map(n => n.rowIndex);
    }
    return null;
  }

  updatePagination() {
    const total = this.displayedNodes.length;
    const units = this.getPageUnitStarts();
    const unitCount = units ? units.length : total;
    this.paginationRowCount = unitCount;
    if (!this.gos.pagination) {
      this.pageFirstRow = 0;
      this.pageLastRow = total;
      this.totalPages = total ? 1 : 0;
      this.currentPage = 0;
      return;
    }
    const size = this.getPageSize();
    this.totalPages = Math.ceil(unitCount / size);
    this.currentPage = clamp(this.currentPage, 0, Math.max(0, this.totalPages - 1));
    if (!unitCount) {
      this.pageFirstRow = 0;
      this.pageLastRow = 0;
      return;
    }
    const firstUnit = this.currentPage * size;
    const nextUnit = (this.currentPage + 1) * size;
    if (!units) {
      this.pageFirstRow = firstUnit;
      this.pageLastRow = Math.min(total, nextUnit);
    } else {
      this.pageFirstRow = units[firstUnit];
      this.pageLastRow = nextUnit < units.length ? units[nextUnit] : total;
    }
  }

  getDefaultRowHeight() {
    return this.gos.rowHeight ?? DEFAULT_ROW_HEIGHT;
  }

  computeRowTops() {
    const def = this.getDefaultRowHeight();
    const getRowHeight = this.gos.getRowHeight;
    const detailH = this.gos.detailRowHeight ?? DEFAULT_DETAIL_ROW_HEIGHT;
    const start = this.pageFirstRow;
    const end = this.pageLastRow;
    const count = end - start;
    let uniform = typeof getRowHeight !== 'function';
    if (uniform) {
      for (let i = start; i < end; i++) {
        const n = this.displayedNodes[i];
        if (n.detail || n.__explicitHeight != null || n.__autoHeight != null) {
          uniform = false;
          break;
        }
      }
    }
    if (uniform) {
      this.uniformRowHeight = def;
      this.rowTops = null;
      this.pageHeight = count * def;
      for (let i = 0; i < count; i++) {
        const n = this.displayedNodes[start + i];
        n.rowTop = i * def;
        n.rowHeight = def;
      }
      return;
    }
    const tops = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) {
      const n = this.displayedNodes[start + i];
      let h;
      if (n.__explicitHeight != null) h = n.__explicitHeight;
      else if (n.detail) h = n.__autoHeight ?? detailH;
      else if (n.__autoHeight != null) h = n.__autoHeight;
      else if (typeof getRowHeight === 'function') {
        h = getRowHeight({ node: n, data: n.data, api: this.api, context: this.gos.context }) ?? def;
      } else h = def;
      n.rowHeight = h;
      n.rowTop = tops[i];
      tops[i + 1] = tops[i] + h;
    }
    this.rowTops = tops;
    this.pageHeight = tops[count];
  }

  onRowHeightChanged() {
    this.computeRowTops();
    this.notify();
  }

  setAutoRowHeight(node, h) {
    if (node.__autoHeight === h) return false;
    node.__autoHeight = h;
    return true;
  }

  getRowCountInPage() {
    return this.pageLastRow - this.pageFirstRow;
  }

  getPageNode(i) {
    return this.displayedNodes[this.pageFirstRow + i];
  }

  rowTopAt(i) {
    return this.rowTops ? this.rowTops[i] : i * this.uniformRowHeight;
  }

  rowHeightAt(i) {
    return this.rowTops ? this.rowTops[i + 1] - this.rowTops[i] : this.uniformRowHeight;
  }

  // 페이지 내 픽셀 → 페이지 내 인덱스
  indexAtPixel(y) {
    const count = this.getRowCountInPage();
    if (!count) return 0;
    if (!this.rowTops) return clamp(Math.floor(y / this.uniformRowHeight), 0, count - 1);
    let lo = 0;
    let hi = count - 1;
    const t = this.rowTops;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (t[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  clampFocusAndRanges() {
    const total = this.displayedNodes.length;
    if (this.focus && !this.focus.rowPinned && this.focus.rowIndex >= total) {
      this.focus = total ? { ...this.focus, rowIndex: total - 1 } : null;
    }
    if (this.ranges.length) {
      this.ranges = this.ranges.filter(r => r.startRowIndex < total && r.endRowIndex < total);
    }
  }

  // ── 필터 api ─────────────────────────────────────────────
  getFilterModel() {
    const out = {};
    for (const [k, v] of this.filterModels) {
      if (this.isFilterModelActive(this.columnById.get(k), v)) out[k] = v;
    }
    return out;
  }

  setFilterModel(model) {
    const prevCustom = [...this.filterModels.keys()].map(k => this.columnById.get(k)).filter(c => this.isCustomFilter(c));
    this.filterModels.clear();
    let custom = false;
    if (model) {
      Object.keys(model).forEach(k => {
        const col = this.getColumn(k);
        if (!col || model[k] == null) return;
        this.filterModels.set(col.colId, model[k]);
        if (this.isCustomFilter(col)) {
          custom = true;
          this.applyCustomFilterModel(col, model[k]);
        }
      });
    }
    // 빠진 커스텀 필터는 null 로 초기화
    prevCustom.forEach(c => {
      if (this.filterModels.has(c.colId)) return;
      custom = true;
      this.applyCustomFilterModel(c, null);
    });
    // 커스텀 필터는 컴포넌트가 새 모델로 렌더된 뒤 적용 (AG 도 비동기)
    if (custom) {
      this.notify();
      this.scheduleFilterChanged('api', []);
    } else this.onFilterChanged('api');
  }

  setColumnFilterModel(key, model, apply = true) {
    const col = this.getColumn(key);
    if (!col) return;
    if (model == null) this.filterModels.delete(col.colId);
    else this.filterModels.set(col.colId, model);
    if (this.isCustomFilter(col)) {
      this.applyCustomFilterModel(col, model ?? null);
      this.notify();
      if (apply) this.scheduleFilterChanged('columnFilter', [col]);
      return;
    }
    if (apply) this.onFilterChanged('columnFilter', [col]);
  }

  getColumnFilterModel(key) {
    const col = this.getColumn(key);
    if (!col) return null;
    return this.filterModels.get(col.colId) ?? null;
  }

  onFilterChanged(source = 'api', columns) {
    this.quickFilterVersion++;
    if (this.isSsrm()) {
      this.updateFilterActiveFlags();
      this.ssrmReset('filter');
    } else this.refreshModel({ resetPage: true });
    this.dispatch('filterChanged', {
      source,
      columns: columns ?? [],
      afterFloatingFilter: false,
      afterDataChange: false,
    });
  }

  isAnyFilterPresent() {
    for (const [k, v] of this.filterModels) if (this.isFilterModelActive(this.columnById.get(k), v)) return true;
    if (this.gos.quickFilterText && String(this.gos.quickFilterText).trim()) return true;
    const ext = this.gos.isExternalFilterPresent;
    return typeof ext === 'function' && !!ext({ api: this.api, context: this.gos.context });
  }

  // Set 필터 목록 (전체 행 기준 고유값)
  getSetFilterValues(column) {
    const cd = column.colDef;
    const fp = cd.filterParams || {};
    if (Array.isArray(fp.values)) {
      return fp.values.map(v => ({ key: setFilterKey(v, fp, { colDef: cd, column }), value: v }));
    }
    const map = new Map();
    for (const node of this.rootNodes) {
      const v = cd.filterValueGetter
        ? typeof cd.filterValueGetter === 'function'
          ? cd.filterValueGetter(this.makeValueParams(node, column))
          : getFieldValue(node.data, cd.filterValueGetter)
        : this.getCellValue(node, column);
      const add = x => {
        const key = setFilterKey(x, fp, { node, data: node.data, colDef: cd, column });
        if (!map.has(key)) map.set(key, x);
      };
      if (Array.isArray(v)) {
        if (!v.length) add(null);
        else v.forEach(add);
      } else add(v);
    }
    const entries = [...map.entries()].map(([key, value]) => ({ key, value }));
    const cmp = fp.comparator;
    entries.sort((a, b) => {
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      if (cmp) return cmp(a.value, b.value);
      if (typeof a.value === 'number' && typeof b.value === 'number') return a.value - b.value;
      return defaultComparator(a.key, b.key, false);
    });
    return entries;
  }

  formatSetFilterLabel(column, entry) {
    if (entry.key === null) return localeText(this, 'blanks');
    const fp = column.colDef.filterParams || {};
    const p = {
      value: entry.value,
      colDef: column.colDef,
      column,
      api: this.api,
      context: this.gos.context,
      node: null,
      data: null,
    };
    if (typeof fp.valueFormatter === 'function') {
      const r = fp.valueFormatter(p);
      if (r != null) return String(r);
    }
    return toText(entry.value);
  }

  // ── 정렬 api ─────────────────────────────────────────────
  toggleColumnSort(column, multi, source = 'uiColumnSorted') {
    const order = column.colDef.sortingOrder ?? this.gos.sortingOrder ?? ['asc', 'desc', null];
    const cur = column.sort ?? null;
    const idx = order.indexOf(cur);
    const next = order[(idx + 1) % order.length] ?? null;
    this.setColumnSort(column, next, multi || !!this.gos.alwaysMultiSort, source);
  }

  setColumnSort(column, sort, multi, source = 'api') {
    if (!multi) {
      this.allColumns.forEach(c => {
        if (c !== column) {
          c.sort = null;
          c.sortIndex = null;
        }
      });
    }
    const wasSorted = !!column.sort;
    column.sort = sort || null;
    if (column.sort && (!wasSorted || !multi)) column.sortIndex = multi ? 1e9 : 0;
    const sorted = this.allColumns
      .filter(c => c.sort)
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    sorted.forEach((c, i) => {
      c.sortIndex = i;
    });
    if (!column.sort) column.sortIndex = null;
    if (this.isSsrm()) this.ssrmReset('sort');
    else this.refreshModel({ skipFilter: true });
    this.dispatch('sortChanged', { source, columns: [column] });
  }

  // ── 선택 ─────────────────────────────────────────────────
  updateSelectable(node) {
    const rs = this.rsOpts;
    const fn = rs?.isRowSelectable;
    node.selectable = !!rs && !node.detail && (typeof fn === 'function' ? !!fn(node) : true);
  }

  updateSelectableAll() {
    let count = 0;
    for (const n of this.rootNodes) {
      this.updateSelectable(n);
      if (n.selectable) count++;
    }
    this.selectableCount = count;
  }

  getSelectedNodes() {
    return [...this.selected.values()];
  }

  getSelectedRows() {
    return this.getSelectedNodes().map(n => n.data);
  }

  setNodeSelected(node, value, clearOthers = false, source = 'api', event) {
    if (!node || node.detail || node.rowPinned || node.stub) return 0;
    if (value && !this.rsOpts) return 0;
    if (value && !node.selectable) return 0;
    const changed = [];
    if (value && (clearOthers || this.rsOpts?.mode === 'singleRow')) {
      for (const [id, n] of [...this.selected]) {
        if (n !== node) {
          n.selected = false;
          this.selected.delete(id);
          changed.push(n);
        }
      }
    }
    if (node.selected !== value) {
      node.selected = value;
      if (value) this.selected.set(node.id, node);
      else this.selected.delete(node.id);
      changed.push(node);
    }
    if (value) this.lastSelectedNode = node;
    if (changed.length) this.afterSelectionChange(changed, source, event);
    return changed.length;
  }

  setNodesSelected(nodes, value, source = 'api') {
    if (!nodes?.length) return;
    if (value && this.rsOpts?.mode === 'singleRow' && nodes.length > 1) nodes = [nodes[0]];
    const changed = [];
    if (value && this.rsOpts?.mode === 'singleRow') {
      for (const [id, n] of [...this.selected]) {
        if (!nodes.includes(n)) {
          n.selected = false;
          this.selected.delete(id);
          changed.push(n);
        }
      }
    }
    nodes.forEach(n => {
      if (!n || n.detail) return;
      if (value && !n.selectable) return;
      if (n.selected === value) return;
      n.selected = value;
      if (value) this.selected.set(n.id, n);
      else this.selected.delete(n.id);
      changed.push(n);
    });
    if (value && nodes.length) this.lastSelectedNode = nodes[nodes.length - 1];
    if (changed.length) this.afterSelectionChange(changed, source);
  }

  afterSelectionChange(changed, source, event) {
    this.selectionVersion = (this.selectionVersion || 0) + 1;
    changed.forEach(n => {
      this.dispatch('rowSelected', {
        node: n,
        data: n.data,
        rowIndex: n.rowIndex,
        rowPinned: n.rowPinned,
        source,
        event,
      });
      n.__dispatchLocal('rowSelected', {});
    });
    this.dispatch('selectionChanged', { source, selectedNodes: this.getSelectedNodes() });
    this.notify();
  }

  selectAllNodes(mode = 'all', source = 'apiSelectAll') {
    if (!this.rsOpts || this.rsOpts.mode !== 'multiRow') return;
    const nodes =
      mode === 'filtered' ? this.filteredNodes : mode === 'currentPage' ? this.getPageMasters() : this.rootNodes;
    const changed = [];
    for (const n of nodes) {
      if (!n.selected && n.selectable) {
        n.selected = true;
        this.selected.set(n.id, n);
        changed.push(n);
      }
    }
    if (changed.length) this.afterSelectionChange(changed, source);
  }

  deselectAllNodes(mode = 'all', source = 'apiSelectAll') {
    const scope =
      mode === 'filtered'
        ? new Set(this.filteredNodes)
        : mode === 'currentPage'
          ? new Set(this.getPageMasters())
          : null;
    const changed = [];
    for (const [id, n] of [...this.selected]) {
      if (scope && !scope.has(n)) continue;
      n.selected = false;
      this.selected.delete(id);
      changed.push(n);
    }
    if (changed.length) this.afterSelectionChange(changed, source);
  }

  getPageMasters() {
    const out = [];
    for (let i = this.pageFirstRow; i < this.pageLastRow; i++) {
      const n = this.displayedNodes[i];
      if (!n.detail) out.push(n);
    }
    return out;
  }

  // shift 클릭: 마지막 선택 행 ~ 현재 행 범위 선택
  selectRangeTo(node, keepOthers, source) {
    const from = this.lastSelectedNode;
    if (!from || from.rowIndex == null || node.rowIndex == null) {
      this.setNodeSelected(node, true, !keepOthers, source);
      return;
    }
    const a = Math.min(from.rowIndex, node.rowIndex);
    const b = Math.max(from.rowIndex, node.rowIndex);
    const inRange = [];
    for (let i = a; i <= b; i++) {
      const n = this.displayedNodes[i];
      if (n && !n.detail) inRange.push(n);
    }
    const changed = [];
    if (!keepOthers) {
      const set = new Set(inRange);
      for (const [id, n] of [...this.selected]) {
        if (!set.has(n)) {
          n.selected = false;
          this.selected.delete(id);
          changed.push(n);
        }
      }
    }
    inRange.forEach(n => {
      if (!n.selected && n.selectable) {
        n.selected = true;
        this.selected.set(n.id, n);
        changed.push(n);
      }
    });
    if (changed.length) this.afterSelectionChange(changed, source);
  }

  handleRowClickSelection(node, event) {
    const rs = this.rsOpts;
    if (!rs || !node || node.detail || node.rowPinned || node.stub) return;
    const ecs = rs.enableClickSelection;
    if (!ecs) return;
    const canSelect = ecs === true || ecs === 'enableSelection';
    const canDeselect = ecs === true || ecs === 'enableDeselection';
    const ctrl = event?.ctrlKey || event?.metaKey;
    const shift = event?.shiftKey;
    if (node.group && this.isGroupSelectsDescendants()) {
      const st = this.getGroupSelectionState(node);
      if (st === true ? canDeselect : canSelect) this.setGroupSelected(node, st !== true, 'rowClicked');
      return;
    }
    if (rs.mode === 'multiRow') {
      if (shift && this.lastSelectedNode && canSelect) {
        this.selectRangeTo(node, !!ctrl, 'rowClicked');
        return;
      }
      if (rs.enableSelectionWithoutKeys || ctrl) {
        if (node.selected) {
          if (canDeselect) this.setNodeSelected(node, false, false, 'rowClicked', event);
        } else if (canSelect) this.setNodeSelected(node, true, false, 'rowClicked', event);
        return;
      }
      if (canSelect) {
        if (node.selected && this.selected.size === 1) return;
        this.setNodeSelected(node, true, true, 'rowClicked', event);
      }
      return;
    }
    if (node.selected) {
      if (ctrl && canDeselect) this.setNodeSelected(node, false, false, 'rowClicked', event);
    } else if (canSelect) this.setNodeSelected(node, true, true, 'rowClicked', event);
  }

  handleCheckboxClick(node, event) {
    const rs = this.rsOpts;
    if (!rs || !node || node.rowPinned || node.stub) return;
    if (node.group && this.isGroupSelectsDescendants()) {
      this.setGroupSelected(node, this.getGroupSelectionState(node) !== true, 'checkboxSelected');
      return;
    }
    if (!node.selectable) return;
    if (rs.mode === 'multiRow' && event?.shiftKey && this.lastSelectedNode) {
      this.selectRangeTo(node, true, 'checkboxSelected');
      return;
    }
    if (node.selected) this.setNodeSelected(node, false, false, 'checkboxSelected', event);
    else this.setNodeSelected(node, true, rs.mode === 'singleRow', 'checkboxSelected', event);
  }

  // 헤더 체크박스 상태: true | false | null(일부)
  getHeaderCheckboxState() {
    const rs = this.rsOpts;
    if (!rs) return false;
    const mode = rs.selectAll;
    if (mode === 'all') {
      const sel = this.selected.size;
      if (!sel) return false;
      return sel >= this.selectableCount ? true : null;
    }
    const nodes = mode === 'filtered' ? this.filteredNodes : this.getPageMasters();
    let sel = 0;
    let selectable = 0;
    for (const n of nodes) {
      if (!n.selectable) continue;
      selectable++;
      if (n.selected) sel++;
    }
    if (!sel) return false;
    return sel >= selectable ? true : null;
  }

  toggleHeaderCheckbox() {
    const rs = this.rsOpts;
    if (!rs) return;
    const state = this.getHeaderCheckboxState();
    if (state === true) this.deselectAllNodes(rs.selectAll, 'uiSelectAll');
    else this.selectAllNodes(rs.selectAll, 'uiSelectAll');
  }

  // ── 포커스 ───────────────────────────────────────────────
  setFocusedCell(rowIndex, colKey, opts = {}) {
    const col = this.getColumn(colKey);
    const rowPinned = opts.rowPinned || null;
    const limit = rowPinned === 'top' ? this.pinnedTop.length : rowPinned === 'bottom' ? this.pinnedBottom.length : this.displayedNodes.length;
    if (!col || rowIndex == null || rowIndex < 0 || rowIndex >= limit) return;
    const prev = this.focus;
    if (prev && prev.rowIndex === rowIndex && prev.colId === col.colId && (prev.rowPinned || null) === rowPinned) return;
    this.focus = { rowIndex, colId: col.colId, rowPinned };
    this.notify();
    this.dispatch('cellFocused', {
      rowIndex,
      column: col,
      rowPinned,
      forceBrowserFocus: !!opts.forceBrowserFocus,
      isFullWidthCell: false,
      floating: rowPinned,
    });
  }

  getFocusedCell() {
    if (!this.focus) return null;
    return { rowIndex: this.focus.rowIndex, column: this.getColumn(this.focus.colId), rowPinned: this.focus.rowPinned || null };
  }

  isCellFocused(node, colId) {
    const f = this.focus;
    return !!f && f.rowIndex === node.rowIndex && f.colId === colId && (f.rowPinned || null) === (node.rowPinned || null);
  }

  clearFocusedCell() {
    if (!this.focus) return;
    this.focus = null;
    this.notify();
  }

  // ── 셀 범위 선택 ──────────────────────────────────────────
  rangeStart(rowIndex, colId, { shift = false, ctrl = false } = {}) {
    const cs = this.cellSelectionOpts;
    if (!cs) return;
    if (shift && this.ranges.length) {
      const r = this.ranges[this.ranges.length - 1];
      r.endRowIndex = rowIndex;
      r.endColId = colId;
    } else {
      const keep = ctrl && !cs.suppressMultiRanges;
      if (!keep) this.ranges = [];
      this.ranges.push({
        id: `range_${++this.rangeSeq}`,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex,
        startColId: colId,
        endColId: colId,
      });
    }
    this.rangeDragging = true;
    this.notify();
    this.dispatchRangeChanged(true, false);
  }

  rangeExtend(rowIndex, colId) {
    if (!this.rangeDragging || !this.ranges.length) return;
    const r = this.ranges[this.ranges.length - 1];
    if (r.endRowIndex === rowIndex && r.endColId === colId) return;
    r.endRowIndex = rowIndex;
    r.endColId = colId;
    this.notify();
    this.dispatchRangeChanged(false, false);
  }

  rangeEnd() {
    if (!this.rangeDragging) return;
    this.rangeDragging = false;
    this.dispatchRangeChanged(false, true);
  }

  dispatchRangeChanged(started, finished) {
    const p = { started, finished, id: this.ranges[this.ranges.length - 1]?.id };
    this.dispatch('cellSelectionChanged', p);
    this.dispatch('rangeSelectionChanged', p);
  }

  setSingleRange(rowIndex, colId) {
    if (!this.cellSelectionOpts) return;
    this.ranges = [
      {
        id: `range_${++this.rangeSeq}`,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex,
        startColId: colId,
        endColId: colId,
      },
    ];
    this.notify();
    this.dispatchRangeChanged(true, true);
  }

  clearRanges() {
    if (!this.ranges.length) return;
    this.ranges = [];
    this.notify();
    this.dispatchRangeChanged(false, true);
  }

  // 범위 → 표시 컬럼 인덱스 경계
  rangeBounds(r) {
    const a = this.displayedIndex.get(r.startColId);
    const b = this.displayedIndex.get(r.endColId);
    if (a == null || b == null) return null;
    return {
      r0: Math.min(r.startRowIndex, r.endRowIndex),
      r1: Math.max(r.startRowIndex, r.endRowIndex),
      c0: Math.min(a, b),
      c1: Math.max(a, b),
    };
  }

  rangeColumns(r) {
    const b = this.rangeBounds(r);
    if (!b) return [];
    return this.displayedColumns.slice(b.c0, b.c1 + 1);
  }

  // 렌더 단계용 범위 경계 캐시
  getRangeBoundsList() {
    if (this.__rbVersion === this.version) return this.__rbList;
    this.__rbList = this.ranges.map(r => this.rangeBounds(r)).filter(Boolean);
    this.__rbVersion = this.version;
    return this.__rbList;
  }

  cellRangeInfo(rowIndex, colId) {
    const list = this.getRangeBoundsList();
    if (!list.length) return null;
    const ci = this.displayedIndex.get(colId);
    if (ci == null) return null;
    let count = 0;
    let top = false;
    let bottom = false;
    let left = false;
    let right = false;
    let single = false;
    for (const b of list) {
      if (rowIndex < b.r0 || rowIndex > b.r1 || ci < b.c0 || ci > b.c1) continue;
      count++;
      if (b.r0 === b.r1 && b.c0 === b.c1) single = true;
      if (rowIndex === b.r0) top = true;
      if (rowIndex === b.r1) bottom = true;
      if (ci === b.c0) left = true;
      if (ci === b.c1) right = true;
    }
    if (!count) return null;
    return { count, top, bottom, left, right, single: single && count === 1 };
  }

  getCellRanges() {
    return this.ranges
      .map(r => {
        const columns = this.rangeColumns(r);
        if (!columns.length) return null;
        return {
          id: r.id,
          type: 'value',
          startRow: { rowIndex: r.startRowIndex, rowPinned: null },
          endRow: { rowIndex: r.endRowIndex, rowPinned: null },
          columns,
          startColumn: this.getColumn(r.startColId),
        };
      })
      .filter(Boolean);
  }

  addCellRange(params) {
    if (!this.cellSelectionOpts) return;
    const cols = params.columns
      ? this.getColumnsFromKeys(params.columns)
      : [this.getColumn(params.columnStart), this.getColumn(params.columnEnd)].filter(Boolean);
    if (!cols.length) return;
    const idxs = cols.map(c => this.displayedIndex.get(c.colId)).filter(i => i != null);
    if (!idxs.length) return;
    this.ranges.push({
      id: `range_${++this.rangeSeq}`,
      startRowIndex: params.rowStartIndex ?? 0,
      endRowIndex: params.rowEndIndex ?? params.rowStartIndex ?? 0,
      startColId: this.displayedColumns[Math.min(...idxs)].colId,
      endColId: this.displayedColumns[Math.max(...idxs)].colId,
    });
    this.notify();
    this.dispatchRangeChanged(true, true);
  }

  // 행번호 클릭 → 행 전체 범위
  selectRowAsRange(rowIndex, shift) {
    if (!this.cellSelectionOpts || !this.displayedColumns.length) return;
    const first = this.displayedColumns.find(c => !c.isAuto) || this.displayedColumns[0];
    const last = this.displayedColumns[this.displayedColumns.length - 1];
    if (shift && this.ranges.length) {
      const r = this.ranges[this.ranges.length - 1];
      r.endRowIndex = rowIndex;
      r.startColId = first.colId;
      r.endColId = last.colId;
    } else {
      this.ranges = [
        {
          id: `range_${++this.rangeSeq}`,
          startRowIndex: rowIndex,
          endRowIndex: rowIndex,
          startColId: first.colId,
          endColId: last.colId,
        },
      ];
    }
    this.focus = { rowIndex, colId: first.colId };
    this.notify();
    this.dispatchRangeChanged(true, true);
  }

  // ── 편집 ─────────────────────────────────────────────────
  resolveEditor(node, column) {
    const cd = column.colDef;
    const params = { ...this.makeValueParams(node, column), value: this.getCellValue(node, column) };
    const sel = typeof cd.cellEditorSelector === 'function' ? cd.cellEditorSelector(params) : null;
    let comp = sel?.component ?? cd.cellEditor;
    const rawParams = sel?.params ?? cd.cellEditorParams;
    const editorParams = (typeof rawParams === 'function' ? rawParams(params) : rawParams) || {};
    let popup = sel?.popup ?? cd.cellEditorPopup;
    if (!comp || comp === true) {
      const t = column.dataType;
      if (t === 'number') comp = 'agNumberCellEditor';
      else if (t === 'boolean') comp = 'agCheckboxCellEditor';
      else if (t === 'date') comp = 'agDateCellEditor';
      else if (t === 'dateString') comp = 'agDateStringCellEditor';
      else comp = 'agTextCellEditor';
    }
    if (typeof comp === 'string') {
      const registered = this.gos.components?.[comp];
      if (registered) comp = registered;
    }
    if (comp === 'agRichSelectCellEditor' || comp === 'agLargeTextCellEditor') popup = popup ?? true;
    return {
      comp,
      params: editorParams,
      popup: !!popup,
      popupPosition: sel?.popupPosition ?? cd.cellEditorPopupPosition ?? 'over',
    };
  }

  // 셀 1개의 편집 상태
  makeCellEditor(node, column, eventKey) {
    const value = this.getCellValue(node, column);
    const ed = {
      node,
      column,
      colId: column.colId,
      rowIndex: node.rowIndex,
      value,
      startValue: value,
      eventKey,
      editor: this.resolveEditor(node, column),
      valueChanged: false,
      ref: { current: null },
      hooks: {},
    };
    ed.setValue = v => {
      ed.value = v;
      ed.valueChanged = true;
    };
    return ed;
  }

  // editing = 행 단위 (editType:'fullRow' 면 편집 가능한 모든 셀, 아니면 1셀)
  startEdit(node, column, eventKey = null, source = 'ui') {
    if (!node || !column) return false;
    const cur = this.editing;
    if (cur) {
      if (cur.node === node && cur.cells.has(column.colId)) {
        cur.primary = cur.cells.get(column.colId);
        cur.column = column;
        cur.colId = column.colId;
        this.focus = { rowIndex: node.rowIndex, colId: column.colId, rowPinned: node.rowPinned || null };
        this.notify();
        return true;
      }
      this.stopEditing(false);
    }
    if (!this.isCellEditable(column, node)) return false;
    const fullRow = this.gos.editType === 'fullRow';
    const cells = new Map();
    if (fullRow) {
      for (const c of this.displayedColumns) {
        if (this.isCellEditable(c, node)) cells.set(c.colId, this.makeCellEditor(node, c, c === column ? eventKey : null));
      }
    } else {
      cells.set(column.colId, this.makeCellEditor(node, column, eventKey));
    }
    const editing = {
      node,
      column,
      colId: column.colId,
      rowIndex: node.rowIndex,
      fullRow,
      cells,
      primary: cells.get(column.colId),
      source,
    };
    // 단일 셀 시절 코드 호환 (editing.editor / ref / hooks / value)
    Object.defineProperties(editing, {
      editor: { get: () => editing.primary.editor },
      ref: { get: () => editing.primary.ref },
      hooks: { get: () => editing.primary.hooks },
      value: { get: () => editing.primary.value },
    });
    this.editing = editing;
    this.focus = { rowIndex: node.rowIndex, colId: column.colId, rowPinned: node.rowPinned || null };
    this.notify();
    if (fullRow) this.dispatch('rowEditingStarted', this.rowEventParams(node));
    for (const c of cells.values()) this.dispatch('cellEditingStarted', this.cellEventParams(node, c.column));
    return true;
  }

  rowEventParams(node, event) {
    return { node, data: node.data, rowIndex: node.rowIndex, rowPinned: node.rowPinned, event };
  }

  getEditingCell(node, column) {
    const e = this.editing;
    if (!e || e.node !== node) return null;
    return e.cells.get(column.colId) || null;
  }

  setEditorValue(v, cellEd) {
    const e = cellEd || this.editing?.primary;
    if (!e) return;
    e.value = v;
    e.valueChanged = true;
    this.notify();
  }

  // 내장 에디터는 자체 state 로 입력을 그리므로 재렌더 없이 값만 기록
  setEditorValueSilently(v, cellEd) {
    const e = cellEd || this.editing?.primary;
    if (!e) return;
    e.value = v;
    e.valueChanged = true;
  }

  // 셀 편집 결과 반영 → cellEditingStopped 파라미터 반환
  commitCellEditor(ed, cancel) {
    const inst = ed.ref.current;
    let newValue = ed.value;
    if (!ed.valueChanged && inst && typeof inst.getValue === 'function') newValue = inst.getValue();
    const cancelAfterEnd = !cancel && (!!inst?.isCancelAfterEnd?.() || !!ed.hooks.isCancelAfterEnd?.());
    const { node, column } = ed;
    const oldValue = ed.startValue;
    let valueChanged = false;
    const cancelled = cancel || cancelAfterEnd;
    // 원래 값이 비어있고 입력도 비어있으면 원래 값 유지 (AG TextCellEditor.getValue 규칙)
    if (newValue === '' && oldValue == null) newValue = oldValue;
    if (!cancelled && newValue !== oldValue) {
      const cd = column.colDef;
      if (cd.valueParser) {
        const p = { ...this.makeValueParams(node, column), oldValue, newValue };
        newValue = typeof cd.valueParser === 'function' ? cd.valueParser(p) : evaluateExpression(cd.valueParser, p);
      } else if (column.dataType === 'text' && newValue === '') {
        newValue = null;
      }
      if (this.gos.readOnlyEdit) {
        this.dispatch('cellEditRequest', {
          ...this.cellEventParams(node, column),
          oldValue,
          newValue,
          value: newValue,
          source: 'edit',
        });
      } else {
        valueChanged = this.setCellValue(node, column, newValue, 'edit', oldValue);
      }
    }
    return {
      valueChanged,
      params: {
        ...this.cellEventParams(node, column),
        oldValue,
        newValue: cancelled ? oldValue : newValue,
        valueChanged,
      },
    };
  }

  stopEditing(cancel = false) {
    const ed = this.editing;
    if (!ed) return;
    this.editing = null;
    const results = [];
    this.beginUndoBatch();
    for (const c of ed.cells.values()) results.push(this.commitCellEditor(c, cancel));
    this.endUndoBatch();
    this.notify();
    for (const r of results) this.dispatch('cellEditingStopped', r.params);
    if (ed.fullRow) {
      this.dispatch('rowEditingStopped', this.rowEventParams(ed.node));
      if (!cancel && results.some(r => r.valueChanged)) this.dispatch('rowValueChanged', this.rowEventParams(ed.node));
    }
    this.focusGrid();
  }

  // fullRow 편집 중 Tab: 같은 행의 다음 편집 셀로 이동
  tabWithinEditingRow(backwards) {
    const ed = this.editing;
    const ids = [...ed.cells.keys()];
    if (ids.length < 2) return false;
    const i = ids.indexOf(ed.primary.colId);
    const next = ids[(i + (backwards ? -1 : 1) + ids.length) % ids.length];
    ed.primary = ed.cells.get(next);
    ed.column = ed.primary.column;
    ed.colId = next;
    this.focus = { rowIndex: ed.node.rowIndex, colId: next, rowPinned: ed.node.rowPinned || null };
    this.ensureColumnVisible(next);
    this.notify();
    const rowSel = ed.node.rowPinned ? `[row-index="${ed.node.rowPinned[0]}-${ed.node.rowIndex}"]` : `[row-index="${ed.node.rowIndex}"]`;
    setTimeout(() => {
      const cell = this.eRoot?.querySelector(`.r2-row${rowSel} .r2-cell[col-id="${CSS.escape(next)}"]`);
      cell?.querySelector('input,textarea,select,[tabindex]')?.focus({ preventScroll: true });
    }, 0);
    return true;
  }

  focusGrid() {
    const el = this.eFocusSink;
    if (el && document.activeElement !== el) {
      // 그리드 밖으로 포커스가 나간 경우엔 뺏지 않는다
      if (!this.eRoot || !document.activeElement || this.eRoot.contains(document.activeElement) || document.activeElement === document.body) {
        el.focus({ preventScroll: true });
      }
    }
  }

  // ── 키보드 ───────────────────────────────────────────────
  navigableColumns() {
    return this.displayedColumns.filter(c => !c.colDef.suppressNavigable);
  }

  moveFocusTo(rowIndex, colId, { extendRange = false } = {}) {
    rowIndex = clamp(rowIndex, this.pageFirstRow, Math.max(this.pageFirstRow, this.pageLastRow - 1));
    const prevFocus = this.focus;
    this.focus = { rowIndex, colId, rowPinned: null };
    if (this.cellSelectionOpts) {
      if (extendRange && this.ranges.length) {
        const r = this.ranges[this.ranges.length - 1];
        r.endRowIndex = rowIndex;
        r.endColId = colId;
        this.focus = prevFocus;
      } else {
        this.ranges = [
          {
            id: `range_${++this.rangeSeq}`,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex,
            startColId: colId,
            endColId: colId,
          },
        ];
      }
      this.dispatchRangeChanged(true, true);
    }
    const target = extendRange && this.ranges.length ? this.ranges[this.ranges.length - 1] : null;
    const scrollRow = target ? target.endRowIndex : rowIndex;
    const scrollCol = target ? target.endColId : colId;
    this.ensureIndexVisible(scrollRow);
    this.ensureColumnVisible(scrollCol);
    this.notify();
    if (!extendRange) {
      this.dispatch('cellFocused', {
        rowIndex,
        column: this.getColumn(colId),
        rowPinned: null,
        forceBrowserFocus: true,
        isFullWidthCell: false,
        floating: null,
      });
    }
  }

  visibleRowCount() {
    const h = this.viewport?.getClientHeight?.() || this.bodyHeight || 400;
    return Math.max(1, Math.floor(h / this.getDefaultRowHeight()));
  }

  // 그리드 키 입력 처리. 처리했으면 true
  handleKeyDown(e) {
    const ed = this.editing;
    const key = e.key;
    if (ed) {
      const node = ed.node;
      const column = ed.column;
      this.dispatch('cellKeyDown', { ...this.cellEventParams(node, column, e), event: e });
      if (column.colDef.suppressKeyboardEvent?.({ event: e, node, column, colDef: column.colDef, editing: true, api: this.api, context: this.gos.context })) return false;
      if (key === 'Escape') {
        this.stopEditing(true);
        return true;
      }
      if (key === 'Enter' && !e.shiftKey && !ed.editor.handlesEnter) {
        this.stopEditing(false);
        if (this.gos.enterNavigatesVerticallyAfterEdit) {
          this.moveFocusTo(this.nextRowIndex(node.rowIndex, 1), column.colId);
        }
        return true;
      }
      if (key === 'Tab') {
        if (ed.fullRow && this.tabWithinEditingRow(e.shiftKey)) return true;
        this.stopEditing(false);
        this.tabToNextEditable(node, column, e.shiftKey);
        return true;
      }
      return false;
    }

    const focus = this.focus;
    const node = this.getFocusNode();
    const column = focus ? this.getColumn(focus.colId) : null;
    if (node && column) {
      this.dispatch('cellKeyDown', { ...this.cellEventParams(node, column, e), event: e });
      if (column.colDef.suppressKeyboardEvent?.({ event: e, node, column, colDef: column.colDef, editing: false, api: this.api, context: this.gos.context })) return false;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const lower = key.toLowerCase();

    // Ctrl+C / X / V 는 브라우저 copy·cut·paste 이벤트에서 처리 (clipboardData 직접 기록 — 권한 불필요)
    if (ctrl && (lower === 'c' || lower === 'x' || lower === 'v')) return false;
    if (ctrl && this.undoEnabled() && (lower === 'z' || lower === 'y')) {
      if (lower === 'y' || e.shiftKey) this.redoCellEditing('ui');
      else this.undoCellEditing('ui');
      return true;
    }
    if (ctrl && lower === 'a') {
      if (this.cellSelectionOpts && this.displayedColumns.length && this.getRowCountInPage()) {
        this.ranges = [
          {
            id: `range_${++this.rangeSeq}`,
            startRowIndex: this.pageFirstRow,
            endRowIndex: this.pageLastRow - 1,
            startColId: this.displayedColumns[0].colId,
            endColId: this.displayedColumns[this.displayedColumns.length - 1].colId,
          },
        ];
        this.notify();
        this.dispatchRangeChanged(true, true);
        return true;
      }
      return false;
    }
    if (!focus || !node || !column) return false;

    const cols = this.navigableColumns();
    const ci = Math.max(0, cols.findIndex(c => c.colId === column.colId));
    const shift = e.shiftKey && !!this.cellSelectionOpts;
    const curEnd = shift && this.ranges.length ? this.ranges[this.ranges.length - 1] : null;
    const baseRow = curEnd ? curEnd.endRowIndex : focus.rowIndex;
    const baseColIdx = curEnd ? Math.max(0, cols.findIndex(c => c.colId === curEnd.endColId)) : ci;
    const first = this.pageFirstRow;
    const last = this.pageLastRow - 1;
    const hasBody = this.getRowCountInPage() > 0;

    // 고정 행에서의 이동
    if (focus.rowPinned) {
      const pos = focus.rowPinned;
      const list = pos === 'top' ? this.pinnedTop : this.pinnedBottom;
      const colAt = i => cols[clamp(i, 0, cols.length - 1)].colId;
      switch (key) {
        case 'ArrowLeft':
          this.focusPinned(pos, focus.rowIndex, colAt(ctrl ? 0 : ci - 1));
          return true;
        case 'ArrowRight':
          this.focusPinned(pos, focus.rowIndex, colAt(ctrl ? cols.length - 1 : ci + 1));
          return true;
        case 'Tab':
          if ((e.shiftKey && ci === 0) || (!e.shiftKey && ci === cols.length - 1)) return false;
          this.focusPinned(pos, focus.rowIndex, colAt(ci + (e.shiftKey ? -1 : 1)));
          return true;
        case 'ArrowDown':
          if (focus.rowIndex < list.length - 1) this.focusPinned(pos, focus.rowIndex + 1, column.colId);
          else if (pos === 'top' && hasBody) this.moveFocusTo(first, column.colId);
          return true;
        case 'ArrowUp':
          if (focus.rowIndex > 0) this.focusPinned(pos, focus.rowIndex - 1, column.colId);
          else if (pos === 'bottom' && hasBody) this.moveFocusTo(last, column.colId);
          return true;
        default:
          break;
      }
    }

    const pinnedNav =
      focus.rowPinned && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', 'Tab'].includes(key);
    switch (pinnedNav ? '' : key) {
      case 'ArrowDown':
        if (!ctrl && !shift && baseRow >= last && this.pinnedBottom.length) {
          this.focusPinned('bottom', 0, cols[baseColIdx].colId);
          return true;
        }
        this.moveFocusTo(ctrl ? last : this.nextRowIndex(baseRow, 1), cols[baseColIdx].colId, { extendRange: shift });
        return true;
      case 'ArrowUp':
        if (!ctrl && !shift && baseRow <= first && this.pinnedTop.length) {
          this.focusPinned('top', this.pinnedTop.length - 1, cols[baseColIdx].colId);
          return true;
        }
        this.moveFocusTo(ctrl ? first : this.nextRowIndex(baseRow, -1), cols[baseColIdx].colId, { extendRange: shift });
        return true;
      case 'ArrowRight':
        this.moveFocusTo(baseRow, cols[ctrl ? cols.length - 1 : Math.min(cols.length - 1, baseColIdx + 1)].colId, { extendRange: shift });
        return true;
      case 'ArrowLeft':
        this.moveFocusTo(baseRow, cols[ctrl ? 0 : Math.max(0, baseColIdx - 1)].colId, { extendRange: shift });
        return true;
      case 'PageDown':
        this.moveFocusTo(Math.min(last, baseRow + this.visibleRowCount()), cols[baseColIdx].colId, { extendRange: shift });
        return true;
      case 'PageUp':
        this.moveFocusTo(Math.max(first, baseRow - this.visibleRowCount()), cols[baseColIdx].colId, { extendRange: shift });
        return true;
      case 'Home':
        this.moveFocusTo(ctrl ? first : baseRow, cols[0].colId, { extendRange: shift });
        return true;
      case 'End':
        this.moveFocusTo(ctrl ? last : baseRow, cols[cols.length - 1].colId, { extendRange: shift });
        return true;
      case 'Tab': {
        const dir = e.shiftKey ? -1 : 1;
        let nci = ci + dir;
        let row = focus.rowIndex;
        if (nci >= cols.length) {
          if (row >= last) return false;
          nci = 0;
          row = this.nextRowIndex(row, 1);
        } else if (nci < 0) {
          if (row <= first) return false;
          nci = cols.length - 1;
          row = this.nextRowIndex(row, -1);
        }
        this.moveFocusTo(row, cols[nci].colId);
        return true;
      }
      case 'Enter':
        if (this.gos.enterNavigatesVertically) {
          this.moveFocusTo(this.nextRowIndex(focus.rowIndex, e.shiftKey ? -1 : 1), column.colId);
          return true;
        }
        if (this.isCellEditable(column, node)) {
          this.startEdit(node, column, 'Enter');
          return true;
        }
        if (node.master) {
          node.setExpanded(!node.expanded);
          return true;
        }
        return false;
      case 'F2':
        if (this.isCellEditable(column, node)) {
          this.startEdit(node, column, 'F2');
          return true;
        }
        return false;
      case ' ':
        if (this.rsOpts && !this.isCellEditable(column, node)) {
          this.handleCheckboxClick(node, e);
          return true;
        }
        break;
      case 'Delete':
        if (this.cellSelectionOpts && this.ranges.length) {
          this.clearRangeCells();
          return true;
        }
        if (this.isCellEditable(column, node)) {
          this.writeCell(node, column, null, 'cellClear');
          return true;
        }
        return false;
      case 'Backspace':
        if (this.isCellEditable(column, node)) {
          this.startEdit(node, column, 'Backspace');
          return true;
        }
        return false;
      default:
        break;
    }
    if (isPrintableKey(e) && this.isCellEditable(column, node)) {
      this.startEdit(node, column, key);
      return true;
    }
    return false;
  }

  nextRowIndex(from, dir) {
    let i = from + dir;
    while (i >= this.pageFirstRow && i < this.pageLastRow && this.displayedNodes[i]?.detail) i += dir;
    return clamp(i, this.pageFirstRow, this.pageLastRow - 1);
  }

  tabToNextEditable(node, column, backwards) {
    const cols = this.navigableColumns();
    let row = node.rowIndex;
    let ci = cols.findIndex(c => c.colId === column.colId);
    const dir = backwards ? -1 : 1;
    for (let guard = 0; guard < cols.length * 3 + 10; guard++) {
      ci += dir;
      if (ci >= cols.length) {
        ci = 0;
        row = this.nextRowIndex(row, 1);
        if (row === node.rowIndex) break;
      } else if (ci < 0) {
        ci = cols.length - 1;
        row = this.nextRowIndex(row, -1);
        if (row === node.rowIndex) break;
      }
      const n = this.displayedNodes[row];
      const c = cols[ci];
      if (n && c && this.isCellEditable(c, n)) {
        this.moveFocusTo(row, c.colId);
        this.startEdit(n, c, null);
        return;
      }
    }
  }

  // 편집 가능 셀에 값 쓰기 (readOnlyEdit 이면 요청 이벤트)
  writeCell(node, column, value, source) {
    if (!this.isCellEditable(column, node)) return false;
    if (this.gos.readOnlyEdit) {
      const oldValue = this.getCellValue(node, column);
      this.dispatch('cellEditRequest', {
        ...this.cellEventParams(node, column),
        oldValue,
        newValue: value,
        value,
        source,
      });
      return false;
    }
    return this.setCellValue(node, column, value, source);
  }

  clearRangeCells() {
    this.dispatch('cellSelectionDeleteStart', { source: 'deleteKey' });
    this.dispatch('rangeDeleteStart', { source: 'deleteKey' });
    this.beginUndoBatch();
    for (const r of this.ranges) {
      const b = this.rangeBounds(r);
      if (!b) continue;
      for (let ri = b.r0; ri <= b.r1; ri++) {
        const node = this.displayedNodes[ri];
        if (!node || node.detail) continue;
        for (let ci = b.c0; ci <= b.c1; ci++) this.writeCell(node, this.displayedColumns[ci], null, 'cellClear');
      }
    }
    this.endUndoBatch();
    this.dispatch('cellSelectionDeleteEnd', { source: 'deleteKey' });
    this.dispatch('rangeDeleteEnd', { source: 'deleteKey' });
  }

  pasteText(text) {
    pasteTextIntoGrid(this, text);
  }

  // ── 하이라이트(flash) ──────────────────────────────────────
  flashCells({ rowNodes, columns, flashDuration, fadeDuration, phaseClass = 'data-changed' } = {}) {
    const flashMs = flashDuration ?? this.gos.cellFlashDuration ?? 500;
    const fadeMs = fadeDuration ?? this.gos.cellFadeDuration ?? 1000;
    const nodes = rowNodes?.length ? rowNodes : this.getRenderedNodes();
    const cols = columns?.length ? this.getColumnsFromKeys(columns) : this.displayedColumns;
    const stamp = ++this.flashSeq;
    for (const n of nodes) for (const c of cols) this.flashes.set(`${n.id}|${c.colId}`, { phase: 'on', stamp, fadeMs, cls: phaseClass });
    this.notify();
    this.setTimer(() => {
      let touched = false;
      for (const f of this.flashes.values()) {
        if (f.stamp === stamp) {
          f.phase = 'fade';
          touched = true;
        }
      }
      if (touched) this.notify();
      this.setTimer(() => {
        for (const [k, f] of [...this.flashes]) if (f.stamp === stamp) this.flashes.delete(k);
        this.notify();
      }, fadeMs);
    }, flashMs);
  }

  getFlash(nodeId, colId) {
    if (!this.flashes.size) return null;
    return this.flashes.get(`${nodeId}|${colId}`) || null;
  }

  // ── 사이드바 ─────────────────────────────────────────────
  normalizeSideBar(initial) {
    const sb = this.gos.sideBar;
    const builtin = id => {
      if (id === 'columns' || id === 'agColumnsToolPanel') {
        return {
          id: 'columns',
          labelDefault: localeText(this, 'columns'),
          labelKey: 'columns',
          iconKey: 'columns',
          toolPanel: 'agColumnsToolPanel',
        };
      }
      if (id === 'filters' || id === 'agFiltersToolPanel') {
        return {
          id: 'filters',
          labelDefault: localeText(this, 'filters'),
          labelKey: 'filters',
          iconKey: 'filter',
          toolPanel: 'agFiltersToolPanel',
        };
      }
      return null;
    };
    const resolve = x => (typeof x === 'string' ? builtin(x) : x);
    let def = null;
    if (sb === true) def = { toolPanels: [builtin('columns'), builtin('filters')] };
    else if (typeof sb === 'string') def = { toolPanels: [builtin(sb)].filter(Boolean), defaultToolPanel: sb };
    else if (Array.isArray(sb)) def = { toolPanels: sb.map(resolve).filter(Boolean) };
    else if (sb && typeof sb === 'object') def = { ...sb, toolPanels: (sb.toolPanels || []).map(resolve).filter(Boolean) };
    this.sideBarDef = def;
    if (!def) {
      this.sideBarOpenId = null;
      return;
    }
    this.sideBarPosition = def.position === 'left' ? 'left' : 'right';
    if (initial) {
      this.sideBarVisible = !def.hiddenByDefault;
      if (def.defaultToolPanel && def.toolPanels.some(t => t.id === def.defaultToolPanel)) {
        this.sideBarOpenId = def.defaultToolPanel;
        this.mountedPanels.add(def.defaultToolPanel);
      }
    } else if (this.sideBarOpenId && !def.toolPanels.some(t => t.id === this.sideBarOpenId)) {
      this.sideBarOpenId = null;
    }
  }

  openToolPanel(key, source = 'api') {
    if (!this.sideBarDef) return;
    if (!this.sideBarDef.toolPanels.some(t => t.id === key)) return;
    const prev = this.sideBarOpenId;
    if (prev === key) return;
    this.sideBarOpenId = key;
    this.mountedPanels.add(key);
    this.notify();
    if (prev) {
      this.dispatch('toolPanelVisibleChanged', { source, key: prev, visible: false, switchingToolPanel: true });
    }
    this.dispatch('toolPanelVisibleChanged', { source, key, visible: true, switchingToolPanel: !!prev });
  }

  closeToolPanel(source = 'api') {
    const prev = this.sideBarOpenId;
    if (!prev) return;
    this.sideBarOpenId = null;
    this.notify();
    this.dispatch('toolPanelVisibleChanged', { source, key: prev, visible: false, switchingToolPanel: false });
  }

  onSideButtonClick(id) {
    if (this.sideBarOpenId === id) this.closeToolPanel('sideBarButtonClicked');
    else this.openToolPanel(id, 'sideBarButtonClicked');
  }

  // 플로팅 필터 행 높이 (표시 컬럼 중 floatingFilter 가 하나라도 있으면)
  getFloatingFiltersHeight(headerHeight) {
    const has = this.displayedColumns.some(c => !c.isAuto && c.colDef.floatingFilter && c.colDef.filter);
    return has ? this.gos.floatingFiltersHeight ?? headerHeight : 0;
  }

  // ── 팝업(메뉴/필터) ────────────────────────────────────────
  // popupParent 지정 시 팝업(메뉴/필터/팝업 에디터/툴팁/드래그 고스트)을 그 요소에 붙인다
  getPopupParent() {
    const p = this.gos.popupParent;
    return p && typeof p.appendChild === 'function' ? p : document.body;
  }

  openPopup(popup) {
    this.popup = popup;
    this.notify();
  }

  closePopup() {
    if (!this.popup) return;
    const p = this.popup;
    this.popup = null;
    this.notify();
    if (p.type === 'columnMenu' || p.type === 'filter') {
      this.dispatch('columnMenuVisibleChanged', { visible: false, switchingTab: false, key: p.tab ?? null, column: p.column ?? null });
    }
  }

  openContextMenu({ node, column, x, y, event }) {
    if (this.gos.suppressContextMenu) return false;
    const value = node && column ? this.getCellValue(node, column) : undefined;
    const defaultItems = ['copy', 'copyWithHeaders', 'paste', 'separator', 'export'];
    const getItems = this.gos.getContextMenuItems;
    const items = typeof getItems === 'function'
      ? getItems({ node: node ?? null, column: column ?? null, value, api: this.api, context: this.gos.context, defaultItems })
      : defaultItems;
    if (!items || !items.length) return true;
    this.openPopup({ type: 'contextMenu', x, y, items, params: { node: node ?? null, column: column ?? null, value, api: this.api, context: this.gos.context }, event });
    this.dispatch('contextMenuVisibleChanged', { visible: true, source: 'ui' });
    return true;
  }

  // ── 오버레이 ─────────────────────────────────────────────
  getOverlayType() {
    const loading = this.gos.loading;
    if (loading === true) return 'loading';
    if (this.manualOverlay === 'loading') return 'loading';
    if (loading === undefined && !this.rowDataSet && !this.gos.suppressLoadingOverlay && this.isClientSide()) {
      return 'loading';
    }
    if (this.manualOverlay === 'noRows') return 'noRows';
    if (this.manualOverlay === 'hidden') return null;
    if (this.rowDataSet && this.displayedNodes.length === 0 && !this.gos.suppressNoRowsOverlay) return 'noRows';
    return null;
  }

  isClientSide() {
    const t = this.gos.rowModelType;
    return !t || t === 'clientSide';
  }

  // ── 페이지네이션 ─────────────────────────────────────────
  paginationGoToPage(page) {
    if (!this.gos.pagination) return;
    const target = clamp(page, 0, Math.max(0, this.totalPages - 1));
    if (target === this.currentPage) return;
    this.currentPage = target;
    this.updatePagination();
    this.computeRowTops();
    this.viewport?.setScrollTop?.(0);
    this.notify();
    this.dispatch('paginationChanged', {
      newData: false,
      newPage: true,
      newPageSize: false,
      keepRenderedRows: false,
      animate: false,
    });
  }

  // ── 스크롤 ───────────────────────────────────────────────
  ensureIndexVisible(index, position) {
    if (index == null || index < 0 || index >= this.displayedNodes.length) return;
    if (this.gos.pagination && (index < this.pageFirstRow || index >= this.pageLastRow)) {
      // index 가 속한 페이지 단위 찾기 (단위 시작 rowIndex 중 index 이하 최댓값)
      const units = this.getPageUnitStarts();
      let unit = index;
      if (units) {
        let lo = 0;
        let hi = units.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (units[mid] <= index) lo = mid;
          else hi = mid - 1;
        }
        unit = lo;
      }
      this.paginationGoToPage(Math.floor(unit / this.getPageSize()));
    }
    const vp = this.viewport;
    if (!vp) {
      this.pendingScroll = { index, position };
      return;
    }
    const i = index - this.pageFirstRow;
    const top = this.rowTopAt(i);
    const h = this.rowHeightAt(i);
    const vh = vp.getClientHeight();
    const cur = vp.getScrollTop();
    let target = null;
    if (position === 'top') target = top;
    else if (position === 'bottom') target = top + h - vh;
    else if (position === 'middle') target = top - vh / 2 + h / 2;
    else if (top < cur) target = top;
    else if (top + h > cur + vh) target = top + h - vh;
    if (target != null) vp.setScrollTop(Math.max(0, target));
  }

  ensureNodeVisible(nodeOrData, position) {
    let node = null;
    if (typeof nodeOrData === 'function') {
      node = this.displayedNodes.find(n => !n.detail && nodeOrData(n));
    } else if (nodeOrData instanceof RowNode) node = nodeOrData;
    else if (nodeOrData) node = this.rootNodes.find(n => n.data === nodeOrData) || null;
    if (node && node.rowIndex != null) this.ensureIndexVisible(node.rowIndex, position);
  }

  ensureColumnVisible(key, position = 'auto') {
    const col = this.getColumn(key);
    const vp = this.viewport;
    if (!col || !vp || col.pinned || !col.visible) return;
    const vw = vp.getCenterWidth();
    const cur = vp.getScrollLeft();
    const l = col.left;
    const r = col.left + col.actualWidth;
    let target = null;
    if (position === 'start') target = l;
    else if (position === 'end') target = r - vw;
    else if (position === 'middle') target = l - vw / 2 + col.actualWidth / 2;
    else if (l < cur) target = l;
    else if (r > cur + vw) target = r - vw;
    if (target != null) vp.setScrollLeft(Math.max(0, target));
  }

  getRenderedNodes() {
    const { first, last } = this.renderedRange;
    const out = [];
    if (first < 0) return out;
    for (let i = first; i <= last; i++) {
      const n = this.displayedNodes[i];
      if (n) out.push(n);
    }
    return out;
  }

  // ── 자동 폭 ──────────────────────────────────────────────
  autoSizeColumns(keys, skipHeader) {
    const root = this.eRoot;
    if (!root) return;
    const cols = keys ? this.getColumnsFromKeys(keys) : this.displayedColumns.filter(c => !c.isAuto);
    const skip = skipHeader ?? !!this.gos.skipHeaderOnAutoSize;
    const range = document.createRange();
    const measure = el => {
      range.selectNodeContents(el);
      const w = range.getBoundingClientRect().width;
      const cs = getComputedStyle(el);
      return w + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2;
    };
    const resized = [];
    cols.forEach(col => {
      if (col.colDef.suppressAutoSize) return;
      const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(col.colId) : col.colId;
      let max = 0;
      root.querySelectorAll(`.r2-cell[col-id="${sel}"]`).forEach(cell => {
        max = Math.max(max, measure(cell));
      });
      if (!skip) {
        const label = root.querySelector(`.r2-header-cell[col-id="${sel}"] .r2-header-cell-label`);
        const hcell = root.querySelector(`.r2-header-cell[col-id="${sel}"]`);
        if (label && hcell) {
          range.selectNodeContents(label);
          const cs = getComputedStyle(hcell);
          const extra = hcell.querySelector('.r2-header-cell-menu-button') ? 24 : 0;
          max = Math.max(max, range.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + extra + 16);
        }
      }
      if (max > 0) {
        let w = Math.ceil(max);
        w = Math.max(col.minWidth, w);
        if (col.maxWidth) w = Math.min(col.maxWidth, w);
        col.width = w;
        col.flex = null;
        resized.push(col);
      }
    });
    range.detach?.();
    if (!resized.length) return;
    this.afterColumnLayoutChange();
    this.dispatch('columnResized', {
      columns: resized,
      column: resized.length === 1 ? resized[0] : null,
      finished: true,
      source: 'autosizeColumns',
    });
  }

  sizeColumnsToFit(arg) {
    const params = typeof arg === 'object' && arg ? arg : {};
    const avail = typeof arg === 'number' ? arg : this.bodyWidth;
    if (!avail) return;
    const limits = new Map((params.columnLimits || []).map(l => [this.getColumn(l.key)?.colId, l]));
    const cols = this.displayedColumns;
    const fit = cols.filter(c => !c.colDef.suppressSizeToFit);
    const fixedW = cols.filter(c => c.colDef.suppressSizeToFit).reduce((s, c) => s + c.actualWidth, 0);
    const minOf = c => limits.get(c.colId)?.minWidth ?? params.defaultMinWidth ?? c.minWidth;
    const maxOf = c => limits.get(c.colId)?.maxWidth ?? params.defaultMaxWidth ?? c.maxWidth;
    let remaining = [...fit];
    const done = new Map();
    let again = true;
    while (again && remaining.length) {
      again = false;
      const space = avail - fixedW - [...done.values()].reduce((s, w) => s + w, 0);
      const cur = remaining.reduce((s, c) => s + c.actualWidth, 0) || 1;
      const scale = space / cur;
      for (const c of remaining) {
        const w = c.actualWidth * scale;
        const mn = minOf(c);
        const mx = maxOf(c);
        if (w < mn) {
          done.set(c, mn);
          remaining = remaining.filter(x => x !== c);
          again = true;
          break;
        }
        if (mx && w > mx) {
          done.set(c, mx);
          remaining = remaining.filter(x => x !== c);
          again = true;
          break;
        }
      }
    }
    done.forEach((w, c) => {
      c.width = w;
      c.flex = null;
    });
    const space = avail - fixedW - [...done.values()].reduce((s, w) => s + w, 0);
    const cur = remaining.reduce((s, c) => s + c.actualWidth, 0) || 1;
    let used = 0;
    remaining.forEach((c, i) => {
      const w = i === remaining.length - 1 ? Math.round(space - used) : Math.floor((c.actualWidth * space) / cur);
      c.width = Math.max(minOf(c), w);
      c.flex = null;
      used += c.width;
    });
    this.afterColumnLayoutChange();
    this.dispatch('columnResized', { columns: fit, column: null, finished: true, source: 'sizeColumnsToFit' });
  }

  // ── 툴팁 ─────────────────────────────────────────────────
  getCellTooltip(node, column) {
    const cd = column.colDef;
    if (typeof cd.tooltipValueGetter === 'function') {
      return cd.tooltipValueGetter({
        ...this.makeValueParams(node, column),
        value: this.getCellValue(node, column),
        valueFormatted: this.formatValue(node, column, this.getCellValue(node, column)),
        location: 'cell',
        rowIndex: node.rowIndex,
      });
    }
    if (cd.tooltipField) return getFieldValue(node.data, cd.tooltipField);
    return undefined;
  }

  // ── 생명주기 ─────────────────────────────────────────────
  onMounted() {
    this.destroyed = false;
    this.dispatch('gridReady', {});
    const pending = this.pendingInitialEvents;
    this.pendingInitialEvents = [];
    pending.forEach(([t, p]) => this.dispatch(t, p));
    if (this.pendingScroll) {
      const { index, position } = this.pendingScroll;
      this.pendingScroll = null;
      this.ensureIndexVisible(index, position);
    }
  }

  // autoSizeStrategy: fitCellContents 는 첫 데이터 렌더 시 1회, fitGridWidth/fitProvidedWidth 는 크기 변경마다
  applyAutoSizeStrategy(firstData) {
    const s = this.gos.autoSizeStrategy;
    if (!s || !this.bodyWidth) return;
    if (s.type === 'fitCellContents') {
      if (firstData) this.autoSizeColumns(s.colIds || null, s.skipHeader);
    } else if (s.type === 'fitGridWidth') {
      this.sizeColumnsToFit(s);
    } else if (s.type === 'fitProvidedWidth' && s.width) {
      this.sizeColumnsToFit(s.width);
    }
  }

  maybeFireFirstDataRendered() {
    if (this.firstDataRenderedFired || !this.displayedNodes.length) return;
    this.firstDataRenderedFired = true;
    this.applyAutoSizeStrategy(true);
    this.dispatch('firstDataRendered', {
      firstRow: this.renderedRange.first,
      lastRow: this.renderedRange.last,
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.dispatch('gridPreDestroyed', { state: {} });
    this.destroyed = true;
    this.timers.forEach(t => clearTimeout(t));
    this.timers.clear();
    this.events.clear();
    this.storeListeners.clear();
  }
}

// 기능별 mixin 결합 (그룹핑 / SSRM / 행드래그 / undo / 고정행)
Object.assign(GridCore.prototype, groupingMethods, ssrmMethods, rowDragMethods, undoMethods, pinnedMethods, customFilterMethods, fillHandleMethods, statusBarMethods);
