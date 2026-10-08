// 그리드 상태 저장/복원(getState·setState·initialState·stateUpdated) + 값 컬럼/집계 API + 일괄 편집(Batch Edit)
//  - GridState 모양은 AG v34 와 동일 (version, columnSizing, columnOrder, columnVisibility, columnPinning, sort,
//    rowGroup, aggregation, pivot, filter, rowGroupExpansion, rowPinning, rowSelection, pagination, scroll, focusedCell,
//    cellSelection, sideBar, columnGroup)
//  - setState: 빠진 항목은 기본값으로 되돌림(AG 동일), propertiesToIgnore 로 제외. initialState 는 준 항목만 적용
import { GRID_VERSION } from './globals.js';

const STATE_KEYS = [
  'aggregation',
  'columnGroup',
  'columnOrder',
  'columnPinning',
  'columnSizing',
  'columnVisibility',
  'filter',
  'focusedCell',
  'pagination',
  'pivot',
  'cellSelection',
  'rowGroup',
  'rowGroupExpansion',
  'rowPinning',
  'rowSelection',
  'scroll',
  'sideBar',
  'sort',
];
const COLUMN_KEYS = new Set(['aggregation', 'columnOrder', 'columnPinning', 'columnSizing', 'columnVisibility', 'pivot', 'rowGroup', 'sort']);

// 이벤트 → 상태 항목 (stateUpdated.sources)
const EVENT_SOURCES = {
  columnResized: ['columnSizing'],
  columnMoved: ['columnOrder'],
  columnVisible: ['columnVisibility'],
  columnPinned: ['columnPinning'],
  sortChanged: ['sort'],
  filterChanged: ['filter'],
  columnRowGroupChanged: ['rowGroup'],
  columnValueChanged: ['aggregation'],
  columnPivotChanged: ['pivot'],
  columnPivotModeChanged: ['pivot'],
  columnGroupOpened: ['columnGroup'],
  rowGroupOpened: ['rowGroupExpansion'],
  selectionChanged: ['rowSelection'],
  paginationChanged: ['pagination'],
  cellFocused: ['focusedCell'],
  cellSelectionChanged: ['cellSelection'],
  rangeSelectionChanged: ['cellSelection'],
  toolPanelVisibleChanged: ['sideBar'],
  bodyScroll: ['scroll'],
  pinnedRowsChanged: ['rowPinning'],
};

export const stateMethods = {
  // ── 상태 읽기 ─────────────────────────────────────────────
  getState() {
    const cols = this.allColumns.filter(c => !c.isPivotResult);
    const dataCols = cols.filter(c => !c.autoType);
    const s = { version: GRID_VERSION };
    const groups = this.rowGroupColumns().map(c => c.colId);
    if (groups.length) s.rowGroup = { groupColIds: groups };
    const agg = dataCols.filter(c => c.colDef.aggFunc && typeof c.colDef.aggFunc === 'string');
    if (agg.length) s.aggregation = { aggregationModel: agg.map(c => ({ colId: c.colId, aggFunc: c.colDef.aggFunc })) };
    const pivotCols = this.pivotColumns().map(c => c.colId);
    if (this.isPivotActive() || pivotCols.length) s.pivot = { pivotMode: this.isPivotActive(), pivotColIds: pivotCols };
    const sortCols = cols.filter(c => c.sort).sort((a, b) => (a.sortIndex ?? 1e9) - (b.sortIndex ?? 1e9));
    if (sortCols.length) s.sort = { sortModel: sortCols.map(c => ({ colId: c.colId, sort: c.sort })) };
    const filterModel = this.getFilterModel();
    const adv = this.isAdvancedFilterEnabled?.() ? this.getAdvancedFilterModel() : null;
    if ((filterModel && Object.keys(filterModel).length) || adv) {
      s.filter = {};
      if (filterModel && Object.keys(filterModel).length) s.filter.filterModel = filterModel;
      if (adv) s.filter.advancedFilterModel = adv;
    }
    const hidden = cols.filter(c => !c.visible).map(c => c.colId);
    if (hidden.length) s.columnVisibility = { hiddenColIds: hidden };
    const left = cols.filter(c => c.pinned === 'left').map(c => c.colId);
    const right = cols.filter(c => c.pinned === 'right').map(c => c.colId);
    if (left.length || right.length) s.columnPinning = { leftColIds: left, rightColIds: right };
    s.columnSizing = {
      columnSizingModel: cols.map(c => (c.flex ? { colId: c.colId, width: c.actualWidth, flex: c.flex } : { colId: c.colId, width: c.actualWidth })),
    };
    s.columnOrder = { orderedColIds: cols.map(c => c.colId) };
    const openGroups = this.getColumnGroupState().filter(g => g.open).map(g => g.groupId);
    if (openGroups.length) s.columnGroup = { openColumnGroupIds: openGroups };
    const expanded = this.collectExpandedIds();
    if (expanded.length) s.rowGroupExpansion = { expandedRowGroupIds: expanded };
    const mp = this.manualPins;
    if (mp && (mp.top.length || mp.bottom.length)) s.rowPinning = { top: [...mp.top], bottom: [...mp.bottom] };
    if (this.isSsrm()) {
      const ss = this.getServerSideSelectionState();
      if (ss && (ss.selectAll || ss.toggledNodes.length)) s.rowSelection = ss;
    } else {
      const selected = this.getSelectedNodes().map(n => n.id).filter(id => id != null);
      if (selected.length) s.rowSelection = selected;
    }
    if (this.gos.pagination) s.pagination = { page: this.currentPage, pageSize: this.getPageSize() };
    const vp = this.viewport;
    if (vp) {
      const top = vp.getScrollTop();
      const leftPx = vp.getScrollLeft();
      if (top || leftPx) s.scroll = { top, left: leftPx };
    }
    const f = this.focus;
    if (f) s.focusedCell = { rowIndex: f.rowIndex, rowPinned: f.rowPinned || null, colId: f.colId };
    const ranges = this.getCellRanges?.() || [];
    if (ranges.length) {
      s.cellSelection = {
        cellRanges: ranges.map(r => ({
          id: r.id,
          type: r.type,
          startRow: r.startRow,
          endRow: r.endRow,
          colIds: r.columns.map(c => c.colId),
          startColId: r.startColumn?.colId ?? r.columns[0]?.colId,
        })),
      };
    }
    if (this.sideBarDef) {
      s.sideBar = { visible: !!this.sideBarVisible, position: this.sideBarPosition, openToolPanel: this.sideBarOpenId ?? null, toolPanels: {} };
    }
    return s;
  },

  collectExpandedIds() {
    const out = [];
    this.groupNodeCache?.forEach(n => n.expanded && n.id != null && out.push(n.id));
    // 트리데이터/마스터 행
    for (const n of this.rootNodes) if (n.expanded && (n.group || n.master || n.childrenAll?.length)) out.push(n.id);
    return [...new Set(out)];
  },

  // ── 상태 쓰기 ─────────────────────────────────────────────
  // partial=true: state 에 있는 항목만 적용 (initialState). false: 빠진 항목은 기본값으로 (setState)
  applyGridState(state, { ignore = [], partial = false, source = 'api' } = {}) {
    if (!state) return;
    const skip = new Set(ignore);
    const want = k => !skip.has(k) && (!partial || state[k] !== undefined);
    const colKeys = [...COLUMN_KEYS].filter(want);
    if (colKeys.length) this.applyColumnStateFromGridState(state, new Set(colKeys), partial || !!state.partialColumnState);
    if (want('columnGroup')) {
      const open = new Set(state.columnGroup?.openColumnGroupIds || []);
      this.setColumnGroupState([...(this.groupById?.values() || [])].map(g => ({ groupId: g.groupId, open: open.has(g.groupId) })));
    }
    if (want('filter')) {
      this.setFilterModel(state.filter?.filterModel ?? null);
      if (this.isAdvancedFilterEnabled?.()) this.setAdvancedFilterModel(state.filter?.advancedFilterModel ?? null);
    }
    if (want('rowGroupExpansion')) {
      const ids = new Set(state.rowGroupExpansion?.expandedRowGroupIds || []);
      this.pendingExpansion = ids;
      this.applyPendingExpansion();
    }
    if (want('rowPinning') && this.gos.enableRowPinning) this.setManualPins(state.rowPinning || {}, source);
    if (want('rowSelection') && this.isSsrm()) {
      const rs = state.rowSelection;
      this.setServerSideSelectionState(Array.isArray(rs) ? { selectAll: false, toggledNodes: rs } : rs, source);
    } else if (want('rowSelection') && Array.isArray(state.rowSelection ?? [])) {
      const ids = new Set(state.rowSelection || []);
      const nodes = [];
      this.forEachNodeAll(n => nodes.push(n));
      const on = nodes.filter(n => ids.has(n.id));
      this.deselectAllNodes('all', source);
      if (on.length) this.setNodesSelected(on, true, source);
    }
    if (want('pagination') && this.gos.pagination) {
      const p = state.pagination || {};
      if (p.pageSize != null) {
        this.pageSizeOverride = p.pageSize;
        this.refreshModel({ skipFilter: true, keepRenderedRows: true });
      }
      this.paginationGoToPage(p.page ?? 0);
    }
    if (want('focusedCell')) {
      const fc = state.focusedCell;
      if (fc) this.setFocusedCell(fc.rowIndex, fc.colId, { rowPinned: fc.rowPinned || null });
      else this.focus = null;
    }
    if (want('cellSelection') && this.addCellRange) {
      this.clearRanges();
      for (const r of state.cellSelection?.cellRanges || []) {
        this.addCellRange({
          rowStartIndex: r.startRow?.rowIndex,
          rowStartPinned: r.startRow?.rowPinned,
          rowEndIndex: r.endRow?.rowIndex,
          rowEndPinned: r.endRow?.rowPinned,
          columns: r.colIds,
          columnStart: r.startColId,
        });
      }
    }
    if (want('sideBar') && this.sideBarDef) {
      const sb = state.sideBar;
      this.sideBarVisible = sb ? !!sb.visible : true;
      if (sb?.position) this.sideBarPosition = sb.position === 'left' ? 'left' : 'right';
      if (sb?.openToolPanel) this.openToolPanel(sb.openToolPanel, 'api');
      else if (this.sideBarOpenId) this.closeToolPanel('api');
    }
    if (want('scroll')) {
      const sc = state.scroll || { top: 0, left: 0 };
      if (this.viewport) this.applyScrollState(sc);
      else this.pendingStateScroll = sc;
    }
    this.notify();
  },

  applyScrollState(sc) {
    const vp = this.viewport;
    if (!vp) return;
    if (sc.top != null) vp.setScrollTop?.(sc.top);
    if (sc.left != null) vp.setScrollLeft?.(sc.left);
  },

  // 그룹 노드는 그룹핑 후에 생기므로 펼침 상태는 대기열(pendingExpansion)로 두고 그룹 파이프라인 직후 적용
  applyExpansionIds() {
    const ids = this.pendingExpansion;
    if (!ids) return false;
    let changed = false;
    const setNode = n => {
      if (n.id == null) return;
      const want = ids.has(n.id);
      if (!!n.expanded !== want && (n.group || n.master)) {
        n.expanded = want;
        changed = true;
      }
    };
    this.groupNodeCache?.forEach(setNode);
    this.rootNodes.forEach(setNode);
    // 그룹 노드가 아직 없으면 다음 그룹핑 때 다시 적용
    if (this.groupNodeCache?.size || !this.groupMode) this.pendingExpansion = null;
    return changed;
  },

  applyPendingExpansion() {
    if (this.applyExpansionIds()) this.refreshModel({ skipFilter: true, keepRenderedRows: true });
  },

  applyColumnStateFromGridState(state, keys, partial) {
    const cols = this.allColumns.filter(c => !c.isPivotResult && !c.autoType);
    const per = new Map(cols.map(c => [c.colId, { colId: c.colId }]));
    const set = (id, k, v) => {
      const o = per.get(id);
      if (o) o[k] = v;
    };
    if (keys.has('columnSizing') && (state.columnSizing || !partial)) {
      for (const m of state.columnSizing?.columnSizingModel || []) {
        if (m.width != null) set(m.colId, 'width', m.width);
        set(m.colId, 'flex', m.flex ?? null);
      }
    }
    if (keys.has('columnVisibility') && (state.columnVisibility || !partial)) {
      const hidden = new Set(state.columnVisibility?.hiddenColIds || []);
      cols.forEach(c => set(c.colId, 'hide', hidden.has(c.colId)));
    }
    if (keys.has('columnPinning') && (state.columnPinning || !partial)) {
      const l = new Set(state.columnPinning?.leftColIds || []);
      const r = new Set(state.columnPinning?.rightColIds || []);
      cols.forEach(c => set(c.colId, 'pinned', l.has(c.colId) ? 'left' : r.has(c.colId) ? 'right' : null));
    }
    if (keys.has('sort') && (state.sort || !partial)) {
      const model = state.sort?.sortModel || [];
      const idx = new Map(model.map((m, i) => [m.colId, i]));
      cols.forEach(c => {
        const i = idx.get(c.colId);
        set(c.colId, 'sort', i != null ? model[i].sort : null);
        set(c.colId, 'sortIndex', i != null ? i : null);
      });
    }
    if (keys.has('rowGroup') && (state.rowGroup || !partial)) {
      const ids = state.rowGroup?.groupColIds || [];
      cols.forEach(c => {
        const i = ids.indexOf(c.colId);
        set(c.colId, 'rowGroup', i >= 0);
        set(c.colId, 'rowGroupIndex', i >= 0 ? i : null);
      });
    }
    if (keys.has('aggregation') && (state.aggregation || !partial)) {
      const m = new Map((state.aggregation?.aggregationModel || []).map(a => [a.colId, a.aggFunc]));
      cols.forEach(c => set(c.colId, 'aggFunc', m.get(c.colId) ?? null));
    }
    let pivotMode;
    if (keys.has('pivot') && (state.pivot || !partial)) {
      const ids = state.pivot?.pivotColIds || [];
      cols.forEach(c => {
        const i = ids.indexOf(c.colId);
        set(c.colId, 'pivot', i >= 0);
        set(c.colId, 'pivotIndex', i >= 0 ? i : null);
      });
      pivotMode = !!state.pivot?.pivotMode;
    }
    const order = keys.has('columnOrder') && state.columnOrder?.orderedColIds;
    const list = order ? [...order.map(id => per.get(id)).filter(Boolean), ...[...per.values()].filter(o => !order.includes(o.colId))] : [...per.values()];
    this.applyColumnState({ state: list, applyOrder: !!order });
    if (pivotMode !== undefined && pivotMode !== this.isPivotActive()) this.setPivotMode(pivotMode);
  },

  // stateUpdated: 상태 관련 이벤트를 모아 한 번에 (AG 동일 이벤트 이름/모양)
  noteStateChange(type) {
    const src = EVENT_SOURCES[type];
    if (!src || this.initializing) return;
    if (type === 'columnResized' && this.__lastResizeUnfinished) return;
    if (!this.__stateSources) this.__stateSources = new Set();
    src.forEach(s => this.__stateSources.add(s));
    if (this.__stateTimer) return;
    this.__stateTimer = this.setTimer(() => {
      this.__stateTimer = null;
      const sources = [...this.__stateSources];
      this.__stateSources = null;
      this.dispatchStateUpdated(sources);
    }, 0);
  },

  dispatchStateUpdated(sources) {
    if (!this.gos.onStateUpdated && !this.events.hasListeners?.('stateUpdated')) return;
    this.dispatch('stateUpdated', { sources, state: this.getState() });
  },

  // 영역별 최상위 헤더 항목 (그룹 또는 그룹 없는 컬럼) — getCenterDisplayedColumnGroups 등
  displayedGroupsOf(section) {
    const cols = section === 'left' ? this.displayedLeft : section === 'right' ? this.displayedRight : this.displayedCenter;
    const out = [];
    for (const c of cols) {
      const top = c.groupChain?.[0] || c;
      if (out[out.length - 1] !== top) out.push(top);
    }
    return out;
  },

  // ── 값 컬럼 / 집계 ───────────────────────────────────────
  defaultAggFuncFor(col) {
    const cd = col.colDef;
    if (cd.defaultAggFunc) return cd.defaultAggFunc;
    if (Array.isArray(cd.allowedAggFuncs) && cd.allowedAggFuncs.length) return cd.allowedAggFuncs[0];
    return 'sum';
  },

  setColumnsAggFunc(entries, source = 'api') {
    const changed = [];
    for (const [col, fn] of entries) {
      if (!col || col.isPivotResult || col.autoType) continue;
      const next = fn ?? null;
      if ((col.aggFunc ?? null) === next && (col.colDef.aggFunc ?? null) === next) continue;
      col.aggFunc = next;
      col.colDef = { ...col.colDef, aggFunc: next ?? undefined };
      changed.push(col);
    }
    if (!changed.length) return;
    this.afterAggregationChange();
    this.dispatch('columnValueChanged', { columns: changed, column: changed.length === 1 ? changed[0] : null, source });
  },

  afterAggregationChange() {
    this.groupsDirty = true;
    this.applyPivotResultColumns?.(true);
    this.columnsVersion++;
    this.layoutColumns();
    this.refreshModel({});
    this.notify();
  },

  setValueColumns(keys, source = 'api') {
    const want = new Set(this.getColumnsFromKeys(keys));
    const entries = [];
    this.allColumns.forEach(c => {
      if (c.isPivotResult || c.autoType) return;
      if (want.has(c)) entries.push([c, c.colDef.aggFunc || this.defaultAggFuncFor(c)]);
      else if (c.colDef.aggFunc) entries.push([c, null]);
    });
    this.setColumnsAggFunc(entries, source);
  },

  addValueColumns(keys, source = 'api') {
    this.setColumnsAggFunc(
      this.getColumnsFromKeys(keys)
        .filter(c => !c.colDef.aggFunc)
        .map(c => [c, this.defaultAggFuncFor(c)]),
      source,
    );
  },

  removeValueColumns(keys, source = 'api') {
    this.setColumnsAggFunc(this.getColumnsFromKeys(keys).map(c => [c, null]), source);
  },

  moveRowGroupColumn(fromIndex, toIndex) {
    const list = this.rowGroupColumns();
    if (fromIndex < 0 || fromIndex >= list.length) return;
    const [c] = list.splice(fromIndex, 1);
    list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, c);
    this.api.setRowGroupColumns(list);
  },

  // ── 일괄 편집 (AG v34 Batch Edit) ─────────────────────────
  //  편집 결과를 바로 데이터에 쓰지 않고 보류 → commit 시 한 번에 반영(cellValueChanged), cancel 시 버림
  startBatchEdit() {
    if (this.batch) return;
    this.batch = new Map();
    this.notify();
    this.dispatch('batchEditingStarted', {});
  },

  isBatchEditing() {
    return !!this.batch;
  },

  batchKey(node, column) {
    return `${node.id}|${column.colId}`;
  },

  getBatchValue(node, column) {
    const b = this.batch;
    if (!b || !b.size) return undefined;
    return b.get(this.batchKey(node, column));
  },

  hasBatchValue(node, column) {
    return !!this.batch?.has(this.batchKey(node, column));
  },

  // commitCellEditor 에서 호출: 보류 목록에 기록 (원래 값과 같아지면 제거)
  stageBatchValue(node, column, newValue, oldValue) {
    const k = this.batchKey(node, column);
    const entry = this.batch.get(k);
    const original = entry ? entry.original : oldValue;
    if (original === newValue) this.batch.delete(k);
    else this.batch.set(k, { node, column, value: newValue, original });
    node.__version++;
    this.spanEpoch = (this.spanEpoch || 0) + 1;
    return true;
  },

  commitBatchEdit() {
    const b = this.batch;
    if (!b) return;
    if (this.editing) this.stopEditing(false);
    this.batch = null;
    this.beginUndoBatch();
    const rows = new Set();
    for (const { node, column, value, original } of b.values()) {
      if (this.gos.readOnlyEdit) {
        this.dispatch('cellEditRequest', { ...this.cellEventParams(node, column), oldValue: original, newValue: value, value, source: 'edit' });
      } else if (this.setCellValue(node, column, value, 'edit', original)) rows.add(node);
    }
    this.endUndoBatch();
    if (this.gos.editType === 'fullRow') rows.forEach(n => this.dispatch('rowValueChanged', this.rowEventParams(n)));
    this.refreshModel({ keepRenderedRows: true });
    this.notify();
    this.dispatch('batchEditingStopped', { changes: [...b.values()].map(e => ({ rowNode: e.node, column: e.column, oldValue: e.original, newValue: e.value })) });
  },

  cancelBatchEdit() {
    const b = this.batch;
    if (!b) return;
    if (this.editing) this.stopEditing(true);
    this.batch = null;
    b.forEach(({ node }) => node.__version++);
    this.spanEpoch = (this.spanEpoch || 0) + 1;
    this.notify();
    this.dispatch('batchEditingStopped', { changes: [] });
  },

  // 편집 중/보류 중인 행 값 (AG getEditRowValues)
  getEditRowValues(node) {
    if (!node) return undefined;
    const out = {};
    let any = false;
    this.batch?.forEach(e => {
      if (e.node === node) {
        out[e.column.colId] = e.value;
        any = true;
      }
    });
    if (this.editing && this.editing.node === node) {
      for (const c of this.editing.cells.values()) {
        out[c.column.colId] = c.value;
        any = true;
      }
    }
    return any ? out : undefined;
  },
};
