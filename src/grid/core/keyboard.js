// 키보드 탐색·단축키
//  GridCore.prototype 에 합쳐짐 (this = GridCore)
import { pasteTextIntoGrid } from './clipboard.js';
import { clamp, isPrintableKey } from './utils.js';

export const keyboardMethods = {
  // ── 키보드 ───────────────────────────────────────────────
  navigableColumns() {
    return this.displayedColumns.filter(c => !c.colDef.suppressNavigable);
  },

  moveFocusTo(rowIndex, colId, { extendRange = false } = {}) {
    this.headerFocus = null;
    rowIndex = clamp(rowIndex, this.pageFirstRow, Math.max(this.pageFirstRow, this.pageLastRow - 1));
    const prevFocus = this.focus;
    this.focus = { rowIndex, colId, rowPinned: null };
    if (this.cellSelectionOpts) {
      if (extendRange && this.ranges.length) {
        const r = this.ranges[this.ranges.length - 1];
        r.endRowIndex = rowIndex;
        r.endColId = colId;
        this.focus = prevFocus;
      } else {
        this.ranges = [
          {
            id: `range_${++this.rangeSeq}`,
            startRowIndex: rowIndex,
            endRowIndex: rowIndex,
            startColId: colId,
            endColId: colId,
          },
        ];
      }
      this.dispatchRangeChanged(true, true);
    }
    const target = extendRange && this.ranges.length ? this.ranges[this.ranges.length - 1] : null;
    const scrollRow = target ? target.endRowIndex : rowIndex;
    const scrollCol = target ? target.endColId : colId;
    this.ensureIndexVisible(scrollRow);
    this.ensureColumnVisible(scrollCol);
    this.notify();
    if (!extendRange) {
      this.dispatch('cellFocused', {
        rowIndex,
        column: this.getColumn(colId),
        rowPinned: null,
        forceBrowserFocus: true,
        isFullWidthCell: false,
        floating: null,
      });
    }
  },

  visibleRowCount() {
    const h = this.viewport?.getClientHeight?.() || this.bodyHeight || 400;
    return Math.max(1, Math.floor(h / this.getDefaultRowHeight()));
  },

  // 그리드 키 입력 처리. 처리했으면 true
  handleKeyDown(e) {
    const ed = this.editing;
    // RTL: 화면상 왼쪽 = 다음 컬럼
    const key = this.isRtl() && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? (e.key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft') : e.key;
    if (!ed && this.headerFocus) return this.handleHeaderKey(e);
    if (ed) {
      const node = ed.node;
      const column = ed.column;
      this.dispatch('cellKeyDown', { ...this.cellEventParams(node, column, e), event: e });
      if (column.colDef.suppressKeyboardEvent?.({ event: e, node, column, colDef: column.colDef, editing: true, api: this.api, context: this.gos.context }))
        return false;
      if (key === 'Escape') {
        this.stopEditing(true);
        return true;
      }
      if (key === 'Enter' && (e.ctrlKey || e.metaKey) && this.cellSelectionOpts && this.ranges.length && this.applyBulkEdit()) return true;
      if (key === 'Enter' && !e.shiftKey && !ed.editor.handlesEnter) {
        if (!this.stopEditing(false)) return true;
        if (this.gos.enterNavigatesVerticallyAfterEdit) {
          this.moveFocusTo(this.nextRowIndex(node.rowIndex, 1), column.colId);
        }
        return true;
      }
      if (key === 'Tab') {
        if (ed.fullRow && this.tabWithinEditingRow(e.shiftKey)) return true;
        if (!this.stopEditing(false)) return true;
        this.tabToNextEditable(node, column, e.shiftKey);
        return true;
      }
      return false;
    }

    const focus = this.focus;
    const node = this.getFocusNode();
    const column = focus ? this.getColumn(focus.colId) : null;
    if (node && column) {
      this.dispatch('cellKeyDown', { ...this.cellEventParams(node, column, e), event: e });
      if (column.colDef.suppressKeyboardEvent?.({ event: e, node, column, colDef: column.colDef, editing: false, api: this.api, context: this.gos.context }))
        return false;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const lower = key.toLowerCase();

    // Ctrl+C / X / V 는 브라우저 copy·cut·paste 이벤트에서 처리 (clipboardData 직접 기록 — 권한 불필요)
    if (ctrl && (lower === 'c' || lower === 'x' || lower === 'v')) return false;
    if (ctrl && this.undoEnabled() && (lower === 'z' || lower === 'y')) {
      if (lower === 'y' || e.shiftKey) this.redoCellEditing('ui');
      else this.undoCellEditing('ui');
      return true;
    }
    if (ctrl && lower === 'a') {
      if (this.cellSelectionOpts && this.displayedColumns.length && this.getRowCountInPage()) {
        this.ranges = [
          {
            id: `range_${++this.rangeSeq}`,
            startRowIndex: this.pageFirstRow,
            endRowIndex: this.pageLastRow - 1,
            startColId: this.displayedColumns[0].colId,
            endColId: this.displayedColumns[this.displayedColumns.length - 1].colId,
          },
        ];
        this.notify();
        this.dispatchRangeChanged(true, true);
        return true;
      }
      return false;
    }
    if (!focus || !node || !column) return false;

    const cols = this.navigableColumns();
    const ci = Math.max(
      0,
      cols.findIndex(c => c.colId === column.colId),
    );
    const shift = e.shiftKey && !!this.cellSelectionOpts;
    const curEnd = shift && this.ranges.length ? this.ranges[this.ranges.length - 1] : null;
    const baseRow = curEnd ? curEnd.endRowIndex : focus.rowIndex;
    const baseColIdx = curEnd
      ? Math.max(
          0,
          cols.findIndex(c => c.colId === curEnd.endColId),
        )
      : ci;
    const first = this.pageFirstRow;
    const last = this.pageLastRow - 1;
    const hasBody = this.getRowCountInPage() > 0;

    // 고정 행에서의 이동
    if (focus.rowPinned) {
      const pos = focus.rowPinned;
      const list = pos === 'top' ? this.pinnedTop : this.pinnedBottom;
      const colAt = i => cols[clamp(i, 0, cols.length - 1)].colId;
      switch (key) {
        case 'ArrowLeft':
          this.focusPinned(pos, focus.rowIndex, colAt(ctrl ? 0 : ci - 1));
          return true;
        case 'ArrowRight':
          this.focusPinned(pos, focus.rowIndex, colAt(ctrl ? cols.length - 1 : ci + 1));
          return true;
        case 'Tab':
          if ((e.shiftKey && ci === 0) || (!e.shiftKey && ci === cols.length - 1)) return false;
          this.focusPinned(pos, focus.rowIndex, colAt(ci + (e.shiftKey ? -1 : 1)));
          return true;
        case 'ArrowDown':
          if (focus.rowIndex < list.length - 1) this.focusPinned(pos, focus.rowIndex + 1, column.colId);
          else if (pos === 'top' && hasBody) this.moveFocusTo(first, column.colId);
          return true;
        case 'ArrowUp':
          if (focus.rowIndex > 0) this.focusPinned(pos, focus.rowIndex - 1, column.colId);
          else if (pos === 'bottom' && hasBody) this.moveFocusTo(last, column.colId);
          else if (pos === 'top' && !this.gos.suppressHeaderFocus && this.gos.headerHeight !== 0)
            this.setHeaderFocus(this.headerRowCount() - 1, column.colId, 'ui');
          return true;
        default:
          break;
      }
    }

    const pinnedNav = focus.rowPinned && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Home', 'End', 'Tab'].includes(key);
    switch (pinnedNav ? '' : key) {
      case 'ArrowDown':
        if (!ctrl && !shift && baseRow >= last && this.pinnedBottom.length) {
          this.focusPinned('bottom', 0, cols[baseColIdx].colId);
          return true;
        }
        this.moveFocusTo(ctrl ? last : this.nextRowIndex(baseRow, 1), cols[baseColIdx].colId, { extendRange: shift });
        return true;
      case 'ArrowUp':
        if (!ctrl && !shift && baseRow <= first && this.pinnedTop.length) {
          this.focusPinned('top', this.pinnedTop.length - 1, cols[baseColIdx].colId);
          return true;
        }
        // 첫 행에서 ↑ → 헤더 (suppressHeaderFocus 로 끔)
        if (!ctrl && !shift && baseRow <= first && !this.gos.suppressHeaderFocus && this.gos.headerHeight !== 0) {
          return this.setHeaderFocus(this.headerRowCount() - 1, cols[baseColIdx].colId, 'ui');
        }
        this.moveFocusTo(ctrl ? first : this.nextRowIndex(baseRow, -1), cols[baseColIdx].colId, { extendRange: shift });
        return true;
      case 'ArrowRight':
        this.moveFocusTo(baseRow, cols[ctrl ? cols.length - 1 : Math.min(cols.length - 1, baseColIdx + 1)].colId, { extendRange: shift });
        return true;
      case 'ArrowLeft':
        this.moveFocusTo(baseRow, cols[ctrl ? 0 : Math.max(0, baseColIdx - 1)].colId, { extendRange: shift });
        return true;
      case 'PageDown':
        this.moveFocusTo(Math.min(last, baseRow + this.visibleRowCount()), cols[baseColIdx].colId, { extendRange: shift });
        return true;
      case 'PageUp':
        this.moveFocusTo(Math.max(first, baseRow - this.visibleRowCount()), cols[baseColIdx].colId, { extendRange: shift });
        return true;
      case 'Home':
        this.moveFocusTo(ctrl ? first : baseRow, cols[0].colId, { extendRange: shift });
        return true;
      case 'End':
        this.moveFocusTo(ctrl ? last : baseRow, cols[cols.length - 1].colId, { extendRange: shift });
        return true;
      case 'Tab': {
        const dir = e.shiftKey ? -1 : 1;
        let nci = ci + dir;
        let row = focus.rowIndex;
        if (nci >= cols.length) {
          if (row >= last) return false;
          nci = 0;
          row = this.nextRowIndex(row, 1);
        } else if (nci < 0) {
          if (row <= first) return false;
          nci = cols.length - 1;
          row = this.nextRowIndex(row, -1);
        }
        this.moveFocusTo(row, cols[nci].colId);
        return true;
      }
      case 'Enter':
        if (this.gos.enterNavigatesVertically) {
          this.moveFocusTo(this.nextRowIndex(focus.rowIndex, e.shiftKey ? -1 : 1), column.colId);
          return true;
        }
        if (this.isCellEditable(column, node)) {
          this.startEdit(node, column, 'Enter');
          return true;
        }
        if (node.master) {
          node.setExpanded(!node.expanded);
          return true;
        }
        return false;
      case 'F2':
        if (this.isCellEditable(column, node)) {
          this.startEdit(node, column, 'F2');
          return true;
        }
        return false;
      case ' ':
        if (this.rsOpts && !this.isCellEditable(column, node)) {
          this.handleCheckboxClick(node, e);
          return true;
        }
        break;
      case 'Delete':
        if (this.cellSelectionOpts && this.ranges.length) {
          this.clearRangeCells();
          return true;
        }
        if (this.isCellEditable(column, node)) {
          this.writeCell(node, column, null, 'cellClear');
          return true;
        }
        return false;
      case 'Backspace': {
        // 맥에서 Backspace 는 Delete 와 같이 값 지우기 (enableCellEditingOnBackspace 면 편집 시작), 그 외 OS 는 빈 값으로 편집 시작
        const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
        if (mac && !this.gos.enableCellEditingOnBackspace) {
          if (this.cellSelectionOpts && this.ranges.length) {
            this.clearRangeCells();
            return true;
          }
          if (this.isCellEditable(column, node)) {
            this.writeCell(node, column, null, 'cellClear');
            return true;
          }
          return false;
        }
        if (this.isCellEditable(column, node)) {
          this.startEdit(node, column, 'Backspace');
          return true;
        }
        return false;
      }
      default:
        break;
    }
    if (isPrintableKey(e) && this.isCellEditable(column, node)) {
      this.startEdit(node, column, key);
      return true;
    }
    return false;
  },

  nextRowIndex(from, dir) {
    let i = from + dir;
    while (i >= this.pageFirstRow && i < this.pageLastRow && this.displayedNodes[i]?.detail) i += dir;
    return clamp(i, this.pageFirstRow, this.pageLastRow - 1);
  },

  tabToNextEditable(node, column, backwards) {
    const cols = this.navigableColumns();
    let row = node.rowIndex;
    let ci = cols.findIndex(c => c.colId === column.colId);
    const dir = backwards ? -1 : 1;
    for (let guard = 0; guard < cols.length * 3 + 10; guard++) {
      ci += dir;
      if (ci >= cols.length) {
        ci = 0;
        row = this.nextRowIndex(row, 1);
        if (row === node.rowIndex) break;
      } else if (ci < 0) {
        ci = cols.length - 1;
        row = this.nextRowIndex(row, -1);
        if (row === node.rowIndex) break;
      }
      const n = this.displayedNodes[row];
      const c = cols[ci];
      if (n && c && this.isCellEditable(c, n)) {
        this.moveFocusTo(row, c.colId);
        // suppressStartEditOnTab: 다음 칸으로 포커스만 옮기고 편집은 시작하지 않음
        if (!this.gos.suppressStartEditOnTab) this.startEdit(n, c, null);
        return;
      }
    }
  },

  // 편집 가능 셀에 값 쓰기 (readOnlyEdit 이면 요청 이벤트)
  writeCell(node, column, value, source) {
    if (!this.isCellEditable(column, node)) return false;
    if (this.gos.readOnlyEdit) {
      const oldValue = this.getCellValue(node, column);
      this.dispatch('cellEditRequest', {
        ...this.cellEventParams(node, column),
        oldValue,
        newValue: value,
        value,
        source,
      });
      return false;
    }
    return this.setCellValue(node, column, value, source);
  },

  clearRangeCells() {
    this.dispatch('cellSelectionDeleteStart', { source: 'deleteKey' });
    this.dispatch('rangeDeleteStart', { source: 'deleteKey' });
    this.beginUndoBatch();
    for (const r of this.ranges) {
      const b = this.rangeBounds(r);
      if (!b) continue;
      for (let ri = b.r0; ri <= b.r1; ri++) {
        const node = this.displayedNodes[ri];
        if (!node || node.detail) continue;
        for (let ci = b.c0; ci <= b.c1; ci++) this.writeCell(node, this.displayedColumns[ci], null, 'cellClear');
      }
    }
    this.endUndoBatch();
    this.dispatch('cellSelectionDeleteEnd', { source: 'deleteKey' });
    this.dispatch('rangeDeleteEnd', { source: 'deleteKey' });
  },

  pasteText(text) {
    pasteTextIntoGrid(this, text);
  },
};
