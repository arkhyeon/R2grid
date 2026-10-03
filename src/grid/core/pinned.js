// 상단/하단 고정 행 (pinnedTopRowData / pinnedBottomRowData)
import { RowNode } from './RowNode.js';

export const pinnedMethods = {
  buildPinnedRows() {
    const mk = (arr, pos) =>
      (arr || []).map((data, i) => {
        const prev = (pos === 'top' ? this.pinnedTop : this.pinnedBottom)?.[i];
        const n = prev && prev.data === data ? prev : new RowNode(this, data, `${pos === 'top' ? 't' : 'b'}-${i}`);
        n.rowPinned = pos;
        n.rowIndex = i;
        n.displayed = true;
        n.selectable = false;
        return n;
      });
    this.pinnedTopUser = mk(this.gos.pinnedTopRowData, 'top');
    this.pinnedBottomUser = mk(this.gos.pinnedBottomRowData, 'bottom');
    this.mergePinnedRows();
  },

  // 사용자 고정 행 + grandTotalRow: 'pinnedTop' | 'pinnedBottom'
  mergePinnedRows() {
    const grand = this.isGroupMode?.() ? this.grandTotalPinned : null;
    const top = [...(this.pinnedTopUser || [])];
    const bottom = [...(this.pinnedBottomUser || [])];
    if (grand?.rowPinned === 'top') top.push(grand);
    if (grand?.rowPinned === 'bottom') bottom.push(grand);
    top.forEach((n, i) => {
      n.rowIndex = i;
      n.displayed = true;
    });
    bottom.forEach((n, i) => {
      n.rowIndex = i;
      n.displayed = true;
    });
    this.pinnedTop = top;
    this.pinnedBottom = bottom;
  },

  pinnedRowHeight(node) {
    const fn = this.gos.getRowHeight;
    if (typeof fn === 'function') {
      const h = fn({ node, data: node.data, api: this.api, context: this.gos.context });
      if (h != null) return h;
    }
    return node.__autoHeight ?? this.getDefaultRowHeight();
  },

  pinnedTotalHeight(pos) {
    const list = pos === 'top' ? this.pinnedTop : this.pinnedBottom;
    let h = 0;
    for (const n of list) {
      n.rowTop = h;
      n.rowHeight = this.pinnedRowHeight(n);
      h += n.rowHeight;
    }
    return h;
  },

  // 포커스 대상 노드 (고정 행 포함)
  getFocusNode() {
    const f = this.focus;
    if (!f) return null;
    if (f.rowPinned === 'top') return this.pinnedTop[f.rowIndex] || null;
    if (f.rowPinned === 'bottom') return this.pinnedBottom[f.rowIndex] || null;
    return this.displayedNodes[f.rowIndex] || null;
  },

  focusPinned(pos, rowIndex, colId) {
    this.focus = { rowIndex, colId, rowPinned: pos };
    this.ranges = [];
    this.ensureColumnVisible(colId);
    this.notify();
    this.dispatch('cellFocused', {
      rowIndex,
      column: this.getColumn(colId),
      rowPinned: pos,
      forceBrowserFocus: true,
      isFullWidthCell: false,
      floating: pos,
    });
  },
};
