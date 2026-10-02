// undoRedoCellEditing: 편집/붙여넣기/삭제/잘라내기를 액션 단위로 기록 → Ctrl+Z / Ctrl+Y
const RECORD_SOURCES = new Set(['edit', 'paste', 'cellClear', 'clipboardCut', 'rangeSvc', 'fill']);

export const undoMethods = {
  undoEnabled() {
    return !!this.gos.undoRedoCellEditing;
  },

  recordUndo(node, column, oldValue, newValue, source) {
    if (!this.undoEnabled() || this.undoing || !RECORD_SOURCES.has(source)) return;
    const action = { node, colId: column.colId, oldValue, newValue };
    if (this.undoBatch) this.undoBatch.push(action);
    else this.pushUndo([action]);
  },

  beginUndoBatch() {
    if (!this.undoBatch) {
      this.undoBatch = [];
      this.undoBatchDepth = 0;
    }
    this.undoBatchDepth++;
  },

  endUndoBatch() {
    if (!this.undoBatch) return;
    this.undoBatchDepth--;
    if (this.undoBatchDepth > 0) return;
    const b = this.undoBatch;
    this.undoBatch = null;
    if (b.length) this.pushUndo(b);
  },

  pushUndo(actions) {
    if (!this.undoStack) this.undoStack = [];
    this.undoStack.push(actions);
    const limit = this.gos.undoRedoCellEditingLimit ?? 10;
    while (this.undoStack.length > limit) this.undoStack.shift();
    this.redoStack = [];
  },

  applyUndoActions(actions, useOld) {
    this.undoing = true;
    const list = useOld ? [...actions].reverse() : actions;
    for (const a of list) {
      const col = this.getColumn(a.colId);
      if (col) this.setCellValue(a.node, col, useOld ? a.oldValue : a.newValue, useOld ? 'undo' : 'redo');
    }
    this.undoing = false;
    const first = actions[0];
    if (first?.node.rowIndex != null) {
      this.focus = { rowIndex: first.node.rowIndex, colId: first.colId, rowPinned: first.node.rowPinned || null };
      this.ensureIndexVisible(first.node.rowIndex);
    }
    this.notify();
  },

  undoCellEditing(source = 'api') {
    if (this.editing) this.stopEditing(true);
    const a = this.undoStack?.pop();
    this.dispatch('undoStarted', { source });
    if (a) {
      this.applyUndoActions(a, true);
      if (!this.redoStack) this.redoStack = [];
      this.redoStack.push(a);
    }
    this.dispatch('undoEnded', { source, operationPerformed: !!a });
  },

  redoCellEditing(source = 'api') {
    if (this.editing) this.stopEditing(true);
    const a = this.redoStack?.pop();
    this.dispatch('redoStarted', { source });
    if (a) {
      this.applyUndoActions(a, false);
      this.undoStack.push(a);
    }
    this.dispatch('redoEnded', { source, operationPerformed: !!a });
  },
};
