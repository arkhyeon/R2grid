// 행 드래그: rowDragManaged / rowDragEntireRow / rowDragMultiRow / colDef.rowDrag
// 이벤트: rowDragEnter / rowDragMove / rowDragLeave / rowDragEnd / rowDragCancel (AG 동일 파라미터)
export const rowDragMethods = {
  isRowDragEnabled() {
    const g = this.gos;
    if (g.suppressRowDrag) return false;
    return !!g.rowDragEntireRow || this.allColumns.some(c => !!c.colDef.rowDrag);
  },

  // 셀에 드래그 핸들을 그릴지
  showRowDragHandle(node, column) {
    if (this.gos.suppressRowDrag || node.rowPinned || node.detail || node.stub) return false;
    const rd = column.colDef.rowDrag;
    if (!rd) return false;
    if (typeof rd === 'function') return !!rd({ ...this.makeValueParams(node, column), rowIndex: node.rowIndex });
    return true;
  },

  // managed 이동 가능 여부 (AG: 정렬/필터/그룹 중에는 managed 이동 안 함)
  isManagedMoveAllowed() {
    if (!this.gos.rowDragManaged) return false;
    if (!this.isClientSide() || this.isGroupMode()) return false;
    if (this.allColumns.some(c => c.sort)) return false;
    if (this.isAnyFilterPresent()) return false;
    return true;
  },

  rowDragText(node, nodes, column) {
    const fn = column?.colDef.rowDragText || this.gos.rowDragText;
    // AG 기본: 드래그를 시작한 셀(없으면 첫 컬럼)의 값
    const src = column && !column.isAuto ? column : this.displayedColumns.find(c => !c.isAuto);
    const defaultTextValue = nodes.length > 1 ? `${nodes.length} rows` : src ? this.getCellText(node, src) : '';
    if (typeof fn === 'function') {
      return fn({ rowNode: node, rowNodes: nodes, defaultTextValue, rowIndex: node.rowIndex, column }, nodes.length);
    }
    return defaultTextValue;
  },

  dragEventParams(type, overIndex, y, event, vDirection) {
    const d = this.rowDragState;
    const overNode = overIndex != null && overIndex >= 0 ? this.displayedNodes[overIndex] : undefined;
    return { node: d.node, nodes: d.nodes, overIndex: overIndex ?? -1, overNode, y, vDirection, event };
  },

  rowDragStart(node, event, column) {
    const multi = this.gos.rowDragMultiRow && node.selected && this.selected.size > 1;
    const nodes = multi
      ? this.getSelectedNodes().filter(n => n.displayed).sort((a, b) => a.rowIndex - b.rowIndex)
      : [node];
    this.rowDragState = { node, nodes, lastY: event.clientY, overIndex: node.rowIndex, column };
    nodes.forEach(n => {
      n.__dragging = true;
    });
    this.notify();
    this.dispatch('rowDragEnter', this.dragEventParams('rowDragEnter', node.rowIndex, 0, event, null));
    return this.rowDragText(node, nodes, column);
  },

  rowDragMove(overIndex, y, event) {
    const d = this.rowDragState;
    if (!d) return;
    const vDirection = event.clientY > d.lastY ? 'down' : event.clientY < d.lastY ? 'up' : null;
    d.lastY = event.clientY;
    d.overIndex = overIndex;
    const overNode = this.displayedNodes[overIndex];
    if (overNode && !overNode.detail && !d.nodes.includes(overNode) && this.isManagedMoveAllowed()) {
      this.moveNodesManaged(d.nodes, overNode);
    }
    this.dispatch('rowDragMove', this.dragEventParams('rowDragMove', overIndex, y, event, vDirection));
  },

  moveNodesManaged(nodes, overNode) {
    const set = new Set(nodes);
    const origOver = this.rootNodes.indexOf(overNode);
    const origFirst = this.rootNodes.indexOf(nodes[0]);
    const rest = this.rootNodes.filter(n => !set.has(n));
    const overIdx = rest.indexOf(overNode);
    if (overIdx < 0) return;
    const insertAt = origOver > origFirst ? overIdx + 1 : overIdx;
    rest.splice(insertAt, 0, ...nodes);
    rest.forEach((n, i) => {
      n.sourceRowIndex = i;
    });
    this.rootNodes = rest;
    this.refreshModel({ keepRenderedRows: true, silent: true });
  },

  rowDragLeave(event) {
    if (!this.rowDragState) return;
    this.dispatch('rowDragLeave', this.dragEventParams('rowDragLeave', -1, 0, event, null));
  },

  // ── 행 드롭 영역 (다른 그리드/임의 요소로 행 끌어 놓기 — AG addRowDropZone) ──
  //  params: { getContainer(): HTMLElement, onDragEnter?, onDragLeave?, onDragging?, onDragStop?, onDragCancel? }
  addRowDropZone(params) {
    if (!params || typeof params.getContainer !== 'function') return;
    if (!this.rowDropZones) this.rowDropZones = [];
    if (this.rowDropZones.some(z => z.params === params)) return;
    this.rowDropZones.push({ params, inside: false });
  },

  removeRowDropZone(params) {
    if (!this.rowDropZones) return;
    const el = params?.getContainer?.();
    this.rowDropZones = this.rowDropZones.filter(z => z.params !== params && (!el || z.params.getContainer() !== el));
  },

  // 이 그리드를 드롭 대상으로 쓰는 파라미터 — 콜백 인자에 이 그리드 기준 overIndex/overNode/y 를 채움
  getRowDropZoneParams(events = {}) {
    const core = this;
    const wrap = fn => (typeof fn === 'function' ? p => fn({ ...p, ...core.rowDropTargetInfo(p.event) }) : undefined);
    return {
      getContainer: () => core.eRoot?.querySelector('.r2-body-viewport') || core.eRoot,
      onDragEnter: wrap(events.onDragEnter),
      onDragLeave: wrap(events.onDragLeave),
      onDragging: wrap(events.onDragging),
      onDragStop: wrap(events.onDragStop),
      onDragCancel: wrap(events.onDragCancel),
    };
  },

  rowDropTargetInfo(event) {
    const vp = this.eRoot?.querySelector('.r2-body-viewport');
    if (!vp || !event) return { overIndex: -1, overNode: undefined, y: 0 };
    const r = vp.getBoundingClientRect();
    const y = (this.viewport?.getScrollTop() ?? vp.scrollTop) + Math.max(0, event.clientY - r.top);
    const count = this.getRowCountInPage?.() ?? this.displayedNodes.length;
    const inside = y < (this.pageHeight || 0);
    const overIndex = count && inside ? this.pageFirstRow + this.indexAtPixel(y) : -1;
    return { overIndex, overNode: overIndex >= 0 ? this.displayedNodes[overIndex] : undefined, y };
  },

  // 드래그 중 포인터 위치로 드롭 영역 진입/이탈/이동/놓기 콜백 (phase: move | end | cancel)
  updateRowDropZones(event, phase) {
    const zones = this.rowDropZones;
    const d = this.rowDragState;
    if (!zones?.length || !d) return;
    for (const z of zones) {
      const el = z.params.getContainer?.();
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      const base = { type: '', event, node: d.node, nodes: d.nodes, overIndex: -1, overNode: undefined, y: 0, vDirection: null, api: this.api, context: this.gos.context };
      if (phase === 'move') {
        if (inside && !z.inside) z.params.onDragEnter?.({ ...base, type: 'rowDragEnter' });
        if (!inside && z.inside) z.params.onDragLeave?.({ ...base, type: 'rowDragLeave' });
        if (inside) z.params.onDragging?.({ ...base, type: 'rowDragMove' });
        z.inside = inside;
      } else {
        if (z.inside || inside) {
          if (phase === 'cancel') z.params.onDragCancel?.({ ...base, type: 'rowDragCancel' });
          else z.params.onDragStop?.({ ...base, type: 'rowDragEnd' });
        }
        z.inside = false;
      }
    }
  },

  rowDragEnd(event, overIndex, y, cancelled = false) {
    const d = this.rowDragState;
    if (!d) return;
    this.rowDragState = null;
    d.nodes.forEach(n => {
      n.__dragging = false;
    });
    this.notify();
    this.rowDragState = d;
    const params = this.dragEventParams(cancelled ? 'rowDragCancel' : 'rowDragEnd', overIndex ?? d.overIndex, y, event, null);
    this.rowDragState = null;
    this.dispatch(cancelled ? 'rowDragCancel' : 'rowDragEnd', params);
  },
};
