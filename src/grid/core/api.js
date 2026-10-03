// AG-Grid GridApi 호환 객체. 한 그리드당 하나, 그리드 수명 동안 동일 참조(ref.current.api 캐시 안전).
import { localeText } from './locale.js';
import { copySelectionToClipboard, cutSelectionToClipboard, buildClipboardText } from './clipboard.js';
import { exportDataAsCsv, getDataAsCsv } from './exporter.js';
import {
  exportDataAsExcel,
  exportMultipleSheetsAsExcel,
  getDataAsExcel,
  getMultipleSheetsAsExcel,
  getSheetDataForExcel,
} from './excel.js';
import { copyTextToClipboard } from './utils.js';

export function createApi(core) {
  const asyncQueue = { txs: [], timer: null };
  const detailGrids = new Map();

  const api = {
    // ── 그리드 ──
    getGridId: () => core.gridId,
    isDestroyed: () => core.destroyed,
    destroy: () => core.destroy(),
    getGridOption: key => core.gos[key],
    setGridOption: (key, value) => core.setGridOption(key, value),
    updateGridOptions: options => core.updateGridOptions(options || {}),

    // ── 이벤트 ──
    addEventListener: (type, listener) => core.events.addEventListener(type, listener),
    removeEventListener: (type, listener) => core.events.removeEventListener(type, listener),
    addGlobalListener: listener => core.events.addGlobalListener(listener),
    removeGlobalListener: listener => core.events.removeGlobalListener(listener),

    // ── 행 ──
    getRowNode: id => (id == null ? undefined : core.nodeById.get(String(id))),
    forEachNode: callback => core.forEachNodeAll(callback),
    forEachLeafNode: callback => core.rootNodes.forEach((n, i) => callback(n, i)),
    forEachNodeAfterFilter: callback => core.filteredNodes.forEach((n, i) => callback(n, i)),
    forEachNodeAfterFilterAndSort: callback => core.sortedNodes.forEach((n, i) => callback(n, i)),
    getDisplayedRowAtIndex: index => core.displayedNodes[index],
    getDisplayedRowCount: () => core.displayedNodes.length,
    getFirstDisplayedRowIndex: () => Math.max(core.renderedRange.first, 0),
    getLastDisplayedRowIndex: () => Math.max(core.renderedRange.last, 0),
    getRenderedNodes: () => core.getRenderedNodes(),
    isRowDataEmpty: () => core.rootNodes.length === 0,
    applyTransaction: tx => core.applyTransaction(tx || {}),
    applyTransactionAsync: (tx, callback) => {
      asyncQueue.txs.push({ tx, callback });
      if (asyncQueue.timer) return;
      asyncQueue.timer = setTimeout(() => api.flushAsyncTransactions(), core.gos.asyncTransactionWaitMillis ?? 50);
    },
    flushAsyncTransactions: () => {
      clearTimeout(asyncQueue.timer);
      asyncQueue.timer = null;
      const items = asyncQueue.txs;
      asyncQueue.txs = [];
      items.forEach(({ tx, callback }) => {
        const res = core.applyTransaction(tx || {});
        callback?.(res);
      });
    },
    refreshClientSideRowModel: () => core.refreshModel({}),
    onSortChanged: () => core.refreshModel({ skipFilter: true }),
    resetRowHeights: () => {
      core.rootNodes.forEach(n => {
        n.__explicitHeight = null;
        n.__autoHeight = null;
      });
      core.onRowHeightChanged();
    },
    onRowHeightChanged: () => core.onRowHeightChanged(),
    setRowNodeExpanded: (node, expanded) => node && core.setNodeExpanded(node, !!expanded),
    expandAll: () => {
      core.rootNodes.forEach(n => {
        if (n.master || n.group) n.expanded = true;
      });
      core.groupNodeCache?.forEach(n => {
        n.expanded = true;
      });
      core.refreshModel({ skipFilter: true, keepRenderedRows: true });
    },
    collapseAll: () => {
      core.rootNodes.forEach(n => {
        n.expanded = false;
      });
      core.groupNodeCache?.forEach(n => {
        n.expanded = false;
      });
      core.refreshModel({ skipFilter: true, keepRenderedRows: true });
    },

    // ── 렌더 ──
    refreshCells: () => core.notify(),
    redrawRows: (params = {}) => {
      const nodes = params.rowNodes?.length ? params.rowNodes : core.getRenderedNodes();
      nodes.forEach(n => {
        n.__redraw = (n.__redraw || 0) + 1;
      });
      core.notify();
    },
    refreshHeader: () => core.notify(),
    flashCells: (params = {}) => core.flashCells(params),
    getCellRendererInstances: () => [],
    getSizesForCurrentTheme: () => ({ rowHeight: core.getDefaultRowHeight(), headerHeight: core.gos.headerHeight ?? 48 }),
    getCellValue: ({ rowNode, colKey, useFormatter }) => {
      const col = core.getColumn(colKey);
      if (!col || !rowNode) return undefined;
      const v = core.getCellValue(rowNode, col);
      if (!useFormatter) return v;
      return core.formatValue(rowNode, col, v) ?? v;
    },

    // ── 선택 ──
    getSelectedNodes: () => core.getSelectedNodes(),
    getSelectedRows: () => core.getSelectedRows(),
    selectAll: (a, b) => {
      const mode = a === 'filtered' || a === 'currentPage' || a === 'all' ? a : 'all';
      const source = mode === a ? b : a;
      core.selectAllNodes(mode, source || 'apiSelectAll');
    },
    deselectAll: (a, b) => {
      const mode = a === 'filtered' || a === 'currentPage' || a === 'all' ? a : 'all';
      const source = mode === a ? b : a;
      core.deselectAllNodes(mode, source || 'apiSelectAll');
    },
    selectAllFiltered: source => core.selectAllNodes('filtered', source || 'apiSelectAllFiltered'),
    deselectAllFiltered: source => core.deselectAllNodes('filtered', source || 'apiSelectAllFiltered'),
    selectAllOnCurrentPage: source => core.selectAllNodes('currentPage', source || 'apiSelectAllCurrentPage'),
    deselectAllOnCurrentPage: source => core.deselectAllNodes('currentPage', source || 'apiSelectAllCurrentPage'),
    setNodesSelected: ({ nodes, newValue, source }) => core.setNodesSelected(nodes, !!newValue, source || 'api'),

    // ── 포커스 ──
    getFocusedCell: () => core.getFocusedCell(),
    setFocusedCell: (rowIndex, colKey, rowPinned) => core.setFocusedCell(rowIndex, colKey, { forceBrowserFocus: true, rowPinned }),
    clearFocusedCell: () => core.clearFocusedCell(),
    tabToNextCell: () => core.handleKeyDown(new KeyboardEvent('keydown', { key: 'Tab' })),
    tabToPreviousCell: () => core.handleKeyDown(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true })),

    // ── 편집 ──
    startEditingCell: ({ rowIndex, colKey, key }) => {
      const node = core.displayedNodes[rowIndex];
      const col = core.getColumn(colKey);
      if (!node || !col) return;
      core.ensureIndexVisible(rowIndex);
      core.ensureColumnVisible(col);
      core.startEdit(node, col, key ?? null, 'api');
    },
    stopEditing: cancel => core.stopEditing(!!cancel),
    getEditingCells: () =>
      core.editing
        ? [...core.editing.cells.values()].map(c => ({ rowIndex: c.node.rowIndex, column: c.column, rowPinned: c.node.rowPinned || null }))
        : [],
    getCellEditorInstances: () => (core.editing ? [...core.editing.cells.values()].map(c => c.ref.current).filter(Boolean) : []),
    isEditing: () => !!core.editing,

    // ── 셀 범위 ──
    getCellRanges: () => core.getCellRanges(),
    addCellRange: params => core.addCellRange(params || {}),
    clearCellSelection: () => core.clearRanges(),
    clearRangeSelection: () => core.clearRanges(),

    // ── 클립보드 ──
    copyToClipboard: (params = {}) => copySelectionToClipboard(core, params),
    copySelectedRangeToClipboard: (params = {}) => copySelectionToClipboard(core, params),
    copySelectedRowsToClipboard: (params = {}) => {
      const nodes = core.getSelectedNodes().filter(n => n.displayed).sort((a, b) => a.rowIndex - b.rowIndex);
      const columns = params.columnKeys
        ? core.getColumnsFromKeys(params.columnKeys)
        : core.displayedColumns.filter(c => c.autoType !== 'selection');
      const text = buildClipboardText(core, [{ nodes, columns }], params.includeHeaders ?? !!core.gos.copyHeadersToClipboard);
      copyTextToClipboard(text);
    },
    copySelectedRangeDown: () => {},
    cutToClipboard: () => cutSelectionToClipboard(core),
    pasteFromClipboard: () => {
      navigator.clipboard?.readText?.().then(t => core.pasteText(t)).catch(() => {});
    },

    // ── 스크롤 ──
    ensureIndexVisible: (index, position) => core.ensureIndexVisible(index, position),
    ensureNodeVisible: (node, position) => core.ensureNodeVisible(node, position),
    ensureColumnVisible: (key, position) => core.ensureColumnVisible(key, position),
    getVerticalPixelRange: () => {
      const vp = core.viewport;
      const top = vp ? vp.getScrollTop() : 0;
      return { top, bottom: top + (vp ? vp.getClientHeight() : 0) };
    },
    getHorizontalPixelRange: () => {
      const vp = core.viewport;
      const left = vp ? vp.getScrollLeft() : 0;
      return { left, right: left + (vp ? vp.getCenterWidth() : 0) };
    },

    // ── 컬럼 ──
    getColumn: key => core.getColumn(key),
    getColumns: () => [...core.allColumns],
    getAllGridColumns: () => [...core.allColumns],
    getAllDisplayedColumns: () => [...core.displayedColumns],
    getAllDisplayedVirtualColumns: () => [...core.displayedColumns],
    getDisplayedLeftColumns: () => [...core.displayedLeft],
    getDisplayedCenterColumns: () => [...core.displayedCenter],
    getDisplayedRightColumns: () => [...core.displayedRight],
    getDisplayedColAfter: col => {
      const i = core.displayedIndex.get(core.getColumn(col)?.colId);
      return i == null ? null : core.displayedColumns[i + 1] ?? null;
    },
    getDisplayedColBefore: col => {
      const i = core.displayedIndex.get(core.getColumn(col)?.colId);
      return i == null ? null : core.displayedColumns[i - 1] ?? null;
    },
    getColumnDefs: () => core.allColumns.filter(c => !c.isAuto).map(c => ({
      ...c.colDef,
      colId: c.colId,
      hide: !c.visible,
      pinned: c.pinned,
      width: c.actualWidth,
      sort: c.sort || null,
      sortIndex: c.sortIndex,
      flex: c.flex,
    })),
    getColumnDef: key => core.getColumn(key)?.colDef ?? null,
    getDisplayNameForColumn: col => core.getDisplayName(core.getColumn(col)),
    getColumnState: () => core.getColumnState(),
    applyColumnState: params => core.applyColumnState(params || {}),
    resetColumnState: () => core.resetColumnState(),
    setColumnsVisible: (keys, visible) => core.setColumnsVisible(keys, visible, 'api'),
    setColumnVisible: (key, visible) => core.setColumnsVisible([key], visible, 'api'),
    setColumnsPinned: (keys, pinned) => core.setColumnsPinned(keys, pinned, 'api'),
    setColumnPinned: (key, pinned) => core.setColumnsPinned([key], pinned, 'api'),
    setColumnWidths: (widths, finished = true, source = 'api') =>
      (widths || []).forEach(w => core.setColumnWidth(w.key, w.newWidth, finished, source)),
    setColumnWidth: (key, newWidth, finished = true, source = 'api') => core.setColumnWidth(key, newWidth, finished, source),
    moveColumns: (keys, toIndex) => core.moveColumns(keys, toIndex, 'api'),
    moveColumn: (key, toIndex) => core.moveColumns([key], toIndex, 'api'),
    moveColumnByIndex: (fromIndex, toIndex) => {
      const col = core.allColumns[fromIndex];
      if (col) core.moveColumns([col], toIndex, 'api');
    },
    autoSizeColumns: (keys, skipHeader) => {
      if (keys && !Array.isArray(keys) && typeof keys === 'object') {
        core.autoSizeColumns(keys.colIds, keys.skipHeader);
      } else core.autoSizeColumns(keys, skipHeader);
    },
    autoSizeColumn: (key, skipHeader) => core.autoSizeColumns([key], skipHeader),
    autoSizeAllColumns: skipHeader => core.autoSizeColumns(null, skipHeader),
    sizeColumnsToFit: params => core.sizeColumnsToFit(params),
    getColumnGroup: id => core.getColumnGroup(id),
    getProvidedColumnGroup: id => core.getColumnGroup(id),
    getAllDisplayedColumnGroups: () => core.columnTree,
    getColumnGroupState: () => core.getColumnGroupState(),
    setColumnGroupState: state => core.setColumnGroupState(state),
    resetColumnGroupState: () =>
      core.setColumnGroupState([...core.groupById.values()].map(g => ({ groupId: g.groupId, open: !!g.colGroupDef.openByDefault }))),
    setColumnGroupOpened: (group, open) => core.setColumnGroupOpened(group, open),
    isPinning: () => core.displayedLeft.length > 0 || core.displayedRight.length > 0,
    isPinningLeft: () => core.displayedLeft.length > 0,
    isPinningRight: () => core.displayedRight.length > 0,

    // ── 필터 ──
    setFilterModel: model => core.setFilterModel(model),
    getFilterModel: () => core.getFilterModel(),
    setColumnFilterModel: (key, model) => {
      core.setColumnFilterModel(key, model, false);
      return Promise.resolve();
    },
    getColumnFilterModel: key => core.getColumnFilterModel(key),
    getColumnFilterInstance: key => {
      const col = core.getColumn(key);
      if (!col || !col.colDef.filter) return Promise.resolve(null);
      if (core.isCustomFilter(col)) {
        // 마운트 직후 ref 가 붙도록 다음 틱에 반환
        core.getCustomFilterEntry(col, true);
        return new Promise(res => setTimeout(() => res(core.getCustomFilterInstance(col)), 0));
      }
      return Promise.resolve({
        getModel: () => core.getColumnFilterModel(col),
        setModel: model => {
          core.setColumnFilterModel(col, model, false);
          return Promise.resolve();
        },
        isFilterActive: () => col.filterActive,
        applyModel: () => true,
        refresh: () => true,
        resetFilterValues: () => {},
        refreshFilterValues: () => {},
        setFilterValues: () => {},
        getFilterKeys: () => core.getSetFilterValues(col).map(e => e.key),
      });
    },
    destroyFilter: key => core.setColumnFilterModel(key, null, true),
    onFilterChanged: source => core.onFilterChanged(source || 'api'),
    isAnyFilterPresent: () => core.isAnyFilterPresent(),
    isColumnFilterPresent: () => [...core.filterModels.keys()].length > 0,
    getQuickFilter: () => core.gos.quickFilterText,
    resetQuickFilter: () => {
      core.quickFilterVersion++;
      core.refreshModel({});
    },
    showColumnFilter: key => {
      const col = core.getColumn(key);
      if (col) core.openPopup({ type: 'filter', column: col, anchorColId: col.colId });
    },
    hideColumnFilter: () => core.closePopup(),

    // ── 메뉴 ──
    showColumnMenu: key => {
      const col = core.getColumn(key);
      if (col) core.openPopup({ type: 'columnMenu', column: col, anchorColId: col.colId });
    },
    showColumnMenuAfterButtonClick: (key, button) => {
      const col = core.getColumn(key);
      if (col) core.openPopup({ type: 'columnMenu', column: col, anchorEl: button });
    },
    showColumnMenuAfterMouseClick: (key, event) => {
      const col = core.getColumn(key);
      if (col) core.openPopup({ type: 'columnMenu', column: col, x: event.clientX, y: event.clientY });
    },
    hidePopupMenu: () => core.closePopup(),
    showContextMenu: (params = {}) => {
      const node = params.rowNode ?? null;
      const column = params.column ? core.getColumn(params.column) : null;
      core.openContextMenu({ node, column, x: params.x ?? 0, y: params.y ?? 0 });
    },
    showColumnChooser: () => core.openPopup({ type: 'columnChooser' }),
    hideColumnChooser: () => core.closePopup(),

    // ── 오버레이 ──
    showLoadingOverlay: () => {
      core.manualOverlay = 'loading';
      core.notify();
    },
    showNoRowsOverlay: () => {
      core.manualOverlay = 'noRows';
      core.notify();
    },
    hideOverlay: () => {
      core.manualOverlay = 'hidden';
      core.notify();
    },

    // ── 페이지네이션 ──
    paginationIsLastPageFound: () => true,
    paginationGetPageSize: () => core.getPageSize(),
    paginationGetCurrentPage: () => core.currentPage,
    paginationGetTotalPages: () => core.totalPages,
    paginationGetRowCount: () => core.paginationRowCount ?? core.displayedNodes.length,
    paginationGoToPage: page => core.paginationGoToPage(page),
    paginationGoToNextPage: () => core.paginationGoToPage(core.currentPage + 1),
    paginationGoToPreviousPage: () => core.paginationGoToPage(core.currentPage - 1),
    paginationGoToFirstPage: () => core.paginationGoToPage(0),
    paginationGoToLastPage: () => core.paginationGoToPage(core.totalPages - 1),

    // ── 사이드바 ──
    isSideBarVisible: () => !!core.sideBarDef && core.sideBarVisible,
    setSideBarVisible: visible => {
      core.sideBarVisible = !!visible;
      core.notify();
    },
    setSideBarPosition: position => {
      core.sideBarPosition = position === 'left' ? 'left' : 'right';
      core.notify();
    },
    openToolPanel: key => core.openToolPanel(key, 'api'),
    closeToolPanel: () => core.closeToolPanel('api'),
    getOpenedToolPanel: () => core.sideBarOpenId,
    isToolPanelShowing: () => !!core.sideBarOpenId,
    refreshToolPanel: () => core.notify(),
    getToolPanelInstance: id => core.toolPanelInstances?.get(id),
    getSideBar: () => core.sideBarDef,
    getStatusPanel: key => core.getStatusPanel(key),
    // ── Find ──
    findNext: () => core.findNext(),
    findPrevious: () => core.findPrevious(),
    findGoTo: match => core.findGoTo(match),
    findClearActive: () => core.findClearActive(),
    findGetActiveMatch: () => core.findGetActiveMatch(),
    findGetTotalMatches: () => core.findGetTotalMatches(),
    findGetNumMatches: p => core.findGetNumMatches(p),
    findGetParts: p => core.findGetParts(p.node, core.getColumn(p.column), p.value) || [{ value: p.value }],
    findRefresh: () => core.findRefresh(),

    // ── 내보내기 ──
    exportDataAsCsv: params => exportDataAsCsv(core, params),
    getDataAsCsv: params => getDataAsCsv(core, params),
    exportDataAsExcel: params => exportDataAsExcel(core, params),
    getDataAsExcel: params => getDataAsExcel(core, params),
    getMultipleSheetsAsExcel: params => getMultipleSheetsAsExcel(core, params),
    exportMultipleSheetsAsExcel: params => exportMultipleSheetsAsExcel(core, params),
    getSheetDataForExcel: params => getSheetDataForExcel(core, params),

    // ── 마스터/디테일 ──
    getDetailGridInfo: id => detailGrids.get(id),
    forEachDetailGridInfo: cb => [...detailGrids.values()].forEach((info, i) => cb(info, i)),
    addDetailGridInfo: (id, info) => detailGrids.set(id, info),
    removeDetailGridInfo: id => detailGrids.delete(id),

    // ── 고정 행 ──
    getPinnedTopRowCount: () => core.pinnedTop.length,
    getPinnedBottomRowCount: () => core.pinnedBottom.length,
    getPinnedTopRow: index => core.pinnedTop[index],
    getPinnedBottomRow: index => core.pinnedBottom[index],
    forEachPinnedTopRow: cb => core.pinnedTop.forEach((n, i) => cb(n, i)),

    // ── 행 그룹 ──
    getRowGroupColumns: () => core.rowGroupColumns(),
    setRowGroupColumns: keys => {
      const cols = core.getColumnsFromKeys(keys);
      core.allColumns.forEach(c => {
        const i = cols.indexOf(c);
        c.rowGroup = i >= 0;
        c.rowGroupIndex = i >= 0 ? i : null;
      });
      core.groupMode = core.computeGroupMode();
      core.groupsDirty = true;
      core.buildColumns(false);
      core.refreshModel({});
      core.dispatch('columnRowGroupChanged', { columns: cols, source: 'api' });
    },
    addRowGroupColumns: keys => {
      const cur = core.rowGroupColumns();
      api.setRowGroupColumns([...cur, ...core.getColumnsFromKeys(keys).filter(c => !cur.includes(c))]);
    },
    removeRowGroupColumns: keys => {
      const rm = core.getColumnsFromKeys(keys);
      api.setRowGroupColumns(core.rowGroupColumns().filter(c => !rm.includes(c)));
    },

    // ── 통합 차트 ──
    createRangeChart: params => core.createRangeChart(params),
    getChartModels: () => core.getChartModels(),
    getChartRef: id => core.getChartRef(id),
    updateChart: params => core.updateChart(params),
    getChartImageDataURL: params => core.getChartRef(params?.chartId)?.getImageDataURL?.(),
    downloadChart: params => {
      const ref = core.getChartRef(params?.chartId);
      ref?.getImageDataURL?.().then(url => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${params?.fileName || 'chart'}.png`;
        a.click();
      });
    },
    closeChartToolPanel: () => {},
    openChartToolPanel: () => {},

    // ── 고급 필터 ──
    getAdvancedFilterModel: () => core.getAdvancedFilterModel(),
    setAdvancedFilterModel: model => core.setAdvancedFilterModel(model),
    showAdvancedFilterBuilder: () => core.openPopup({ type: 'advancedFilterBuilder' }),
    hideAdvancedFilterBuilder: () => core.popup?.type === 'advancedFilterBuilder' && core.closePopup(),

    // ── 피벗 ──
    isPivotMode: () => core.isPivotActive(),
    setPivotMode: on => core.setPivotMode(on),
    getPivotColumns: () => core.pivotColumns(),
    setPivotColumns: keys => core.setPivotColumns(keys),
    addPivotColumns: keys => core.setPivotColumns([...core.pivotColumns(), ...core.getColumnsFromKeys(keys)]),
    removePivotColumns: keys => {
      const rm = core.getColumnsFromKeys(keys);
      core.setPivotColumns(core.pivotColumns().filter(c => !rm.includes(c)));
    },
    getPivotResultColumns: () => (core.pivotResultColumns?.length ? core.pivotResultColumns : null),
    getPivotResultColumn: (pivotKeys, valueColKey) => {
      const vc = core.getColumn(valueColKey);
      return core.pivotResultColumns?.find(c => c.pivotValueColumn === vc && JSON.stringify(c.colDef.pivotKeys) === JSON.stringify(pivotKeys)) ?? null;
    },
    getValueColumns: () => core.valueColumns(),

    // ── Server-Side Row Model ──
    refreshServerSide: params => core.refreshServerSide(params || {}),
    retryServerSideLoads: () => core.retryServerSideLoads(),
    // ── Infinite 행 모델 ──
    purgeInfiniteCache: () => core.purgeInfiniteCache(),
    refreshInfiniteCache: () => core.refreshInfiniteCache(),
    getInfiniteRowCount: () => (core.isInfinite() ? core.ssrm?.rowCount : undefined),
    isLastRowIndexKnown: () => (core.isSsrm() ? !!core.ssrm?.lastRowKnown : undefined),
    setRowCount: (count, lastRowIndexKnown) => core.setInfiniteRowCount(count, lastRowIndexKnown),
    getCacheBlockState: () => core.getCacheBlockState(),
    getServerSideGroupLevelState: () =>
      core.ssrm ? [{ route: [], rowCount: core.ssrm.rowCount, lastRowIndexKnown: core.ssrm.lastRowKnown }] : [],
    applyServerSideTransaction: () => undefined,

    // ── 편집 undo/redo ──
    undoCellEditing: () => core.undoCellEditing('api'),
    redoCellEditing: () => core.redoCellEditing('api'),
    getCurrentUndoSize: () => core.undoStack?.length ?? 0,
    getCurrentRedoSize: () => core.redoStack?.length ?? 0,

    // ── 기타 ──
    getLocaleText: key => localeText(core, key),
  };
  // alignedGrids 등 그리드 간 연동용 (열거되지 않는 내부 참조)
  Object.defineProperty(api, '__r2core', { value: core, enumerable: false });
  return api;
}
