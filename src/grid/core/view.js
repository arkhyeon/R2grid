// 화면 부가 요소: 깜빡임·사이드바·RTL·셀 병합·팝업·오버레이·툴팁
//  GridCore.prototype 에 합쳐짐 (this = GridCore)
import { localeText } from './locale.js';
import { getFieldValue } from './utils.js';

export const viewMethods = {
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
  },

  getFlash(nodeId, colId) {
    if (!this.flashes.size) return null;
    return this.flashes.get(`${nodeId}|${colId}`) || null;
  },

  // ── 사이드바 ─────────────────────────────────────────────
  normalizeSideBar(initial) {
    const sb = this.gos.sideBar;
    const builtin = rawId => {
      const id = rawId;
      if (id === 'columns' || id === 'r2ColumnsToolPanel') {
        return {
          id: 'columns',
          labelDefault: localeText(this, 'columns'),
          labelKey: 'columns',
          iconKey: 'columns',
          toolPanel: 'r2ColumnsToolPanel',
        };
      }
      if (id === 'filters' || id === 'r2FiltersToolPanel') {
        return {
          id: 'filters',
          labelDefault: localeText(this, 'filters'),
          labelKey: 'filters',
          iconKey: 'filter',
          toolPanel: 'r2FiltersToolPanel',
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
  },

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
  },

  closeToolPanel(source = 'api') {
    const prev = this.sideBarOpenId;
    if (!prev) return;
    this.sideBarOpenId = null;
    this.notify();
    this.dispatch('toolPanelVisibleChanged', { source, key: prev, visible: false, switchingToolPanel: false });
  },

  onSideButtonClick(id) {
    if (this.sideBarOpenId === id) this.closeToolPanel('sideBarButtonClicked');
    else this.openToolPanel(id, 'sideBarButtonClicked');
  },

  // ── RTL (enableRtl) ──
  isRtl() {
    return !!this.gos.enableRtl;
  },

  // 컬럼 시작 위치 스타일: LTR 은 left, RTL 은 right (컬럼 left 값은 "시작 기준" 오프셋)
  colPos(offset) {
    return this.isRtl() ? { right: offset } : { left: offset };
  },

  // ── 셀 스패닝 (enableCellSpan + colDef.spanRows: true | fn) ──
  // 연속한 행의 값이 같으면 하나의 셀로 병합. 페이지 단위로 컬럼별 스팬 시작 인덱스를 캐시.
  getCellSpan(col, rowIndex) {
    if (!this.gos.enableCellSpan || !col.colDef.spanRows) return null;
    // 모델 갱신·값 변경·페이지 이동 때만 다시 계산
    const key = `${this.spanEpoch || 0}:${this.pageFirstRow}:${this.pageLastRow}:${this.columnsVersion}`;
    if (!this.__spanCache || this.__spanKey !== key || this.__spanNodes !== this.displayedNodes) {
      this.__spanCache = new Map();
      this.__spanKey = key;
      this.__spanNodes = this.displayedNodes;
    }
    let spans = this.__spanCache.get(col.colId);
    if (!spans) {
      spans = this.computeColumnSpans(col);
      this.__spanCache.set(col.colId, spans);
    }
    const i = rowIndex - this.pageFirstRow;
    const start = spans.startOf[i];
    if (start == null) return null;
    return { start: start + this.pageFirstRow, count: spans.count[start] };
  },

  computeColumnSpans(col) {
    const n = this.pageLastRow - this.pageFirstRow;
    const startOf = new Int32Array(n);
    const count = new Int32Array(n);
    const sr = col.colDef.spanRows;
    let prevNode = null;
    let prevVal;
    let start = 0;
    for (let i = 0; i < n; i++) {
      const node = this.displayedNodes[this.pageFirstRow + i];
      const val = node && !node.group && !node.detail && !node.stub ? this.getCellValue(node, col) : undefined;
      let same = false;
      if (i > 0 && prevNode && node && !node.group && !node.detail && !prevNode.group && !prevNode.detail) {
        same =
          typeof sr === 'function'
            ? !!sr({ valueA: prevVal, valueB: val, nodeA: prevNode, nodeB: node, column: col, colDef: col.colDef, api: this.api, context: this.gos.context })
            : val != null && val !== '' && val === prevVal;
      }
      if (!same) start = i;
      startOf[i] = start;
      count[start] = i - start + 1;
      prevNode = node;
      prevVal = val;
    }
    return { startOf, count };
  },

  // 플로팅 필터 행 높이 (표시 컬럼 중 floatingFilter 가 하나라도 있으면)
  getFloatingFiltersHeight(headerHeight) {
    if (this.isAdvancedFilterEnabled()) return 0;
    const has = this.displayedColumns.some(c => !c.isAuto && c.colDef.floatingFilter && c.colDef.filter);
    return has ? (this.gos.floatingFiltersHeight ?? headerHeight) : 0;
  },

  // ── 팝업(메뉴/필터) ────────────────────────────────────────
  // 팝업(메뉴/필터/팝업 에디터) 부모: popupParent 지정 시 그 요소, 아니면 그리드 루트 래퍼 (그리드 안에 갇힘)
  getPopupParent() {
    const p = this.gos.popupParent;
    if (p && typeof p.appendChild === 'function') return p;
    return this.eRoot || this.getDocument().body;
  },

  openPopup(popup) {
    const prev = this.popup;
    this.popup = popup;
    this.notify();
    if (prev?.type === 'advancedFilterBuilder' && popup?.type !== 'advancedFilterBuilder')
      this.dispatch('advancedFilterBuilderVisibleChanged', { visible: false, source: 'api' });
    if (popup?.type === 'filter' || (popup?.type === 'columnMenu' && popup.tab === 'filterMenuTab')) {
      this.dispatch('filterOpened', { column: popup.column, source: popup.source || 'COLUMN_MENU', eGui: null });
    }
    if (popup?.type === 'advancedFilterBuilder') this.dispatch('advancedFilterBuilderVisibleChanged', { visible: true, source: 'ui' });
  },

  closePopup() {
    if (!this.popup) return;
    const p = this.popup;
    this.popup = null;
    this.notify();
    if (p.type === 'advancedFilterBuilder') this.dispatch('advancedFilterBuilderVisibleChanged', { visible: false, source: 'ui' });
    if (p.type === 'columnMenu' || p.type === 'filter') {
      this.dispatch('columnMenuVisibleChanged', { visible: false, switchingTab: false, key: p.tab ?? null, column: p.column ?? null });
    }
  },

  openContextMenu({ node, column, x, y, event }) {
    if (this.gos.suppressContextMenu) return false;
    const value = node && column ? this.getCellValue(node, column) : undefined;
    const defaultItems = ['copy', 'copyWithHeaders', 'paste', 'separator', 'export'];
    // 수동 행 고정: 고정 가능한 행(또는 이미 고정된 복제 행)에서 "행 고정" 하위 메뉴
    if (this.gos.enableRowPinning && node && (node.manualPinned || this.isRowPinnableNode(node))) defaultItems.unshift('pinRowSubMenu', 'separator');
    // 통합 차트: 범위가 있으면 "범위 차트"
    if (this.gos.enableCharts && this.ranges.length) defaultItems.push('separator', 'chartRange');
    if (this.gos.enableCharts && this.isPivotActive?.()) defaultItems.push('separator', 'pivotChart');
    // colDef.contextMenuItems 가 있으면 그 컬럼에선 그리드 설정보다 우선
    const colItems = column?.colDef?.contextMenuItems;
    const getItems = colItems !== undefined ? (Array.isArray(colItems) ? () => colItems : colItems) : this.gos.getContextMenuItems;
    const items =
      typeof getItems === 'function'
        ? getItems({ node: node ?? null, column: column ?? null, value, api: this.api, context: this.gos.context, defaultItems })
        : defaultItems;
    if (!items || !items.length) return true;
    this.openPopup({
      type: 'contextMenu',
      x,
      y,
      items,
      params: { node: node ?? null, column: column ?? null, value, api: this.api, context: this.gos.context },
      event,
    });
    this.dispatch('contextMenuVisibleChanged', { visible: true, source: 'ui' });
    return true;
  },

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
  },

  isClientSide() {
    const t = this.gos.rowModelType;
    return !t || t === 'clientSide';
  },

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
  },
};
