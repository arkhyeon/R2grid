// RowNode 객체. 화면 코드가 node.data / node.setSelected() / node.setDataValue() 등을 그대로 쓴다.
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
    // ── 그리드 내부용 (화면 코드에서 쓰지 말 것) ──
    // 모든 노드에 있는 것
    this.__version = 0; // 데이터가 바뀔 때마다 +1 (core.markDataChanged) — 셀 다시 그리기 판단
    this.__explicitHeight = null; // setRowHeight 로 지정한 높이
    this.__autoHeight = null; // autoHeight 컬럼으로 잰 높이
    this.__quickFilterText = null; // 빠른 검색용 문장 캐시
    this.__qfVer = -1; // 위 캐시를 만든 빠른 검색 버전
    this.__qfPivot = false; // 위 캐시를 피벗 모드에서 만들었는지
    // 기능을 쓸 때만 붙는 것 (필요할 때 생김)
    //  값 캐시(valueCache)     __vc(Map colId→값) · __vcVer
    //  피벗                    __pivotKey · __pivotEpoch · __pivotArr · __pivotArrEpoch (피벗 키 캐시)
    //  그룹                    __filler(경로 중간에 만든 빈 그룹) · __expInit(처음 펼침 적용 여부) · __footerShown · __firstDisplayed · __prevAgg(집계 깜빡임 비교값)
    //  SSRM                    __store · __storeIndex · __route · __serverIdx · __ssrmGroup · __ssrmTree · __ssrmSeen
    //  화면                    __redraw(redrawRows 횟수 → React key) · __dragging(행 끌기 중)
  }

  // 그룹 노드의 리프 자식 (트리데이터는 데이터가 있는 모든 하위 노드)
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
    return this.master || (this.group && (!!this.childrenAll?.length || !!this.__ssrmGroup));
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
