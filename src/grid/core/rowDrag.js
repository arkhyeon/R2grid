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
