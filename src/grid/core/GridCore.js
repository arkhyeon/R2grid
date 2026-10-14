// 그리드 엔진 본체. React 와 무관한 순수 JS — 상태 + api + 이벤트.
// React 레이어는 useSyncExternalStore(subscribe, getVersion) 로 구독해 렌더만 담당한다.
import { EventService } from './EventService.js';
import { getGlobalGridOptions } from './globals.js';
import { resolveTheme } from './theme.js';
import { eventPropName } from './utils.js';
import { createApi } from './api.js';
import { groupingMethods } from './grouping.js';
import { ssrmMethods } from './ssrm.js';
import { rowDragMethods } from './rowDrag.js';
import { undoMethods } from './undo.js';
import { pinnedMethods } from './pinned.js';
import { customFilterMethods } from './customFilter.js';
import { fillHandleMethods } from './fillHandle.js';
import { statusBarMethods } from './statusBar.js';
import { findMethods } from './find.js';
import { pivotMethods } from './pivot.js';
import { advancedFilterMethods } from './advancedFilter.js';
import { chartMethods } from './charts.js';
import { headerNavMethods } from './headerNav.js';
import { stateMethods } from './state.js';
import { viewportMethods } from './viewport.js';
import { columnMethods } from './columns.js';
import { valueMethods } from './values.js';
import { rowDataMethods } from './rowData.js';
import { rowModelMethods } from './rowModel.js';
import { selectionMethods } from './selection.js';
import { focusRangeMethods } from './focusRange.js';
import { editingMethods } from './editing.js';
import { keyboardMethods } from './keyboard.js';
import { viewMethods } from './view.js';
import { layoutMethods } from './layout.js';
import { COL_DEF_EVENTS, DEFAULT_DETAIL_ROW_HEIGHT, DEFAULT_HEADER_HEIGHT, DEFAULT_ROW_HEIGHT, camelToHuman } from './gridConstants.js';

export { DEFAULT_ROW_HEIGHT, DEFAULT_HEADER_HEIGHT, DEFAULT_DETAIL_ROW_HEIGHT, camelToHuman };

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
  'isRowPinned',
  'isRowPinnable',
  'gridOptions',
]);

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
    // initialState: 준 항목만 적용 (이후 바뀌어도 다시 적용하지 않음)
    if (this.gos.initialState) {
      this.__muteEvents = true;
      try {
        this.applyGridState(this.gos.initialState, { partial: true, source: 'gridInitializing' });
      } finally {
        this.__muteEvents = false;
      }
    }
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
  // 이 이벤트를 듣는 곳이 있는지 (gridOptions.on* 또는 addEventListener)
  hasEventListener(type) {
    return typeof this.gos[eventPropName(type)] === 'function' || !!this.events.hasListeners?.(type);
  }

  dispatch(type, params = {}) {
    if (this.destroyed || this.__muteEvents) return;
    const event = { type, api: this.api, context: this.gos.context, ...params };
    // debug: 그리드 이벤트를 콘솔에 남김 (개발 중 확인용)
    if (this.gos.debug && typeof console !== 'undefined') console.debug(`[R2grid ${this.gridId}] ${type}`, params);
    // 컬럼 단위 콜백 (colDef.onCellClicked 등 — 그리드 이벤트보다 먼저)
    if (COL_DEF_EVENTS.has(type)) {
      const h = params.column?.colDef?.[eventPropName(type)];
      if (typeof h === 'function') h(event);
    }
    const handler = this.gos[eventPropName(type)];
    if (typeof handler === 'function') handler(event);
    this.events.dispatch(event);
    if (this.gos.alignedGrids && !this.__aligning) this.syncAlignedGrids(type, params);
    // stateUpdated 수집 (드래그 중 리사이즈는 끝났을 때만)
    if (!(type === 'columnResized' && params.finished === false)) this.noteStateChange(type);
  }

  // alignedGrids: [gridRef | api] 또는 () => [...] — 컬럼 폭/순서/표시/고정/그룹 열림 + 가로 스크롤 동기화
  getAlignedCores() {
    const ag = this.gos.alignedGrids;
    const list = typeof ag === 'function' ? ag() : ag;
    if (!Array.isArray(list)) return [];
    return list.map(x => x?.api?.__r2core ?? x?.current?.api?.__r2core ?? x?.__r2core ?? null).filter(c => c && c !== this && !c.destroyed);
  }

  syncAlignedGrids(type, params) {
    const COLUMN_EVENTS = new Set(['columnResized', 'columnMoved', 'columnVisible', 'columnPinned', 'columnGroupOpened', 'displayedColumnsChanged']);
    const scroll = type === 'bodyScroll' && params.direction === 'horizontal';
    if (!scroll && !COLUMN_EVENTS.has(type)) return;
    const others = this.getAlignedCores();
    if (!others.length) return;
    const state = scroll ? null : this.getColumnState().map(s => ({ colId: s.colId, width: s.width, hide: s.hide, pinned: s.pinned, flex: s.flex }));
    const groups = scroll ? null : this.getColumnGroupState();
    for (const o of others) {
      o.__aligning = true;
      try {
        if (scroll) {
          if (o.viewport && o.viewport.getScrollLeft() !== params.left) o.viewport.setScrollLeft(params.left);
        } else {
          o.applyColumnState({ state, applyOrder: true });
          o.setColumnGroupState(groups);
        }
      } finally {
        o.__aligning = false;
      }
    }
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
    const diff = this.pendingStateChange;
    this.pendingStateChange = null;
    if (!initial && diff) this.dispatch('componentStateChanged', diff);
  }

  setGridOption(key, value) {
    this.overrides[key] = value;
    this.applyGos({ ...this.gos, [key]: value }, false);
  }

  updateGridOptions(options) {
    Object.assign(this.overrides, options);
    this.applyGos({ ...this.gos, ...options }, false);
    this.pendingStateChange = null;
  }

  applyGos(next, initial) {
    const prev = this.gos;
    this.gos = next;
    if (initial) {
      this.theme = resolveTheme(next.theme);
      this.installTheme();
      this.rsOpts = this.normalizeRowSelection();
      this.buildColumns(true);
      this.buildPinnedRows();
      this.groupMode = this.computeGroupMode();
      this.normalizeSideBar(true);
      if (this.isSsrm()) {
        this.ssrmReset('init');
        return;
      }
      if (this.isViewportModel()) {
        this.vpInit();
        return;
      }
      this.setRowData(next.rowData, true);
      return;
    }
    const changed = k => prev[k] !== next[k];
    // componentStateChanged: 바뀐 옵션 { key: { previousValue, currentValue } }
    {
      const diff = {};
      for (const k of new Set([...Object.keys(prev || {}), ...Object.keys(next || {})])) {
        if (k !== 'gridOptions' && prev?.[k] !== next?.[k]) diff[k] = { previousValue: prev?.[k], currentValue: next?.[k] };
      }
      if (Object.keys(diff).length) this.pendingStateChange = diff;
    }
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
      this.installTheme();
    }
    let rebuild = false;
    if (changed('rowSelection') || changed('suppressRowClickSelection') || changed('rowMultiSelectWithClick') || changed('isRowSelectable')) {
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
      changed('treeDataDisplayType') ||
      changed('groupDisplayType')
    ) {
      rebuild = true;
    }
    if (rebuild) this.buildColumns(false);
    else if (changed('hidePaddedHeaderRows')) this.layoutColumns();
    if (changed('sideBar')) this.normalizeSideBar(false);
    if (changed('pivotMode')) {
      this.pivotModeOverride = undefined;
      this.applyPivotModeChange();
    }
    // findOptions 는 인라인 객체로 자주 넘어오므로 내용으로 비교 (참조 비교 시 findChanged → 상위 setState → 무한 루프)
    if (changed('findSearchValue') || JSON.stringify(prev.findOptions ?? null) !== JSON.stringify(next.findOptions ?? null)) {
      this.findActive = null;
      this.__findKey = null;
      this.dispatchFindChanged();
    }
    // 피벗 결과 컬럼 모양을 바꾸는 옵션
    if (
      [
        'pivotRowTotals',
        'pivotColumnGroupTotals',
        'removePivotHeaderRowWhenSingleValueColumn',
        'suppressExpandablePivotGroups',
        'pivotDefaultExpanded',
        'pivotMaxGeneratedColumns',
        'processPivotResultColDef',
        'processPivotResultColGroupDef',
      ].some(changed) &&
      this.isPivotActive?.()
    ) {
      this.applyPivotResultColumns(true);
      this.columnsVersion++;
      this.layoutColumns();
      this.refreshModel({ skipFilter: true });
      this.dispatch('displayedColumnsChanged', { source: 'gridOptionsChanged' });
    }
    if (changed('pinnedTopRowData') || changed('pinnedBottomRowData')) {
      this.buildPinnedRows();
      this.dispatch('pinnedRowDataChanged', {});
    }
    if (changed('enableRowPinning') && this.manualPins) {
      const m = this.manualPins;
      this.setManualPins({ top: this.rowPinningAllowed('top') ? m.top : [], bottom: this.rowPinningAllowed('bottom') ? m.bottom : [] }, 'gridOptionsChanged');
    }

    const prevGroupMode = this.groupMode;
    this.groupMode = this.computeGroupMode();
    let groupRefresh = false;
    if (prevGroupMode !== this.groupMode || changed('getDataPath') || changed('treeData')) {
      this.groupsDirty = true;
      groupRefresh = true;
    }

    if (changed('rowModelType') || changed('serverSideDatasource') || changed('datasource') || changed('viewportDatasource')) {
      if (this.isSsrm()) {
        this.ssrmReset('datasource');
        this.notify();
        return;
      }
      if (this.isViewportModel()) {
        this.vpInit();
        return;
      }
      if (prev.rowModelType === 'viewport') this.vpDestroy();
    }
    if (this.isSsrm() || this.isViewportModel()) {
      this.notify();
      return;
    }

    if (changed('rowData')) {
      const a = prev.rowData;
      const b = next.rowData;
      const bothEmpty = Array.isArray(a) && Array.isArray(b) && !a.length && !b.length && !this.rootNodes.length;
      if (!bothEmpty) this.setRowData(b, false);
    } else {
      let refresh = false;
      if (changed('quickFilterText') || changed('alwaysAggregateAtRootLevel') || changed('applyQuickFilterBeforePivotOrAgg')) refresh = true;
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
      if (
        groupRefresh ||
        changed('groupSelectsChildren') ||
        changed('groupTotalRow') ||
        changed('grandTotalRow') ||
        changed('groupIncludeFooter') ||
        changed('groupIncludeTotalFooter') ||
        changed('paginateChildRows')
      ) {
        refresh = true;
      }
      if (refresh) {
        this.refreshModel({ newPageSize: changed('paginationPageSize'), byFilter: changed('quickFilterText') });
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
      headerCheckbox: multi ? (rs.headerCheckbox ?? true) : false,
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

  // ── 생명주기 ─────────────────────────────────────────────
  onMounted() {
    this.destroyed = false;
    // 그리드가 다른 문서(iframe·새 창)에 붙었으면 그 문서에도 테마 스타일
    this.installTheme();
    // 언마운트 후 다시 붙은 경우(StrictMode 등) 끊었던 viewport 데이터 소스 다시 연결
    if (this.isViewportModel() && this.vp?.destroyed) this.vpInit();
    this.dispatch('gridReady', {});
    const pending = this.pendingInitialEvents;
    this.pendingInitialEvents = [];
    pending.forEach(([t, p]) => this.dispatch(t, p));
    if (this.pendingScroll) {
      const { index, position } = this.pendingScroll;
      this.pendingScroll = null;
      this.ensureIndexVisible(index, position);
    }
    // initialState.scroll 은 뷰포트가 생긴 뒤 + 첫 렌더 후 적용, stateUpdated(gridInitializing) 1회
    this.setTimer(() => {
      if (this.pendingStateScroll) {
        const sc = this.pendingStateScroll;
        this.pendingStateScroll = null;
        this.applyScrollState(sc);
      }
      this.dispatchStateUpdated(['gridInitializing']);
    }, 0);
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
    if (this.isViewportModel()) this.vpDestroy();
    this.destroyed = true;
    this.timers.forEach(t => clearTimeout(t));
    this.timers.clear();
    this.events.clear();
    this.storeListeners.clear();
  }
}

// 기능별 mixin 결합 (그룹핑 / SSRM / 행드래그 / undo / 고정행)
Object.assign(
  GridCore.prototype,
  columnMethods,
  valueMethods,
  rowDataMethods,
  rowModelMethods,
  selectionMethods,
  focusRangeMethods,
  editingMethods,
  keyboardMethods,
  viewMethods,
  layoutMethods,
  groupingMethods,
  ssrmMethods,
  viewportMethods,
  rowDragMethods,
  undoMethods,
  pinnedMethods,
  customFilterMethods,
  fillHandleMethods,
  statusBarMethods,
  findMethods,
  pivotMethods,
  advancedFilterMethods,
  chartMethods,
  stateMethods,
  headerNavMethods,
);
