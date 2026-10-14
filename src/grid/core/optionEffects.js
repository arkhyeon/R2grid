// 그리드 옵션이 바뀌었을 때 할 일 (GridCore.applyGos 가 이 표로 판단)
//  새 옵션을 만들면 여기에 넣어야 실행 중 setGridOption · props 변경이 화면에 반영됨

// 컬럼을 다시 만듦
export const REBUILD_COLUMNS = [
  'columnDefs',
  'defaultColDef',
  'columnTypes',
  'rowNumbers',
  'selectionColumnDef',
  'autoGroupColumnDef',
  'treeData',
  'treeDataDisplayType',
  'groupDisplayType',
];

// 행 선택 설정을 다시 읽음 (rowSelection 은 선택 컬럼 때문에 컬럼도 다시 만듦)
export const ROW_SELECTION = ['rowSelection', 'suppressRowClickSelection', 'rowMultiSelectWithClick', 'isRowSelectable'];

// 피벗 결과 컬럼 모양
export const PIVOT_RESULT_COLUMNS = [
  'pivotRowTotals',
  'pivotColumnGroupTotals',
  'removePivotHeaderRowWhenSingleValueColumn',
  'suppressExpandablePivotGroups',
  'pivotDefaultExpanded',
  'pivotMaxGeneratedColumns',
  'processPivotResultColDef',
  'processPivotResultColGroupDef',
];

// 고정 행 데이터
export const PINNED_ROWS = ['pinnedTopRowData', 'pinnedBottomRowData'];

// 행 모델 종류·데이터 소스
export const DATA_SOURCE = ['rowModelType', 'serverSideDatasource', 'datasource', 'viewportDatasource'];

// 그룹 트리를 다시 만듦
export const REBUILD_GROUPS = ['getDataPath', 'treeData', 'treeDataParentIdField'];

// 마스터 행 표시를 다시 계산
export const MASTER_FLAGS = ['masterDetail', 'isRowMaster'];

// 행 모델(필터 → 정렬 → 그룹·집계 → 페이지)을 다시 돌림
export const REFRESH_MODEL = [
  'quickFilterText',
  'alwaysAggregateAtRootLevel',
  'applyQuickFilterBeforePivotOrAgg',
  'alwaysPassFilter',
  'pagination',
  'paginationPageSize',
  'paginationAutoPageSize',
  'paginateChildRows',
  'rowHeight',
  'getRowHeight',
  'detailRowHeight',
  'groupSelectsChildren',
  'groupTotalRow',
  'grandTotalRow',
  'groupIncludeFooter',
  'groupIncludeTotalFooter',
  'groupAggFiltering',
  'suppressAggFilteredOnly',
  'excludeChildrenWhenTreeDataFiltering',
  'groupHideOpenParents',
  'groupHideParentOfSingleChild',
  'groupMaintainOrder',
  'groupSuppressBlankHeader',
  'initialGroupOrderComparator',
  'accentedSort',
  'aggFuncs',
  'getGroupRowAgg',
  ...MASTER_FLAGS,
];
