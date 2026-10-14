// 컬럼 구성: columnDefs → Column / ColumnGroup 트리, 표시 컬럼·고정 영역·너비 계산, 컬럼 상태
//  GridCore.prototype 에 합쳐짐 (this = GridCore)
import { Column, ColumnGroup, ROW_NUMBERS_COL_ID, SELECTION_COL_ID, normalizePinned } from './Column.js';
import { BUILTIN_COLUMN_TYPES, camelToHuman } from './gridConstants.js';
import { AUTO_GROUP_COL_ID } from './grouping.js';
import { localeText } from './locale.js';
import { clamp, getFieldValue } from './utils.js';

export const columnMethods = {
  // ── 컬럼 구성 ─────────────────────────────────────────────
  buildColumns(initial) {
    this.bumpValueCache(true);
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
          // 같은 groupId 그룹의 열림 상태 유지
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
    if (this.wantsAutoGroupColumn(leaves)) {
      const multiple = this.isMultipleGroupColumns() && !(g.treeData && typeof g.getDataPath === 'function');
      const rgCols = multiple
        ? leaves.filter(c => c.rowGroup).sort((a, b) => (a.rowGroupIndex ?? 1e9) - (b.rowGroupIndex ?? 1e9) || leaves.indexOf(a) - leaves.indexOf(b))
        : [null];
      rgCols.forEach((rgc, i) => {
        // multipleColumns: 그룹 기준 컬럼마다 하나씩 (colId: r2-Grid-AutoColumn-<colId>)
        const colId = rgc ? `${AUTO_GROUP_COL_ID}-${rgc.colId}` : AUTO_GROUP_COL_ID;
        makeAuto(
          colId,
          {
            ...defaultColDef,
            headerName: rgc ? (rgc.colDef.headerName ?? camelToHuman(rgc.colDef.field ?? rgc.colId)) : localeText(this, 'group'),
            minWidth: 200,
            cellRenderer: 'r2GroupCellRenderer',
            suppressColumnsToolPanel: true,
            ...(g.autoGroupColumnDef || {}),
            colId,
            ...(rgc ? { showRowGroup: rgc.colId } : null),
          },
          'group',
        );
        const gc = autoCols[autoCols.length - 1];
        gc.isAuto = false;
        gc.groupIndex = rgc ? i : null;
      });
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
    // 피벗 결과 컬럼 (pivotMode + pivot 컬럼) 재구성
    this.pivotResultColumns = [];
    this.applyPivotResultColumns(true);

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
      this.dispatch('gridColumnsChanged', {});
      this.dispatch('displayedColumnsChanged', { source: 'gridOptionsUpdated' });
    }
  },

  sortSignature() {
    return this.allColumns
      .filter(c => c.sort)
      .map(c => `${c.colId}:${c.sort}:${c.sortIndex}`)
      .join('|');
  },

  // 첫 행 기준 cellDataType 추론
  inferDataTypes() {
    const first = this.rootNodes[0]?.data;
    for (const col of this.allColumns) {
      if (col.isAuto) continue;
      const cdt = col.colDef.cellDataType;
      if (cdt === false) {
        col.dataType = null;
        continue;
      }
      // dataTypeDefinitions: 사용자 정의 타입 (baseDataType 으로 필터·편집 기본값 결정)
      const defs = this.gos.dataTypeDefinitions || {};
      const applyDef = name => {
        const d = defs[name];
        col.dataTypeDef = d || null;
        col.dataType = d ? d.baseDataType || defs[d.extendsDataType]?.baseDataType || d.extendsDataType || name : name;
      };
      if (typeof cdt === 'string') {
        applyDef(cdt);
        continue;
      }
      if (col.dataTypeInferred || col.colDef.valueGetter || !col.colDef.field || !first) continue;
      const v = getFieldValue(first, col.colDef.field, this.gos.suppressFieldDotNotation);
      if (v == null) continue;
      const matched = Object.keys(defs).find(k => typeof defs[k].dataTypeMatcher === 'function' && defs[k].dataTypeMatcher(v));
      if (matched) {
        applyDef(matched);
        col.dataTypeInferred = true;
        continue;
      }
      let t;
      if (typeof v === 'number') t = 'number';
      else if (typeof v === 'boolean') t = 'boolean';
      else if (v instanceof Date) t = 'date';
      else if (typeof v === 'string') t = /^\d{4}-\d{2}-\d{2}$/.test(v) ? 'dateString' : 'text';
      else t = 'object';
      col.dataType = t;
      col.dataTypeInferred = true;
    }
  },

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
  },

  layoutColumns() {
    this.allColumns.forEach(c => {
      c.groupShown = this.computeGroupShown(c);
    });
    const visible = this.allColumns.filter(c => c.visible && c.groupShown && this.isShownInPivot(c));
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
    // hidePaddedHeaderRows: 보이는 컬럼에 그룹이 하나도 없는 헤더 줄은 숨김 (기본은 전체 컬럼 기준 깊이)
    const depthOf = list => list.reduce((m, c) => Math.max(m, c.groupChain?.length || 0), 0);
    this.headerGroupDepth = this.gos.hidePaddedHeaderRows ? depthOf(this.displayedColumns) : depthOf(this.allColumns);
    this.hasColSpan = this.displayedColumns.some(c => typeof c.colDef.colSpan === 'function');
  },

  setViewportSize(width, height) {
    const wChanged = width !== this.bodyWidth;
    const hChanged = height !== this.bodyHeight;
    if (!wChanged && !hChanged) return;
    this.bodyWidth = width;
    this.bodyHeight = height;
    if (wChanged) this.layoutColumns();
    if (wChanged) this.keepPinnedNarrowerThanViewport();
    if (wChanged && /^fit(GridWidth|ProvidedWidth)$/.test(this.gos.autoSizeStrategy?.type || '')) this.applyAutoSizeStrategy(false);
    if (hChanged && this.gos.pagination && this.gos.paginationAutoPageSize) {
      this.refreshModel({ newPageSize: true });
    }
    this.notify();
    this.dispatch('gridSizeChanged', { clientWidth: width, clientHeight: height });
  },

  // 그리드가 좁아져 고정 컬럼이 본문 폭(-50px)을 넘으면 고정 해제: 오른쪽 고정 → 왼쪽 고정 순으로 번갈아 하나씩.
  //  processUnpinnedColumns({ columns, viewportWidth }) 로 풀 컬럼을 바꿀 수 있음 (빈 배열이면 그대로 둠)
  keepPinnedNarrowerThanViewport() {
    const bw = this.bodyWidth;
    if (!(bw > 50) || this.gos.domLayout === 'print') return;
    const avail = bw - 50;
    let need = this.leftWidth + this.rightWidth - avail;
    if (this.leftWidth + this.rightWidth < avail) return;
    const L = [...this.displayedLeft];
    const R = [...this.displayedRight];
    let li = 0;
    let ri = 0;
    let locked = false;
    const out = [];
    while ((li < L.length || ri < R.length) && need > 0) {
      if (ri < R.length) {
        const c = R[ri++];
        if (c.colDef.lockPinned) locked = true;
        else {
          need -= c.actualWidth;
          out.push(c);
        }
      }
      if (li < L.length && need > 0) {
        const c = L[li++];
        if (c.colDef.lockPinned) locked = true;
        else {
          need -= c.actualWidth;
          out.push(c);
        }
      }
    }
    if (!out.length && !locked) return;
    let cols = out;
    const fn = this.gos.processUnpinnedColumns;
    if (typeof fn === 'function') cols = fn({ columns: out, viewportWidth: bw, api: this.api, context: this.gos.context }) || [];
    cols = cols.map(c => this.getColumn(c)).filter(c => c && c.autoType !== 'rowNumbers');
    if (cols.length) this.setColumnsPinned(cols, null, 'viewportSizeFeature');
  },

  getColumn(key) {
    if (key == null) return null;
    if (key instanceof Column) return key;
    if (typeof key === 'object') {
      return this.allColumns.find(c => c.userProvidedColDef === key || c.colDef === key) ?? null;
    }
    // r2-Grid-* 별칭 colId 도 허용
    return this.columnById.get(String(key)) ?? null;
  },

  getColumnsFromKeys(keys) {
    return (keys || []).map(k => this.getColumn(k)).filter(Boolean);
  },

  // plain=true: 집계 접두("sum(…)") 없이 이름만 (드롭 영역 칩)
  getDisplayName(column, plain = false) {
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
    if (
      !plain &&
      (this.groupMode || this.isPivotActive()) &&
      cd.aggFunc &&
      !this.gos.suppressAggFuncInHeader &&
      column.autoType !== 'group' &&
      !column.isPivotResult
    ) {
      const fnName = typeof cd.aggFunc === 'string' ? cd.aggFunc : 'func';
      return `${fnName}(${name})`;
    }
    return name;
  },

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
  },

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
  },

  setColumnWidth(key, width, finished = true, source = 'api') {
    const col = this.getColumn(key);
    if (!col) return;
    let w = Math.max(col.minWidth, Math.round(width));
    if (col.maxWidth) w = Math.min(w, col.maxWidth);
    col.width = w;
    col.flex = null;
    this.afterColumnLayoutChange();
    this.dispatch('columnResized', { columns: [col], column: col, finished, source });
  },

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
    // marryChildren 그룹은 자식이 연속해야 함 → 깨지는 이동은 무시
    if (!this.isMarriedOrderValid(next)) return;
    this.allColumns = next;
    this.startColumnMoveAnimation();
    this.afterColumnLayoutChange();
    this.dispatch('columnMoved', {
      columns: cols,
      column: cols.length === 1 ? cols[0] : null,
      toIndex: idx,
      finished: true,
      source,
    });
  },

  // 행 이동 애니메이션 (animateRows, 기본 켜짐): 정렬·필터·펼침으로 자리가 바뀐 행이 미끄러지듯 이동
  isRowAnimationOn() {
    return this.gos.animateRows !== false;
  },

  // 컬럼 이동 애니메이션: 옮긴 직후 잠깐 셀·헤더의 가로 위치 변화를 부드럽게 (suppressColumnMoveAnimation 로 끔).
  //  너비 조절 때는 켜지 않음 (드래그를 늦게 따라가 보이므로)
  startColumnMoveAnimation() {
    if (this.gos.suppressColumnMoveAnimation || typeof window === 'undefined') return;
    const first = !this.columnAnimating;
    this.columnAnimating = true;
    if (this.__colAnimTimer) {
      clearTimeout(this.__colAnimTimer);
      this.timers.delete(this.__colAnimTimer);
    }
    this.__colAnimTimer = this.setTimer(() => {
      this.columnAnimating = false;
      this.__colAnimTimer = null;
      this.notify();
    }, 300);
    if (first) this.notify();
  },

  isMarriedOrderValid(order) {
    const pos = new Map(order.map((c, i) => [c, i]));
    for (const group of this.groupById?.values() || []) {
      if (!group.colGroupDef.marryChildren) continue;
      const idx = group
        .getLeafColumns()
        .map(c => pos.get(c))
        .sort((a, b) => a - b);
      if (idx.length && idx[idx.length - 1] - idx[0] !== idx.length - 1) return false;
    }
    return true;
  },

  getColumnGroup(key) {
    if (key == null) return null;
    if (key instanceof ColumnGroup) return key;
    return this.groupById?.get(String(key)) ?? null;
  },

  setColumnGroupOpened(key, open, source = 'api') {
    const group = this.getColumnGroup(key);
    if (!group || group.expanded === !!open) return;
    group.setExpanded(open);
    this.afterColumnLayoutChange();
    this.dispatch('columnGroupOpened', { columnGroup: group, columnGroups: [group], source });
  },

  getColumnGroupState() {
    return [...(this.groupById?.values() || [])].map(g => ({ groupId: g.groupId, open: g.expanded }));
  },

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
  },

  afterColumnLayoutChange() {
    this.columnsVersion++;
    this.quickFilterVersion++;
    this.layoutColumns();
    this.notify();
    this.dispatch('displayedColumnsChanged', { source: 'api' });
  },

  getColumnState() {
    const groupIdx = new Map(this.rowGroupColumns().map((c, i) => [c, i]));
    const pivotIdx = new Map((this.pivotColumns?.() || []).map((c, i) => [c, i]));
    return this.allColumns.map(c => ({
      colId: c.colId,
      width: c.actualWidth,
      hide: !c.visible,
      pinned: c.pinned,
      sort: c.sort || null,
      sortIndex: c.sort ? c.sortIndex : null,
      aggFunc: c.autoType || c.isPivotResult ? null : (c.colDef.aggFunc ?? null),
      rowGroup: groupIdx.has(c),
      rowGroupIndex: groupIdx.get(c) ?? null,
      pivot: pivotIdx.has(c),
      pivotIndex: pivotIdx.get(c) ?? null,
      flex: c.flex ?? null,
    }));
  },

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
      if (col.autoType || col.isPivotResult) return;
      if (s.rowGroup !== undefined || s.rowGroupIndex !== undefined) {
        const rg = s.rowGroupIndex != null || !!s.rowGroup;
        const rgi = rg ? (s.rowGroupIndex ?? col.rowGroupIndex ?? 1e6) : null;
        if (col.rowGroup !== rg || (rg && col.rowGroupIndex !== rgi)) {
          col.rowGroup = rg;
          col.rowGroupIndex = rgi;
          groupChanged.push(col);
        }
      }
      if (s.aggFunc !== undefined && (col.colDef.aggFunc ?? null) !== (s.aggFunc ?? null)) {
        col.aggFunc = s.aggFunc ?? null;
        col.colDef = { ...col.colDef, aggFunc: s.aggFunc ?? undefined };
        aggChanged.push(col);
      }
      if (s.pivot !== undefined || s.pivotIndex !== undefined) {
        const pv = s.pivotIndex != null || !!s.pivot;
        const pvi = pv ? (s.pivotIndex ?? col.pivotIndex ?? 1e6) : null;
        if (col.pivot !== pv || (pv && col.pivotIndex !== pvi)) {
          col.pivot = pv;
          col.pivotIndex = pvi;
          pivotChanged.push(col);
        }
      }
    };
    const groupChanged = [];
    const aggChanged = [];
    const pivotChanged = [];
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
    // 행 그룹/값/피벗 변경 → 인덱스 정규화 + 그룹 재구성 (자동 그룹 컬럼 추가/제거 포함)
    if (groupChanged.length || aggChanged.length || pivotChanged.length) {
      this.rowGroupColumns().forEach((c, i) => (c.rowGroupIndex = i));
      this.pivotColumns?.().forEach((c, i) => (c.pivotIndex = i));
      if (groupChanged.length) {
        this.groupMode = this.computeGroupMode();
        this.buildColumns(false);
      }
      this.groupsDirty = true;
      this.applyPivotResultColumns?.(true);
    }
    const modelChanged = groupChanged.length || aggChanged.length || pivotChanged.length;
    this.columnsVersion++;
    this.layoutColumns();
    if (sortChanged || modelChanged) {
      if (this.isSsrm()) {
        if (modelChanged) this.ssrmReset('columns');
        else this.ssrmOnSortChanged();
      } else this.refreshModel({});
    }
    this.notify();
    if (groupChanged.length) this.dispatch('columnRowGroupChanged', { columns: this.rowGroupColumns(), column: null, source: 'api' });
    if (aggChanged.length) this.dispatch('columnValueChanged', { columns: aggChanged, column: aggChanged.length === 1 ? aggChanged[0] : null, source: 'api' });
    if (pivotChanged.length) this.dispatch('columnPivotChanged', { columns: this.pivotColumns(), column: null, source: 'api' });
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
  },

  resetColumnState() {
    const prev = this.columnById;
    this.columnById = new Map();
    this.buildColumns(true);
    prev.clear();
    this.refreshModel({});
    this.notify();
    this.dispatch('displayedColumnsChanged', { source: 'api' });
    this.dispatch('columnsReset', { source: 'api' });
  },
};
