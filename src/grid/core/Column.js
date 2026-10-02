// AG-Grid Column / ColumnGroup 호환 객체.
// CLM 코드가 column.getColDef(), getColId(), isVisible(), actualWidth, gos.gridOptions.rowHeight 등을 직접 참조한다.

export const SELECTION_COL_ID = 'ag-Grid-SelectionColumn';
export const ROW_NUMBERS_COL_ID = 'ag-Grid-RowNumbersColumn';
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
  applyColDef(colDef, userColDef, isNew, prevColDef) {
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

  isDisplayed() {
    return this.visible;
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
    return false;
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
    return this.getLeafColumns().filter(c => c.visible);
  }

  getParent() {
    return this.parent;
  }

  isExpandable() {
    return false;
  }

  isExpanded() {
    return true;
  }

  getLevel() {
    return this.level;
  }

  isColumn = false;
}
