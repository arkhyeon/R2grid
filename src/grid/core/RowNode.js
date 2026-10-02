// AG-Grid IRowNode 호환 객체. 화면 코드가 node.data / node.setSelected() / node.setDataValue() 등을 그대로 쓴다.
export class RowNode {
  constructor(core, data, id) {
    this.core = core;
    this.data = data;
    this.id = id;
    this.selected = false;
    this.selectable = true;
    this.rowIndex = null;
    this.displayed = false;
    this.rowTop = null;
    this.rowHeight = null;
    this.level = 0;
    this.uiLevel = 0;
    this.group = false;
    this.footer = false;
    this.rowPinned = undefined;
    this.master = false;
    this.expanded = false;
    this.detail = false;
    this.detailNode = null;
    this.stub = false;
    this.parent = null;
    this.key = null;
    this.field = null;
    this.rowGroupColumn = null;
    this.aggData = null;
    this.childrenAll = null;
    this.childrenAfterFilter = null;
    this.childrenAfterSort = null;
    this.allChildrenCount = null;
    this.sourceRowIndex = -1;
    this.childIndex = -1;
    this.firstChild = false;
    this.lastChild = false;
    this.__version = 0;
    this.__explicitHeight = null;
    this.__autoHeight = null;
    this.__quickFilterText = null;
  }

  // AG 호환: 그룹 노드의 리프 자식 (트리데이터는 데이터가 있는 모든 하위 노드)
  get allLeafChildren() {
    if (!this.childrenAll) return this.group ? [] : null;
    const out = [];
    const walk = n => {
      for (const c of n.childrenAll || []) {
        if (c.group) {
          if (c.data !== undefined) out.push(c);
          walk(c);
        } else out.push(c);
      }
    };
    walk(this);
    return out;
  }

  get childrenAfterGroup() {
    return this.childrenAll;
  }

  isSelected() {
    if (this.group && this.core.isGroupSelectsDescendants?.()) return this.core.getGroupSelectionState(this);
    return this.selected;
  }

  isSelectable() {
    return this.selectable;
  }

  setSelected(newValue, clearSelection = false, source = 'api') {
    if (this.group && this.core.isGroupSelectsDescendants?.()) {
      this.core.setGroupSelected(this, !!newValue, source);
      return;
    }
    this.core.setNodeSelected(this, !!newValue, !!clearSelection, source);
  }

  setData(data) {
    this.core.setNodeData(this, data, false);
  }

  updateData(data) {
    this.core.setNodeData(this, data, true);
  }

  setDataValue(colKey, newValue, eventSource) {
    const column = this.core.getColumn(colKey);
    if (!column) return false;
    return this.core.setCellValue(this, column, newValue, eventSource || 'api');
  }

  setRowHeight(height) {
    this.__explicitHeight = height;
    this.core.onRowHeightChanged();
  }

  setExpanded(expanded) {
    this.core.setNodeExpanded(this, !!expanded);
  }

  isExpandable() {
    return this.master || (this.group && !!this.childrenAll?.length);
  }

  isRowPinned() {
    return !!this.rowPinned;
  }

  isFullWidthCell() {
    return this.detail;
  }

  isHovered() {
    return this.core.hoveredRowIndex === this.rowIndex;
  }

  hasChildren() {
    return !!this.childrenAll?.length;
  }

  getRoute() {
    if (!this.group && !this.parent) return undefined;
    const route = [];
    let n = this.group ? this : this.parent;
    while (n) {
      if (n.key != null) route.unshift(n.key);
      n = n.parent;
    }
    return route;
  }

  addEventListener(type, listener) {
    if (!this.__listeners) this.__listeners = new Map();
    if (!this.__listeners.has(type)) this.__listeners.set(type, new Set());
    this.__listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.__listeners?.get(type)?.delete(listener);
  }

  __dispatchLocal(type, extra) {
    const set = this.__listeners?.get(type);
    if (!set) return;
    const evt = { type, node: this, ...extra };
    for (const l of [...set]) l(evt);
  }

  depthFirstSearch(cb) {
    for (const c of this.childrenAll || []) c.depthFirstSearch(cb);
    cb(this);
  }
}
