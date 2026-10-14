// 행 선택 (singleRow / multiRow, 그룹 선택, 선택 이벤트)
//  GridCore.prototype 에 합쳐짐 (this = GridCore)

export const selectionMethods = {
  // ── 선택 ─────────────────────────────────────────────────
  updateSelectable(node) {
    const rs = this.rsOpts;
    const fn = rs?.isRowSelectable;
    node.selectable = !!rs && !node.detail && (typeof fn === 'function' ? !!fn(node) : true);
  },

  updateSelectableAll() {
    let count = 0;
    for (const n of this.rootNodes) {
      this.updateSelectable(n);
      if (n.selectable) count++;
    }
    this.selectableCount = count;
  },

  getSelectedNodes() {
    return [...this.selected.values()];
  },

  getSelectedRows() {
    return this.getSelectedNodes().map(n => n.data);
  },

  setNodeSelected(node, value, clearOthers = false, source = 'api', event) {
    if (!node || node.detail || node.rowPinned || node.stub) return 0;
    if (value && !this.rsOpts) return 0;
    if (value && !node.selectable) return 0;
    const changed = [];
    if (value && (clearOthers || this.rsOpts?.mode === 'singleRow')) {
      this.ssrmResetSelection(node.selected ? [node] : []);
      for (const [id, n] of [...this.selected]) {
        if (n !== node) {
          n.selected = false;
          this.selected.delete(id);
          changed.push(n);
        }
      }
    }
    if (node.selected !== value) {
      node.selected = value;
      if (value) this.selected.set(node.id, node);
      else this.selected.delete(node.id);
      changed.push(node);
    }
    if (value) this.lastSelectedNode = node;
    if (changed.length) this.afterSelectionChange(changed, source, event);
    return changed.length;
  },

  setNodesSelected(nodes, value, source = 'api') {
    if (!nodes?.length) return;
    if (value && this.rsOpts?.mode === 'singleRow' && nodes.length > 1) nodes = [nodes[0]];
    const changed = [];
    if (value && this.rsOpts?.mode === 'singleRow') {
      for (const [id, n] of [...this.selected]) {
        if (!nodes.includes(n)) {
          n.selected = false;
          this.selected.delete(id);
          changed.push(n);
        }
      }
    }
    nodes.forEach(n => {
      if (!n || n.detail) return;
      if (value && !n.selectable) return;
      if (n.selected === value) return;
      n.selected = value;
      if (value) this.selected.set(n.id, n);
      else this.selected.delete(n.id);
      changed.push(n);
    });
    if (value && nodes.length) this.lastSelectedNode = nodes[nodes.length - 1];
    if (changed.length) this.afterSelectionChange(changed, source);
  },

  afterSelectionChange(changed, source, event, force = false) {
    if (this.isSsrm()) this.ssrmSyncSelection(changed);
    if (!changed.length && !force) return;
    this.selectionVersion = (this.selectionVersion || 0) + 1;
    changed.forEach(n => {
      this.dispatch('rowSelected', {
        node: n,
        data: n.data,
        rowIndex: n.rowIndex,
        rowPinned: n.rowPinned,
        source,
        event,
      });
      n.__dispatchLocal('rowSelected', {});
    });
    this.dispatch('selectionChanged', { source, selectedNodes: this.getSelectedNodes() });
    this.notify();
  },

  selectAllNodes(mode = 'all', source = 'apiSelectAll') {
    if (!this.rsOpts || this.rsOpts.mode !== 'multiRow') return;
    // SSRM: 안 불러온 행까지 전체 선택 (서버 필터 결과 전체) → selectAll 상태로
    if (this.isSsrm()) {
      this.setServerSideSelectionState({ selectAll: true, toggledNodes: [] }, source);
      return;
    }
    const nodes = mode === 'filtered' ? this.filteredNodes : mode === 'currentPage' ? this.getPageMasters() : this.rootNodes;
    const changed = [];
    for (const n of nodes) {
      if (!n.selected && n.selectable) {
        n.selected = true;
        this.selected.set(n.id, n);
        changed.push(n);
      }
    }
    if (changed.length) this.afterSelectionChange(changed, source);
  },

  deselectAllNodes(mode = 'all', source = 'apiSelectAll') {
    if (this.isSsrm()) {
      this.setServerSideSelectionState({ selectAll: false, toggledNodes: [] }, source);
      return;
    }
    const scope = mode === 'filtered' ? new Set(this.filteredNodes) : mode === 'currentPage' ? new Set(this.getPageMasters()) : null;
    const changed = [];
    for (const [id, n] of [...this.selected]) {
      if (scope && !scope.has(n)) continue;
      n.selected = false;
      this.selected.delete(id);
      changed.push(n);
    }
    if (changed.length) this.afterSelectionChange(changed, source);
  },

  getPageMasters() {
    const out = [];
    for (let i = this.pageFirstRow; i < this.pageLastRow; i++) {
      const n = this.displayedNodes[i];
      if (!n.detail) out.push(n);
    }
    return out;
  },

  // shift 클릭: 마지막 선택 행 ~ 현재 행 범위 선택
  selectRangeTo(node, keepOthers, source) {
    const from = this.lastSelectedNode;
    if (!from || from.rowIndex == null || node.rowIndex == null) {
      this.setNodeSelected(node, true, !keepOthers, source);
      return;
    }
    const a = Math.min(from.rowIndex, node.rowIndex);
    const b = Math.max(from.rowIndex, node.rowIndex);
    const inRange = [];
    for (let i = a; i <= b; i++) {
      const n = this.displayedNodes[i];
      if (n && !n.detail) inRange.push(n);
    }
    const changed = [];
    if (!keepOthers) {
      this.ssrmResetSelection(inRange.filter(n => n.selected));
      const set = new Set(inRange);
      for (const [id, n] of [...this.selected]) {
        if (!set.has(n)) {
          n.selected = false;
          this.selected.delete(id);
          changed.push(n);
        }
      }
    }
    inRange.forEach(n => {
      if (!n.selected && n.selectable) {
        n.selected = true;
        this.selected.set(n.id, n);
        changed.push(n);
      }
    });
    if (changed.length) this.afterSelectionChange(changed, source);
  },

  handleRowClickSelection(node, event) {
    const rs = this.rsOpts;
    if (!rs || !node || node.detail || node.rowPinned || node.stub) return;
    const ecs = rs.enableClickSelection;
    if (!ecs) return;
    const canSelect = ecs === true || ecs === 'enableSelection';
    const canDeselect = ecs === true || ecs === 'enableDeselection';
    const ctrl = event?.ctrlKey || event?.metaKey;
    const shift = event?.shiftKey;
    if (node.group && this.isGroupSelectsDescendants()) {
      const st = this.getGroupSelectionState(node);
      if (st === true ? canDeselect : canSelect) this.setGroupSelected(node, st !== true, 'rowClicked');
      return;
    }
    if (rs.mode === 'multiRow') {
      if (shift && this.lastSelectedNode && canSelect) {
        this.selectRangeTo(node, !!ctrl, 'rowClicked');
        return;
      }
      if (rs.enableSelectionWithoutKeys || ctrl) {
        if (node.selected) {
          if (canDeselect) this.setNodeSelected(node, false, false, 'rowClicked', event);
        } else if (canSelect) this.setNodeSelected(node, true, false, 'rowClicked', event);
        return;
      }
      if (canSelect) {
        if (node.selected && this.selected.size === 1) return;
        this.setNodeSelected(node, true, true, 'rowClicked', event);
      }
      return;
    }
    if (node.selected) {
      if (ctrl && canDeselect) this.setNodeSelected(node, false, false, 'rowClicked', event);
    } else if (canSelect) this.setNodeSelected(node, true, true, 'rowClicked', event);
  },

  handleCheckboxClick(node, event) {
    const rs = this.rsOpts;
    if (!rs || !node || node.rowPinned || node.stub) return;
    if (node.group && this.isGroupSelectsDescendants()) {
      this.setGroupSelected(node, this.getGroupSelectionState(node) !== true, 'checkboxSelected');
      return;
    }
    if (!node.selectable) return;
    if (rs.mode === 'multiRow' && event?.shiftKey && this.lastSelectedNode) {
      this.selectRangeTo(node, true, 'checkboxSelected');
      return;
    }
    if (node.selected) this.setNodeSelected(node, false, false, 'checkboxSelected', event);
    else this.setNodeSelected(node, true, rs.mode === 'singleRow', 'checkboxSelected', event);
  },

  // 헤더 체크박스 상태: true | false | null(일부)
  getHeaderCheckboxState() {
    const rs = this.rsOpts;
    if (!rs) return false;
    if (this.isSsrm() && this.ssrmTreeMode()) {
      const t = this.ssrmTreeRoot();
      if (!t.toggled.size) return t.selectAll;
      return null;
    }
    if (this.isSsrm()) {
      const sel = this.ssrmSel;
      if (!sel || (!sel.selectAll && !sel.toggled.size)) return false;
      return sel.selectAll && !sel.toggled.size ? true : null;
    }
    const mode = rs.selectAll;
    if (mode === 'all') {
      const sel = this.selected.size;
      if (!sel) return false;
      return sel >= this.selectableCount ? true : null;
    }
    const nodes = mode === 'filtered' ? this.filteredNodes : this.getPageMasters();
    let sel = 0;
    let selectable = 0;
    for (const n of nodes) {
      if (!n.selectable) continue;
      selectable++;
      if (n.selected) sel++;
    }
    if (!sel) return false;
    return sel >= selectable ? true : null;
  },

  toggleHeaderCheckbox() {
    const rs = this.rsOpts;
    if (!rs) return;
    const state = this.getHeaderCheckboxState();
    if (state === true) this.deselectAllNodes(rs.selectAll, 'uiSelectAll');
    else this.selectAllNodes(rs.selectAll, 'uiSelectAll');
  },
};
