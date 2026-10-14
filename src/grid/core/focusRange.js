// 셀 포커스와 셀 범위 선택
//  GridCore.prototype 에 합쳐짐 (this = GridCore)

export const focusRangeMethods = {
  // ── 포커스 ───────────────────────────────────────────────
  setFocusedCell(rowIndex, colKey, opts = {}) {
    if (this.gos.suppressCellFocus) return; // 셀 포커스/키보드 셀 이동 비활성
    const col = this.getColumn(colKey);
    const rowPinned = opts.rowPinned || null;
    const limit = rowPinned === 'top' ? this.pinnedTop.length : rowPinned === 'bottom' ? this.pinnedBottom.length : this.displayedNodes.length;
    if (!col || rowIndex == null || rowIndex < 0 || rowIndex >= limit) return;
    const prev = this.focus;
    if (prev && prev.rowIndex === rowIndex && prev.colId === col.colId && (prev.rowPinned || null) === rowPinned && !this.headerFocus) return;
    this.headerFocus = null;
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
  },

  getFocusedCell() {
    if (!this.focus) return null;
    return { rowIndex: this.focus.rowIndex, column: this.getColumn(this.focus.colId), rowPinned: this.focus.rowPinned || null };
  },

  isCellFocused(node, colId) {
    const f = this.focus;
    return !!f && f.rowIndex === node.rowIndex && f.colId === colId && (f.rowPinned || null) === (node.rowPinned || null);
  },

  clearFocusedCell() {
    if (!this.focus) return;
    this.focus = null;
    this.notify();
  },

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
  },

  rangeExtend(rowIndex, colId) {
    if (!this.rangeDragging || !this.ranges.length) return;
    const r = this.ranges[this.ranges.length - 1];
    if (r.endRowIndex === rowIndex && r.endColId === colId) return;
    r.endRowIndex = rowIndex;
    r.endColId = colId;
    this.notify();
    this.dispatchRangeChanged(false, false);
  },

  rangeEnd() {
    if (!this.rangeDragging) return;
    this.rangeDragging = false;
    this.dispatchRangeChanged(false, true);
  },

  dispatchRangeChanged(started, finished) {
    const p = { started, finished, id: this.ranges[this.ranges.length - 1]?.id };
    this.dispatch('cellSelectionChanged', p);
    this.dispatch('rangeSelectionChanged', p);
  },

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
  },

  clearRanges() {
    if (!this.ranges.length) return;
    this.ranges = [];
    this.notify();
    this.dispatchRangeChanged(false, true);
  },

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
  },

  rangeColumns(r) {
    const b = this.rangeBounds(r);
    if (!b) return [];
    return this.displayedColumns.slice(b.c0, b.c1 + 1);
  },

  // 렌더 단계용 범위 경계 캐시
  getRangeBoundsList() {
    if (this.__rbVersion === this.version) return this.__rbList;
    this.__rbList = this.ranges.map(r => this.rangeBounds(r)).filter(Boolean);
    this.__rbVersion = this.version;
    return this.__rbList;
  },

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
  },

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
  },

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
  },

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
  },
};
