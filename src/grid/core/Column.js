// AG-Grid Column / ColumnGroup 호환 객체.
// CLM 코드가 column.getColDef(), getColId(), isVisible(), actualWidth, gos.gridOptions.rowHeight 등을 직접 참조한다.

export const SELECTION_COL_ID = 'r2-Grid-SelectionColumn';
export const ROW_NUMBERS_COL_ID = 'r2-Grid-RowNumbersColumn';
export const DEFAULT_COL_WIDTH = 200;
export const DEFAULT_MIN_WIDTH = 20;

export function normalizePinned(p) {
  if (p === true || p === 'left') return 'left';
  if (p === 'right') return 'right';
  return null;
}

export class Column {
  constructor(core, colDef, userColDef, colId, groupChain) {
    this.core = core;
    this.colId = colId;
    this.instanceId = colId;
    this.groupChain = groupChain || [];
    this.parent = this.groupChain.length ? this.groupChain[this.groupChain.length - 1] : null;
    this.left = 0;
    this.filterActive = false;
    this.isAuto = false;
    this.applyColDef(colDef, userColDef, true);
  }

  // isNew=true 면 모든 상태 속성 적용. 아니면 colDef 값이 이전과 달라진 속성만 적용(AG-Grid 상태 보존 규칙)
  applyColDef(colDef, userColDef, isNew, prevColDefArg) {
    // 비교 기준은 이전 "원본" colDef (aggFunc 상태 반영 사본이 아니라)
    const prevColDef = this.baseColDef ?? prevColDefArg;
    this.baseColDef = colDef;
    const changed = attr => isNew || colDef[attr] !== prevColDef?.[attr];
    const pick = (attr, initialAttr) => {
      if (isNew) return colDef[attr] !== undefined ? colDef[attr] : colDef[initialAttr];
      return colDef[attr];
    };
    this.colDef = colDef;
    this.userProvidedColDef = userColDef;
    if (changed('hide')) this.visible = !pick('hide', 'initialHide');
    if (changed('pinned')) this.pinned = normalizePinned(pick('pinned', 'initialPinned'));
    if (changed('sort')) this.sort = pick('sort', 'initialSort') || null;
    if (changed('sortIndex')) this.sortIndex = pick('sortIndex', 'initialSortIndex') ?? null;
    if (changed('flex')) this.flex = pick('flex', 'initialFlex') || null;
    if (changed('rowGroup') || changed('rowGroupIndex')) {
      const rg = pick('rowGroup', 'initialRowGroup');
      const rgi = pick('rowGroupIndex', 'initialRowGroupIndex');
      this.rowGroup = !!rg || rgi != null;
      this.rowGroupIndex = rgi ?? null;
    }
    if (changed('pivot') || changed('pivotIndex')) {
      const pv = pick('pivot', 'initialPivot');
      const pvi = pick('pivotIndex', 'initialPivotIndex');
      this.pivot = !!pv || pvi != null;
      this.pivotIndex = pvi ?? null;
    }
    // aggFunc 도 컬럼 상태 (api.setColumnAggFunc / 값 컬럼 추가로 바뀐 값은 colDef 가 그대로면 유지)
    if (changed('aggFunc')) this.aggFunc = pick('aggFunc', 'initialAggFunc') ?? null;
    if ((colDef.aggFunc ?? null) !== (this.aggFunc ?? null)) this.colDef = { ...colDef, aggFunc: this.aggFunc ?? undefined };
    if (changed('width')) {
      const w = pick('width', 'initialWidth');
      this.width = w != null ? w : this.width ?? DEFAULT_COL_WIDTH;
    }
    this.minWidth = colDef.minWidth ?? DEFAULT_MIN_WIDTH;
    this.maxWidth = colDef.maxWidth ?? null;
    if (this.width < this.minWidth) this.width = this.minWidth;
    if (this.maxWidth && this.width > this.maxWidth) this.width = this.maxWidth;
    if (this.actualWidth == null) this.actualWidth = this.width;
  }

  // AG-Grid 내부 필드 접근 호환 (SimpleTextEditor: column.gos.gridOptions.rowHeight)
  get gos() {
    const core = this.core;
    return {
      gridOptions: core.gos,
      get: key => core.get(key),
    };
  }

  getColId() {
    return this.colId;
  }

  getId() {
    return this.colId;
  }

  getUniqueId() {
    return this.colId;
  }

  getInstanceId() {
    return this.instanceId;
  }

  getColDef() {
    return this.colDef;
  }

  getUserProvidedColDef() {
    return this.userProvidedColDef;
  }

  getDefinition() {
    return this.colDef;
  }

  isVisible() {
    return this.visible;
  }

  // 그룹 접힘(columnGroupShow) 까지 반영한 실제 표시 여부
  isDisplayed() {
    return this.visible && this.groupShown !== false;
  }

  getColumnGroupShow() {
    return this.colDef.columnGroupShow;
  }

  // AG 내부 필드 호환: column.originalParent.colGroupDef (CLM WorkGroupList)
  get originalParent() {
    return this.parent;
  }

  getActualWidth() {
    return this.actualWidth;
  }

  getMinWidth() {
    return this.minWidth;
  }

  getMaxWidth() {
    return this.maxWidth;
  }

  getFlex() {
    return this.flex;
  }

  getLeft() {
    return this.left;
  }

  getRight() {
    return this.left + this.actualWidth;
  }

  getPinned() {
    return this.pinned;
  }

  isPinned() {
    return !!this.pinned;
  }

  isPinnedLeft() {
    return this.pinned === 'left';
  }

  isPinnedRight() {
    return this.pinned === 'right';
  }

  getSort() {
    return this.sort || undefined;
  }

  getSortIndex() {
    return this.sortIndex;
  }

  isSorting() {
    return !!this.sort;
  }

  isSortAscending() {
    return this.sort === 'asc';
  }

  isSortDescending() {
    return this.sort === 'desc';
  }

  isSortable() {
    return this.colDef.sortable !== false && !this.isAuto;
  }

  isResizable() {
    return this.colDef.resizable !== false;
  }

  isFilterAllowed() {
    return !!this.colDef.filter;
  }

  isFilterActive() {
    return this.filterActive;
  }

  isCellEditable(rowNode) {
    return this.core.isCellEditable(this, rowNode);
  }

  isSuppressNavigable() {
    return !!this.colDef.suppressNavigable;
  }

  isRowGroupActive() {
    return !!this.rowGroup;
  }

  getRowGroupIndex() {
    return this.rowGroupIndex;
  }

  isPivotActive() {
    return !!this.pivot;
  }

  isPrimary() {
    return !this.isPivotResult;
  }

  getPivotKeys() {
    return this.colDef.pivotKeys;
  }

  getAggFunc() {
    return this.colDef.aggFunc ?? undefined;
  }

  isValueActive() {
    return !!this.colDef.aggFunc;
  }

  getParent() {
    return this.parent;
  }

  getOriginalParent() {
    return this.parent;
  }

  isColumn = true;
}

export class ColumnGroup {
  constructor(colGroupDef, groupId, level) {
    this.colGroupDef = colGroupDef;
    this.groupId = groupId;
    this.level = level;
    this.children = [];
    this.parent = null;
    this.expanded = !!colGroupDef.openByDefault;
    this.expandable = false;
  }

  // AG 규칙: 열림 때 보이는 자식·닫힘 때 보이는 자식이 모두 있고, columnGroupShow 지정 자식이 하나라도 있어야 접기 가능
  computeExpandable() {
    let whenOpen = false;
    let whenClosed = false;
    let changeable = false;
    this.children.forEach(c => {
      const show = c.isColumn ? c.colDef.columnGroupShow : c.colGroupDef.columnGroupShow;
      if (show === 'open') {
        whenOpen = true;
        changeable = true;
      } else if (show === 'closed') {
        whenClosed = true;
        changeable = true;
      } else {
        whenOpen = true;
        whenClosed = true;
      }
    });
    this.expandable = whenOpen && whenClosed && changeable;
  }

  get originalParent() {
    return this.parent;
  }

  getProvidedColumnGroup() {
    return this;
  }

  getOriginalParent() {
    return this.parent;
  }

  getColumnGroupShow() {
    return this.colGroupDef.columnGroupShow;
  }

  isPadding() {
    return false;
  }

  getDisplayedChildren() {
    return this.children.filter(c => (c.isColumn ? c.isDisplayed() : c.getDisplayedLeafColumns().length > 0));
  }

  getGroupId() {
    return this.groupId;
  }

  getUniqueId() {
    return this.groupId;
  }

  getColGroupDef() {
    return this.colGroupDef;
  }

  getDefinition() {
    return this.colGroupDef;
  }

  getChildren() {
    return this.children;
  }

  getLeafColumns() {
    const out = [];
    const walk = list =>
      list.forEach(c => {
        if (c instanceof ColumnGroup) walk(c.children);
        else out.push(c);
      });
    walk(this.children);
    return out;
  }

  getDisplayedLeafColumns() {
    return this.getLeafColumns().filter(c => c.isDisplayed());
  }

  getParent() {
    return this.parent;
  }

  isExpandable() {
    return this.expandable;
  }

  isExpanded() {
    return this.expanded;
  }

  setExpanded(expanded) {
    this.expanded = !!expanded;
  }

  getLevel() {
    return this.level;
  }

  isColumn = false;
}
