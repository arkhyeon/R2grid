import React, { useMemo, useRef, useState } from 'react';
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

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const HIER_ROWS = SAMPLE.map((r, i) => ({ ...r, updatedAt: ymd(new Date(2025, 6 + (i % 14), 1 + ((i * 7) % 28))) }));
const HIER_PRESETS = {
  'year,month': ['year', 'month'],
  'year,quarter,formattedMonth': ['year', 'quarter', 'formattedMonth'],
  'year,half,month': ['year', 'half', 'month'],
};

function DateHierarchy({ p, ctx }) {
  const cols = useMemo(
    () => [
      { field: 'updatedAt', headerName: '수정일', rowGroup: true, hide: true, enableRowGroup: true, sort: 'asc', groupHierarchy: HIER_PRESETS[p.parts] },
      { field: 'taskName', headerName: '작업명', minWidth: 140 },
      { field: 'dbms', headerName: 'DBMS', width: 110 },
      { field: 'rowCnt', headerName: '행 수', width: 130, aggFunc: 'sum', valueFormatter: x => (x.value == null ? '' : x.value.toLocaleString()) },
    ],
    [p.parts],
  );
  return (
    <Grid
      key={p.parts}
      rowData={HIER_ROWS}
      columnDefs={cols}
      groupDefaultExpanded={1}
      autoGroupColumnDef={{ headerName: '수정일', minWidth: 220 }}
      groupHierarchyConfig={{ half: { headerName: '반기', valueGetter: x => (Number(String(x.data?.updatedAt).slice(5, 7)) <= 6 ? '상반기' : '하반기') } }}
      rowGroupPanelShow="always"
      onRowGroupOpened={e => ctx.log(`${e.node.rowGroupColumn?.colDef.headerName}: ${e.node.key} ${e.expanded ? '펼침' : '접음'}`)}
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
      onColumnRowGroupChanged={e =>
        ctx.log(
          `columnRowGroupChanged: ${
            e.api
              .getRowGroupColumns()
              .map(c => c.getColId())
              .join(' > ') || '(없음)'
          }`,
        )
      }
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

// 끌어 옮기기용: 부모 id 필드 방식 (getDataPath 는 경로가 데이터에서 계산돼 자동 이동 대상이 아님)
const TREE_BY_PARENT = TREE.map(r => ({
  id: r.path.join('/'),
  pid: r.path.length > 1 ? r.path.slice(0, -1).join('/') : null,
  name: r.path.at(-1),
  headcount: r.headcount,
  budget: r.budget,
}));

function TreeData({ p, ctx }) {
  const [rows] = useState(() => TREE_BY_PARENT.map(r => ({ ...r })));
  const dragProps = p.drag
    ? {
        rowData: rows,
        treeDataParentIdField: 'pid',
        getRowId: x => x.data.id,
        rowDragManaged: true,
        onRowDragEnd: e =>
          e.dropPosition &&
          ctx.log(
            `${e.node.data.name} → ${e.dropPosition === 'inside' ? `${e.newParent?.data.name} 안` : `${e.overNode?.data.name} ${e.dropPosition === 'above' ? '위' : '아래'}`} (pid=${e.node.data.pid})`,
          ),
      }
    : { rowData: TREE, getDataPath: d => d.path };
  return (
    <Grid
      key={`${p.expanded}${p.drag}`}
      {...dragProps}
      treeData
      groupDefaultExpanded={p.expanded}
      autoGroupColumnDef={{ headerName: '조직', minWidth: 240, rowDrag: !!p.drag, ...(p.drag ? { valueGetter: x => x.data?.name } : null) }}
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
  const [qf, setQf] = useState('');
  return (
    <>
      <div className="pg-toolbar">
        <input placeholder="빠른 검색 (예: 노트북, 서울)" value={qf} onChange={e => setQf(e.target.value)} style={{ width: 200 }} />
        <span className="pg-note">{p.qfBefore ? '원본 행에 먼저 검색 → 맞는 행만 집계' : '집계가 끝난 행(지역 이름·결과 값)에서 검색'}</span>
      </div>
      <Grid
        key={`${p.byProduct}${p.pivotYear}${p.pivotQuarter}`}
        gridRef={ref}
        rowData={SALES}
        columnDefs={cols}
        quickFilterText={qf}
        applyQuickFilterBeforePivotOrAgg={p.qfBefore}
        pivotMode={p.pivotMode}
        autoGroupColumnDef={{ minWidth: 180 }}
        onColumnPivotModeChanged={() => ctx.log('columnPivotModeChanged')}
        onGridReady={e => ctx.log(`결과 컬럼: ${(e.api.getPivotResultColumns() || []).map(c => c.getColId()).join(', ') || '(없음)'}`)}
      />
    </>
  );
}

export default [
  {
    id: 'row-grouping',
    category: CAT,
    name: '행 그룹 · 집계',
    desc: 'colDef.rowGroup 으로 그룹, aggFunc(sum/min/max/avg/count/first/last/함수)로 집계. 그룹 체크 시 하위 전체 선택(groupSelects).',
    keywords: [
      'rowGroup',
      'rowGroupIndex',
      'aggFunc',
      'aggFuncs',
      'groupDefaultExpanded',
      'isGroupOpenByDefault',
      'autoGroupColumnDef',
      'groupSelects',
      'groupSelectsChildren',
      'suppressAggFuncInHeader',
      'setRowGroupColumns',
      'expandAll',
      'collapseAll',
      'onRowGroupOpened',
      'r2-Grid-AutoColumn',
    ],
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
        desc: '집계 컬럼(aggFunc) 헤더에 함수 이름을 붙일지. 그룹 행의 수량·매출 칸에 하위 합계가 표시됩니다.',
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
    id: 'date-hierarchy',
    category: CAT,
    name: '날짜 계층으로 묶기',
    desc: '날짜 컬럼 하나로 연 → 분기 → 월처럼 여러 단계로 묶습니다. colDef.groupHierarchy 에 단계를 나열하면 그 컬럼을 그룹으로 지정할 때 단계마다 묶음이 생깁니다. 원본 컬럼은 하나로 남아 그룹 패널·상태 저장·정렬은 원본 기준.',
    keywords: ['groupHierarchy', 'groupHierarchyConfig', 'year', 'quarter', 'month', 'formattedMonth', 'day', 'hour', 'minute', 'second', '날짜 그룹'],
    controls: [
      {
        key: 'parts',
        type: 'select',
        default: 'year,month',
        label: 'groupHierarchy',
        desc: "단계 목록. 내장: 'year' 'quarter' 'month' 'formattedMonth'(월 이름) 'day' 'hour' 'minute' 'second'. 직접 만든 단계는 groupHierarchyConfig 에 이름으로 정의하거나 colDef 를 그대로 넣습니다.",
        options: [
          { value: 'year,month', desc: "['year', 'month']" },
          { value: 'year,quarter,formattedMonth', desc: "['year', 'quarter', 'formattedMonth']" },
          { value: 'year,half,month', desc: "['year', 'half', 'month'] — half 는 groupHierarchyConfig 로 정의한 반기" },
        ],
      },
    ],
    render: (p, ctx) => <DateHierarchy p={p} ctx={ctx} />,
    code: p => `<R2Grid
  columnDefs={[
    { field: 'updatedAt', rowGroup: true, hide: true, groupHierarchy: ${JSON.stringify(HIER_PRESETS[p.parts]).replace(/"/g, "'")} },
    { field: 'rowCnt', aggFunc: 'sum' },
  ]}${
    p.parts.includes('half')
      ? `
  groupHierarchyConfig={{
    half: { headerName: '반기', valueGetter: p => (Number(p.data.updatedAt.slice(5, 7)) <= 6 ? '상반기' : '하반기') },
  }}`
      : ''
  }
/>`,
  },
  {
    id: 'group-display',
    category: CAT,
    name: '그룹 표시 방식',
    desc: "groupDisplayType: 'singleColumn'(기본) / 'multipleColumns'(그룹 단계마다 컬럼) / 'groupRows'(그룹을 전체 폭 행으로). groupHideOpenParents 는 펼친 부모 행을 숨기고 첫 자식에 표시, showOpenedGroup 은 모든 자식에 표시.",
    keywords: [
      'groupDisplayType',
      'singleColumn',
      'multipleColumns',
      'groupRows',
      'groupHideOpenParents',
      'showOpenedGroup',
      'groupRowRenderer',
      'groupRowRendererParams',
    ],
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
    keywords: [
      'treeData',
      'getDataPath',
      'autoGroupColumnDef',
      'groupDefaultExpanded',
      'aggFunc',
      'suppressAggFuncInHeader',
      'getRowId',
      'treeDataParentIdField',
      'treeDataChildrenField',
      'rowDragManaged',
      'rowDragInsertDelay',
      'isRowValidDropPosition',
      'treeDataDisplayType',
    ],
    controls: [
      {
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
      },
      {
        key: 'drag',
        type: 'boolean',
        default: false,
        label: 'rowDragManaged',
        desc: '트리 행을 끌어 다른 행의 위·아래(같은 부모) 또는 가운데(그 행의 자식)로 옮깁니다. 부모가 데이터에 있는 treeDataParentIdField · treeDataChildrenField 방식에서만 그리드가 직접 옮기고, 접힌 행 가운데에 rowDragInsertDelay(기본 500ms) 머무르면 펼쳐집니다.',
        on: '부모 id 필드(pid) 트리 + 끌어 옮기기',
        off: 'getDataPath 경로 트리',
      },
    ],
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
    keywords: [
      'pivotMode',
      'pivot',
      'pivotIndex',
      'enablePivot',
      'setPivotMode',
      'setPivotColumns',
      'getPivotResultColumns',
      'pivotComparator',
      'onColumnPivotModeChanged',
      'pivot_',
    ],
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
      {
        key: 'qfBefore',
        type: 'boolean',
        default: false,
        label: 'applyQuickFilterBeforePivotOrAgg',
        desc: '피벗 모드에서 빠른 검색을 어디에 적용할지. 기본(끔)은 집계가 끝난 행(지역 이름·결과 컬럼 값)에서 찾고, 맞은 그룹은 하위 전부 남깁니다. 켜면 원본 행(제품·분기 등)에 먼저 적용하고 남은 행만 집계합니다.',
        on: "'노트북' 검색 → 노트북 행만으로 다시 집계",
        off: "'노트북' 검색 → 결과 없음 (집계된 행엔 제품 이름이 없음)",
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
  quickFilterText={text}${p.qfBefore ? '\n  applyQuickFilterBeforePivotOrAgg   // 원본 행에 먼저 검색' : '                 // 기본: 집계된 행에서 검색'}
/>

api.setPivotColumns(['year']);
api.getPivotResultColumns(); // pivot_2024_qty, pivot_2024_sales, ...`,
  },
];

export { SAMPLE };
