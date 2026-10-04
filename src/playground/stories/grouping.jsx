import React, { useMemo, useRef } from 'react';
import { SALES, SAMPLE, TREE } from '../data.js';
import { Grid } from './_shared.jsx';

const CAT = '그룹 · 집계 · 피벗';

const SALES_COLS = [
  { field: 'region', headerName: '지역', rowGroup: true, hide: true, enableRowGroup: true },
  { field: 'product', headerName: '제품', rowGroup: true, hide: true, enableRowGroup: true },
  { field: 'year', headerName: '연도', width: 90, enableRowGroup: true, enablePivot: true },
  { field: 'quarter', headerName: '분기', width: 90, enableRowGroup: true, enablePivot: true },
  { field: 'qty', headerName: '수량', width: 100, aggFunc: 'sum' },
  { field: 'sales', headerName: '매출', width: 130, aggFunc: 'sum', valueFormatter: p => (p.value == null ? '' : p.value.toLocaleString()) },
];

function RowGrouping({ p, ctx }) {
  return (
    <Grid
      key={`${p.expanded}${p.selects}`}
      rowData={SALES}
      columnDefs={SALES_COLS}
      groupDefaultExpanded={p.expanded}
      autoGroupColumnDef={{ headerName: '지역 / 제품', minWidth: 220 }}
      rowSelection={p.selects ? { mode: 'multiRow', groupSelects: 'descendants', checkboxLocation: 'autoGroupColumn' } : undefined}
      suppressAggFuncInHeader={!p.aggHeader}
      onSelectionChanged={e => ctx.log(`선택 리프 ${e.api.getSelectedNodes().length}행`)}
      onRowGroupOpened={e => ctx.log(`rowGroupOpened ${e.node.key} ${e.expanded}`)}
    />
  );
}

function GroupDisplay({ p }) {
  return (
    <Grid
      key={`${p.type}${p.hideOpen}${p.showOpened}`}
      rowData={SALES}
      columnDefs={SALES_COLS}
      groupDefaultExpanded={1}
      groupDisplayType={p.type}
      groupHideOpenParents={p.hideOpen}
      showOpenedGroup={p.showOpened}
      autoGroupColumnDef={{ minWidth: 160 }}
    />
  );
}

function GroupPanel({ ctx }) {
  return (
    <Grid
      rowData={SALES}
      columnDefs={SALES_COLS.map(c => ({ ...c, rowGroup: c.field === 'region', hide: c.field === 'region' }))}
      rowGroupPanelShow="always"
      autoGroupColumnDef={{ minWidth: 200 }}
      onColumnRowGroupChanged={e => ctx.log(`columnRowGroupChanged: ${e.api.getRowGroupColumns().map(c => c.getColId()).join(' > ') || '(없음)'}`)}
    />
  );
}

function TotalRows({ p }) {
  return (
    <Grid
      key={`${p.group}${p.grand}`}
      rowData={SALES}
      columnDefs={SALES_COLS}
      groupDefaultExpanded={1}
      groupTotalRow={p.group === 'none' ? undefined : p.group}
      grandTotalRow={p.grand === 'none' ? undefined : p.grand}
      autoGroupColumnDef={{ minWidth: 200 }}
    />
  );
}

function TreeData({ p, ctx }) {
  return (
    <Grid
      key={String(p.expanded)}
      rowData={TREE}
      treeData
      getDataPath={d => d.path}
      groupDefaultExpanded={p.expanded}
      autoGroupColumnDef={{ headerName: '조직', minWidth: 240 }}
      columnDefs={[
        { field: 'headcount', headerName: '인원', aggFunc: 'sum', width: 120 },
        { field: 'budget', headerName: '예산(백만)', aggFunc: 'sum', width: 140 },
      ]}
      suppressAggFuncInHeader
      onRowGroupOpened={e => ctx.log(`rowGroupOpened ${e.node.key}`)}
    />
  );
}

function Pivot({ p, ctx }) {
  const ref = useRef(null);
  const cols = useMemo(
    () =>
      SALES_COLS.map(c => ({
        ...c,
        rowGroup: c.field === 'region' || (c.field === 'product' && p.byProduct),
        hide: c.field === 'region' || c.field === 'product',
        pivot: (c.field === 'year' && p.pivotYear) || (c.field === 'quarter' && p.pivotQuarter),
      })),
    [p.byProduct, p.pivotYear, p.pivotQuarter],
  );
  return (
    <Grid
      key={`${p.byProduct}${p.pivotYear}${p.pivotQuarter}`}
      gridRef={ref}
      rowData={SALES}
      columnDefs={cols}
      pivotMode={p.pivotMode}
      autoGroupColumnDef={{ minWidth: 180 }}
      onColumnPivotModeChanged={() => ctx.log('columnPivotModeChanged')}
      onGridReady={e => ctx.log(`결과 컬럼: ${(e.api.getPivotResultColumns() || []).map(c => c.getColId()).join(', ') || '(없음)'}`)}
    />
  );
}

export default [
  {
    id: 'row-grouping',
    category: CAT,
    name: '행 그룹 · 집계',
    desc: 'colDef.rowGroup 으로 그룹, aggFunc(sum/min/max/avg/count/first/last/함수)로 집계. 그룹 체크 시 하위 전체 선택(groupSelects).',
    keywords: ['rowGroup', 'rowGroupIndex', 'aggFunc', 'aggFuncs', 'groupDefaultExpanded', 'isGroupOpenByDefault', 'autoGroupColumnDef', 'groupSelects', 'groupSelectsChildren', 'suppressAggFuncInHeader', 'setRowGroupColumns', 'expandAll', 'collapseAll', 'onRowGroupOpened', 'ag-Grid-AutoColumn'],
    controls: [
      { key: 'expanded', type: 'select', options: [0, 1, -1], default: 1, desc: 'groupDefaultExpanded (-1 = 전부)' },
      { key: 'selects', type: 'boolean', default: true, desc: "rowSelection.groupSelects: 'descendants'" },
      { key: 'aggHeader', type: 'boolean', default: true, desc: '헤더에 sum(…) 표시' },
    ],
    render: (p, ctx) => <RowGrouping p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  columnDefs={[
    { field: 'region', rowGroup: true, hide: true },
    { field: 'product', rowGroup: true, hide: true },
    { field: 'qty', aggFunc: 'sum' },
    { field: 'sales', aggFunc: 'sum' },
  ]}
  groupDefaultExpanded={${p.expanded}}
  autoGroupColumnDef={{ headerName: '지역 / 제품', minWidth: 220 }}${p.selects ? "\n  rowSelection={{ mode: 'multiRow', groupSelects: 'descendants', checkboxLocation: 'autoGroupColumn' }}" : ''}${p.aggHeader ? '' : '\n  suppressAggFuncInHeader'}
/>`,
    usage: {
      file: 'page/widget/message/modal/MessageAddress.jsx',
      code: `groupSelectsChildren: true,
columnDefs: [
  {
    headerName: '그룹',
    field: 'group',
    flex: 1,
    rowGroup: true,
    suppressColumnsToolPanel: true,
    hide: true,
  },
],
rowSelection: {
  mode: 'multiRow',
  checkboxes: true,
  enableSelectionWithoutKeys: true,
  ...`,
    },
  },
  {
    id: 'group-display',
    category: CAT,
    name: '그룹 표시 방식',
    desc: "groupDisplayType: 'singleColumn'(기본) / 'multipleColumns'(그룹 단계마다 컬럼) / 'groupRows'(그룹을 전체 폭 행으로). groupHideOpenParents 는 펼친 부모 행을 숨기고 첫 자식에 표시, showOpenedGroup 은 모든 자식에 표시.",
    keywords: ['groupDisplayType', 'singleColumn', 'multipleColumns', 'groupRows', 'groupHideOpenParents', 'showOpenedGroup', 'groupRowRenderer', 'groupRowRendererParams'],
    controls: [
      { key: 'type', type: 'select', options: ['singleColumn', 'multipleColumns', 'groupRows'], default: 'multipleColumns' },
      { key: 'hideOpen', type: 'boolean', default: false, desc: 'groupHideOpenParents' },
      { key: 'showOpened', type: 'boolean', default: false, desc: 'showOpenedGroup' },
    ],
    render: p => <GroupDisplay p={p} />,
    code: p => `<AgGridReact
  groupDisplayType="${p.type}"${p.hideOpen ? '\n  groupHideOpenParents' : ''}${p.showOpened ? '\n  showOpenedGroup' : ''}
  groupDefaultExpanded={1}
  columnDefs={columnDefs}
/>`,
  },
  {
    id: 'row-group-panel',
    category: CAT,
    name: '행 그룹 패널',
    desc: "rowGroupPanelShow: 'always' | 'onlyWhenGrouping'. enableRowGroup 컬럼의 헤더를 패널로 끌어 그룹을 추가하고 × 로 해제합니다.",
    keywords: ['rowGroupPanelShow', 'enableRowGroup', 'onColumnRowGroupChanged', 'addRowGroupColumns', 'removeRowGroupColumns', 'getRowGroupColumns'],
    controls: [],
    render: (p, ctx) => <GroupPanel ctx={ctx} />,
    code: () => `<AgGridReact
  rowGroupPanelShow="always"
  columnDefs={[
    { field: 'region', rowGroup: true, hide: true },
    { field: 'product', enableRowGroup: true },
    { field: 'year', enableRowGroup: true },
  ]}
  onColumnRowGroupChanged={e => console.log(e.api.getRowGroupColumns())}
/>`,
  },
  {
    id: 'total-rows',
    category: CAT,
    name: '그룹 합계 · 총합계 행',
    desc: "groupTotalRow: 'top' | 'bottom' | 함수, grandTotalRow: 'top' | 'bottom' | 'pinnedTop' | 'pinnedBottom'. 'bottom' 이면 펼친 그룹 행의 집계는 비우고 합계 행에 표시합니다.",
    keywords: ['groupTotalRow', 'grandTotalRow', 'pinnedBottom', 'pinnedTop', 'groupIncludeFooter', 'groupIncludeTotalFooter', 'footer', '합계'],
    controls: [
      { key: 'group', type: 'select', options: ['none', 'bottom'], default: 'bottom', desc: 'groupTotalRow' },
      { key: 'grand', type: 'select', options: ['none', 'top', 'bottom', 'pinnedBottom'], default: 'pinnedBottom', desc: 'grandTotalRow' },
    ],
    render: p => <TotalRows p={p} />,
    code: p => `<AgGridReact${p.group !== 'none' ? `\n  groupTotalRow="${p.group}"` : ''}${p.grand !== 'none' ? `\n  grandTotalRow="${p.grand}"` : ''}
  columnDefs={columnDefs}   // aggFunc 컬럼 필요
/>`,
  },
  {
    id: 'tree-data',
    category: CAT,
    name: '트리 데이터',
    desc: 'treeData + getDataPath 로 경로 배열을 계층으로 표시합니다. 부모 행 값은 aggFunc 로 집계됩니다.',
    keywords: ['treeData', 'getDataPath', 'autoGroupColumnDef', 'groupDefaultExpanded', 'aggFunc', 'suppressAggFuncInHeader', 'getRowId'],
    controls: [{ key: 'expanded', type: 'select', options: [0, 1, -1], default: -1, desc: 'groupDefaultExpanded' }],
    render: (p, ctx) => <TreeData p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  treeData
  getDataPath={data => data.path}          // ['본사', '개발본부', '개발1팀']
  groupDefaultExpanded={${p.expanded}}
  autoGroupColumnDef={{ headerName: '조직' }}
  columnDefs={[{ field: 'headcount', aggFunc: 'sum' }, { field: 'budget', aggFunc: 'sum' }]}
  suppressAggFuncInHeader
/>`,
    usage: {
      file: 'page/management/userGroup/UserGroupRole.jsx',
      code: `columnDefs={columnDefs}
defaultColDef={{ sortable: false }}
autoGroupColumnDef={autoGroupColumnDef}
groupDefaultExpanded={1}
treeData
getRowId={params => String(params.data.mid)}
getDataPath={({ depth1, depth2, depth3 }) => {
  if (depth3) return [depth1, depth2, depth3];
  if (depth2) return [depth1, depth2];
  return [depth1];
}}
suppressAggFuncInHeader`,
    },
  },
  {
    id: 'pivot',
    category: CAT,
    name: '피벗',
    desc: 'pivotMode 에서 pivot 컬럼의 값 조합마다 결과 컬럼을 만들고, 행 그룹 × 피벗 키별로 집계합니다. 행 그룹이 없으면 합계 1행.',
    keywords: ['pivotMode', 'pivot', 'pivotIndex', 'enablePivot', 'setPivotMode', 'setPivotColumns', 'getPivotResultColumns', 'pivotComparator', 'onColumnPivotModeChanged', 'pivot_'],
    controls: [
      { key: 'pivotMode', type: 'boolean', default: true },
      { key: 'pivotYear', type: 'boolean', default: true, desc: '연도 컬럼 pivot' },
      { key: 'pivotQuarter', type: 'boolean', default: false, desc: '분기 컬럼 pivot (2단)' },
      { key: 'byProduct', type: 'boolean', default: false, desc: '제품도 행 그룹' },
    ],
    render: (p, ctx) => <Pivot p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  pivotMode={${p.pivotMode}}
  columnDefs={[
    { field: 'region', rowGroup: true },${p.byProduct ? "\n    { field: 'product', rowGroup: true }," : ''}
    { field: 'year', pivot: ${p.pivotYear} },
    { field: 'quarter', pivot: ${p.pivotQuarter} },
    { field: 'qty', aggFunc: 'sum' },
    { field: 'sales', aggFunc: 'sum' },
  ]}
/>

api.setPivotColumns(['year']);
api.getPivotResultColumns(); // pivot_2024_qty, pivot_2024_sales, ...`,
  },
];

export { SAMPLE };
