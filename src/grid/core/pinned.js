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
    this.pinnedTop = mk(this.gos.pinnedTopRowData, 'top');
    this.pinnedBottom = mk(this.gos.pinnedBottomRowData, 'bottom');
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
