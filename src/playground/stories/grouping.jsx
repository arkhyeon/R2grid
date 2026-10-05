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
    keywords: ['rowGroup', 'rowGroupIndex', 'aggFunc', 'aggFuncs', 'groupDefaultExpanded', 'isGroupOpenByDefault', 'autoGroupColumnDef', 'groupSelects', 'groupSelectsChildren', 'suppressAggFuncInHeader', 'setRowGroupColumns', 'expandAll', 'collapseAll', 'onRowGroupOpened', 'r2-Grid-AutoColumn'],
    controls: [
      {
        key: 'expanded',
        type: 'select',
        default: 1,
        label: 'groupDefaultExpanded',
        desc: '처음 그릴 때 몇 단계까지 그룹을 펼칠지. 이후 사용자가 접고 펼친 상태는 데이터가 바뀌어도 유지됩니다.',
        options: [
          { value: 0, desc: '모두 접힘 — 최상위 그룹만' },
          { value: 1, desc: '1단계(지역)만 펼침' },
          { value: -1, desc: '전부 펼침' },
        ],
      },
      {
        key: 'selects',
        type: 'boolean',
        default: true,
        label: "rowSelection.groupSelects: 'descendants'",
        desc: "그룹 행 체크박스가 하위 행까지 선택할지. 이 데모는 checkboxLocation: 'autoGroupColumn' 으로 체크박스를 그룹 컬럼 안에 둡니다. getSelectedNodes() 는 리프 행만 반환합니다.",
        on: '그룹 체크 = 하위 전부 선택, 일부만 선택되면 − 표시',
        off: '선택 안 함 (rowSelection 없음)',
      },
      {
        key: 'aggHeader',
        type: 'boolean',
        default: true,
        label: 'suppressAggFuncInHeader (반대)',
        desc: "집계 컬럼(aggFunc) 헤더에 함수 이름을 붙일지. 그룹 행의 수량·매출 칸에 하위 합계가 표시됩니다.",
        on: "헤더 'sum(수량)'",
        off: "헤더 '수량' (suppressAggFuncInHeader: true)",
      },
    ],
    render: (p, ctx) => <RowGrouping p={p} ctx={ctx} />,
    code: p => `<R2Grid
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
      {
        key: 'type',
        type: 'select',
        default: 'multipleColumns',
        label: 'groupDisplayType',
        desc: '행 그룹을 화면에 어떻게 보여줄지.',
        options: [
          { value: 'singleColumn', desc: '그룹 컬럼 하나에 계층(지역 › 제품)을 들여쓰기로' },
          { value: 'multipleColumns', desc: '그룹 기준마다 컬럼 하나씩 (지역 컬럼, 제품 컬럼)' },
          { value: 'groupRows', desc: '그룹 행이 행 전체 폭을 쓰는 제목 줄로 (그룹 컬럼 없음)' },
        ],
      },
      {
        key: 'hideOpen',
        type: 'boolean',
        default: false,
        label: 'groupHideOpenParents',
        desc: '펼친 그룹 행을 숨기고 그 그룹 값을 첫 하위 행의 그룹 컬럼에 표시합니다 (엑셀 피벗 표 모양). multipleColumns 를 함께 켜는 효과가 있습니다.',
        on: '펼친 그룹의 제목 행이 사라짐',
        off: '그룹 제목 행 표시',
      },
      {
        key: 'showOpened',
        type: 'boolean',
        default: false,
        label: 'showOpenedGroup',
        desc: '리프 행의 그룹 컬럼(비어 있는 칸)에 속한 그룹 값을 보여줍니다.',
        on: '하위 행에도 지역·제품 이름 표시',
        off: '하위 행의 그룹 칸은 비움',
      },
    ],
    render: p => <GroupDisplay p={p} />,
    code: p => `<R2Grid
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
    code: () => `<R2Grid
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
      {
        key: 'group',
        type: 'select',
        default: 'bottom',
        label: 'groupTotalRow',
        desc: '그룹마다 합계 행을 따로 둘지.',
        options: [
          { value: 'none', desc: '없음 — 합계는 그룹 행 자체에 표시' },
          { value: 'bottom', desc: '각 그룹 끝에 합계 행. 그룹을 펼치면 그룹 행의 집계 칸은 비움' },
        ],
      },
      {
        key: 'grand',
        type: 'select',
        default: 'pinnedBottom',
        label: 'grandTotalRow',
        desc: '전체 합계 행 위치.',
        options: [
          { value: 'none', desc: '없음' },
          { value: 'top', desc: '목록 맨 위 (스크롤하면 같이 올라감)' },
          { value: 'bottom', desc: '목록 맨 아래' },
          { value: 'pinnedBottom', desc: '하단 고정 — 항상 보임 (pinnedTop 도 가능)' },
        ],
      },
    ],
    render: p => <TotalRows p={p} />,
    code: p => `<R2Grid${p.group !== 'none' ? `\n  groupTotalRow="${p.group}"` : ''}${p.grand !== 'none' ? `\n  grandTotalRow="${p.grand}"` : ''}
  columnDefs={columnDefs}   // aggFunc 컬럼 필요
/>`,
  },
  {
    id: 'tree-data',
    category: CAT,
    name: '트리 데이터',
    desc: 'treeData + getDataPath 로 경로 배열을 계층으로 표시합니다. 부모 행 값은 aggFunc 로 집계됩니다.',
    keywords: ['treeData', 'getDataPath', 'autoGroupColumnDef', 'groupDefaultExpanded', 'aggFunc', 'suppressAggFuncInHeader', 'getRowId'],
    controls: [{
        key: 'expanded',
        type: 'select',
        default: -1,
        label: 'groupDefaultExpanded',
        desc: '트리를 처음 몇 단계까지 펼칠지.',
        options: [
          { value: 0, desc: '최상위만' },
          { value: 1, desc: '1단계(본부)까지' },
          { value: -1, desc: '전부 펼침' },
        ],
      }],
    render: (p, ctx) => <TreeData p={p} ctx={ctx} />,
    code: p => `<R2Grid
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
      {
        key: 'pivotMode',
        type: 'boolean',
        default: true,
        label: 'pivotMode',
        desc: '피벗 모드. 켜면 리프 행은 숨기고 그룹 집계만, 피벗 컬럼 값(연도 등)마다 결과 컬럼을 만들어 aggFunc 값을 채웁니다.',
        on: '지역별 × 연도별 매출 합계 표',
        off: '일반 그룹 (리프 행 표시)',
      },
      {
        key: 'pivotYear',
        type: 'boolean',
        default: true,
        label: '연도 pivot',
        desc: '연도 컬럼을 피벗(colDef.pivot)으로 — 연도 값마다 결과 컬럼이 생깁니다.',
        on: '2024 / 2025 컬럼',
        off: '연도로 나누지 않음',
      },
      {
        key: 'pivotQuarter',
        type: 'boolean',
        default: false,
        label: '분기 pivot',
        desc: '분기도 피벗. 연도와 같이 켜면 헤더가 2단(연도 › 분기)이 됩니다.',
        on: '연도 › Q1·Q2 2단 헤더',
        off: '분기로 나누지 않음',
      },
      {
        key: 'byProduct',
        type: 'boolean',
        default: false,
        label: '제품 rowGroup',
        desc: '제품도 행 그룹으로 추가 (지역 › 제품 2단 그룹).',
        on: '지역 아래 제품별 합계',
        off: '지역별 합계만',
      },
    ],
    render: (p, ctx) => <Pivot p={p} ctx={ctx} />,
    code: p => `<R2Grid
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
