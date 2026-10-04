import React, { useMemo, useRef, useState } from 'react';
import { BASE_COLUMNS, makeRows, SAMPLE } from '../data.js';
import { Grid } from './_shared.jsx';

const CAT = '행';

function Selection({ p, ctx }) {
  const rowSelection = useMemo(
    () => ({
      mode: p.mode,
      checkboxes: p.checkboxes,
      headerCheckbox: p.headerCheckbox,
      enableClickSelection: p.enableClickSelection,
      enableSelectionWithoutKeys: p.enableSelectionWithoutKeys,
      hideDisabledCheckboxes: p.hideDisabled,
      isRowSelectable: p.onlyActive ? node => node.data?.useYn : undefined,
    }),
    [p.mode, p.checkboxes, p.headerCheckbox, p.enableClickSelection, p.enableSelectionWithoutKeys, p.hideDisabled, p.onlyActive],
  );
  return (
    <Grid
      rowData={SAMPLE}
      columnDefs={[...BASE_COLUMNS, { field: 'useYn', headerName: '사용', width: 80 }]}
      rowSelection={rowSelection}
      onSelectionChanged={e => ctx.log(`selectionChanged: ${e.api.getSelectedRows().length}행 [${e.api.getSelectedRows().slice(0, 5).map(r => r.id).join(',')}${e.api.getSelectedRows().length > 5 ? '…' : ''}]`)}
    />
  );
}

function RowDrag({ p, ctx }) {
  const [rows] = useState(() => makeRows(25));
  const ref = useRef(null);
  const defs = useMemo(
    () => [{ field: 'taskName', headerName: '작업명', rowDrag: !p.entireRow, width: 170 }, ...BASE_COLUMNS.filter(c => c.field !== 'taskName')],
    [p.entireRow],
  );
  return (
    <Grid
      gridRef={ref}
      rowData={rows}
      columnDefs={defs}
      rowDragManaged={p.managed}
      rowDragEntireRow={p.entireRow}
      rowDragMultiRow={p.multiRow}
      rowSelection={p.multiRow ? { mode: 'multiRow' } : undefined}
      onRowDragEnd={e => {
        const order = [];
        e.api.forEachNode(n => order.push(n.data.id));
        ctx.log(`rowDragEnd: ${e.node.data.taskName} → index ${e.overIndex} · 순서 ${order.slice(0, 8).join(',')}…`);
      }}
    />
  );
}

function PinnedRows({ p, ctx }) {
  const [top] = useState(() => [{ id: '★', taskName: '기본 조건 (편집 가능)', dbms: 'ALL', owner: '-', rowCnt: 0, status: '고정' }]);
  const bottom = useMemo(() => [{ id: '합계', taskName: '', dbms: '', owner: '', rowCnt: SAMPLE.reduce((s, r) => s + r.rowCnt, 0), status: '' }], []);
  return (
    <Grid
      rowData={SAMPLE}
      columnDefs={BASE_COLUMNS}
      defaultColDef={{ editable: true }}
      pinnedTopRowData={p.top ? top : undefined}
      pinnedBottomRowData={p.bottom ? bottom : undefined}
      getRowStyle={x => (x.node.rowPinned ? { fontWeight: 'bold', fontStyle: x.node.rowPinned === 'top' ? 'italic' : 'normal' } : undefined)}
      singleClickEdit
      onCellEditingStopped={e => ctx.log(`cellEditingStopped rowPinned=${e.rowPinned} ${e.colDef.field}=${e.value}`)}
    />
  );
}

function RowHeight({ p }) {
  const rows = useMemo(
    () =>
      SAMPLE.slice(0, 40).map((r, i) => ({
        ...r,
        memo: i % 3 === 0 ? '여러 줄 메모 — wrapText + autoHeight 를 켜면 내용 길이에 맞춰 행 높이가 늘어납니다. 긴 문장이 줄바꿈되어 모두 보입니다.' : '짧은 메모',
      })),
    [],
  );
  const defs = useMemo(
    () => [
      { field: 'id', width: 70 },
      { field: 'taskName', headerName: '작업명', width: 150 },
      { field: 'memo', headerName: '메모', width: 280, wrapText: p.autoHeight, autoHeight: p.autoHeight },
      { field: 'dbms', headerName: 'DBMS', width: 110 },
    ],
    [p.autoHeight],
  );
  return (
    <Grid
      key={String(p.autoHeight) + p.mode}
      rowData={rows}
      columnDefs={defs}
      rowHeight={p.mode === 'fixed' ? p.rowHeight : undefined}
      getRowHeight={p.mode === 'getRowHeight' ? x => (x.data.id % 2 ? 28 : 48) : undefined}
    />
  );
}

function FullWidth() {
  const rows = useMemo(() => SAMPLE.slice(0, 30).flatMap((r, i) => (i % 8 === 7 ? [r, { banner: `── ${Math.floor(i / 8) + 1}구간 소계: ${(i + 1) * 100}건 ──` }] : [r])), []);
  return (
    <Grid
      rowData={rows}
      columnDefs={BASE_COLUMNS}
      isFullWidthRow={x => !!x.rowNode.data?.banner}
      fullWidthCellRenderer={x => <div style={{ padding: '0 14px', lineHeight: '42px', fontWeight: 600, background: 'color-mix(in srgb, transparent, var(--r2-accent-color) 10%)' }}>{x.data.banner}</div>}
    />
  );
}

function RowSpan() {
  const rows = useMemo(() => {
    const regions = ['서울', '서울', '서울', '부산', '부산', '대구', '대구', '대구', '대구', '광주'];
    return regions.map((region, i) => ({ region, ...SAMPLE[i] }));
  }, []);
  const spanOf = x => {
    const i = x.node.rowIndex;
    const all = x.api;
    const prev = i > 0 ? all.getDisplayedRowAtIndex(i - 1)?.data.region : null;
    if (prev === x.data.region) return 1;
    let n = 1;
    while (all.getDisplayedRowAtIndex(i + n)?.data.region === x.data.region) n++;
    return n;
  };
  return (
    <Grid
      rowData={rows}
      suppressRowTransform
      columnDefs={[{ field: 'region', headerName: '지역', width: 100, rowSpan: spanOf, cellClassRules: { 'pg-span-cell': x => spanOf(x) > 1 } }, ...BASE_COLUMNS.slice(1)]}
    />
  );
}

function CellSpan({ p }) {
  const rows = useMemo(() => [...SAMPLE.slice(0, 60)].sort((a, b) => a.dbms.localeCompare(b.dbms) || a.status.localeCompare(b.status)), []);
  return (
    <Grid
      rowData={rows}
      enableCellSpan={p.enabled}
      columnDefs={[
        { field: 'dbms', headerName: 'DBMS', width: 120, spanRows: true },
        { field: 'status', headerName: '상태', width: 90, spanRows: p.custom ? x => x.valueA === x.valueB && x.nodeA.data.dbms === x.nodeB.data.dbms : true },
        ...BASE_COLUMNS.filter(c => c.field !== 'dbms' && c.field !== 'status'),
      ]}
      cellSelection
    />
  );
}

function MasterDetail({ ctx }) {
  const rows = useMemo(() => SAMPLE.slice(0, 20).map(r => ({ ...r, steps: makeRows(4, r.id * 10).map((s, k) => ({ step: k + 1, name: `${r.taskName}-단계${k + 1}`, rowCnt: s.rowCnt, status: s.status })) })), []);
  return (
    <Grid
      rowData={rows}
      columnDefs={[{ field: 'taskName', headerName: '작업명', cellRenderer: 'agGroupCellRenderer', width: 200 }, ...BASE_COLUMNS.slice(2)]}
      masterDetail
      detailRowHeight={200}
      onRowGroupOpened={e => ctx.log(`rowGroupOpened: ${e.data.taskName} expanded=${e.expanded}`)}
      detailCellRendererParams={{
        detailGridOptions: {
          columnDefs: [
            { field: 'step', headerName: '단계', width: 70 },
            { field: 'name', headerName: '이름', flex: 1 },
            { field: 'rowCnt', headerName: '행 수', type: 'numericColumn' },
            { field: 'status', headerName: '상태' },
          ],
        },
        getDetailRowData: x => x.successCallback(x.data.steps),
      }}
    />
  );
}

export default [
  {
    id: 'row-selection',
    category: CAT,
    name: '행 선택',
    desc: 'v34 rowSelection 객체: mode(singleRow/multiRow), checkboxes, headerCheckbox, enableClickSelection, enableSelectionWithoutKeys, isRowSelectable, hideDisabledCheckboxes. 레거시 문자열(single/multiple)도 지원합니다.',
    keywords: ['rowSelection', 'singleRow', 'multiRow', 'checkboxes', 'headerCheckbox', 'enableClickSelection', 'enableSelectionWithoutKeys', 'isRowSelectable', 'hideDisabledCheckboxes', 'getSelectedRows', 'getSelectedNodes', 'selectAll', 'deselectAll', 'onSelectionChanged', 'ag-Grid-SelectionColumn'],
    controls: [
      { key: 'mode', type: 'select', options: ['singleRow', 'multiRow'], default: 'multiRow' },
      { key: 'checkboxes', type: 'boolean', default: true },
      { key: 'headerCheckbox', type: 'boolean', default: true, desc: 'multiRow 에서 헤더 전체 선택' },
      { key: 'enableClickSelection', type: 'boolean', default: false, desc: '행 클릭으로 선택' },
      { key: 'enableSelectionWithoutKeys', type: 'boolean', default: false, desc: 'Ctrl 없이 클릭으로 다중 토글' },
      { key: 'onlyActive', type: 'boolean', default: false, desc: 'isRowSelectable: 사용(useYn)=true 행만' },
      { key: 'hideDisabled', type: 'boolean', default: false, desc: 'hideDisabledCheckboxes' },
    ],
    render: (p, ctx) => <Selection p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  rowSelection={{
    mode: '${p.mode}',
    checkboxes: ${p.checkboxes},
    headerCheckbox: ${p.headerCheckbox},
    enableClickSelection: ${p.enableClickSelection},
    enableSelectionWithoutKeys: ${p.enableSelectionWithoutKeys},${p.onlyActive ? '\n    isRowSelectable: node => node.data.useYn,' : ''}${p.hideDisabled ? '\n    hideDisabledCheckboxes: true,' : ''}
  }}
  onSelectionChanged={e => console.log(e.api.getSelectedRows())}
  ...
/>`,
    usage: {
      file: 'page/approval/ApprovalInfo/modal/ApprovalUserSelectModal.jsx',
      code: `rowSelection={{
  mode: 'multiRow',
  rowSelection: 'multiple',
  enableClickSelection: true,
  enableSelectionWithoutKeys: true,
}}`,
    },
  },
  {
    id: 'row-drag',
    category: CAT,
    name: '행 드래그',
    desc: 'rowDragManaged 는 정렬/필터가 없을 때 그리드가 직접 순서를 바꿉니다. rowDragEntireRow 는 행 어디서나, colDef.rowDrag 는 핸들로 드래그합니다. onRowDragEnd 에서 forEachNode 로 새 순서를 읽습니다.',
    keywords: ['rowDragManaged', 'rowDragEntireRow', 'rowDragMultiRow', 'rowDrag', 'rowDragText', 'onRowDragEnd', 'onRowDragMove', 'onRowDragEnter', 'forEachNode', 'suppressRowDrag'],
    controls: [
      { key: 'managed', type: 'boolean', default: true, desc: 'rowDragManaged' },
      { key: 'entireRow', type: 'boolean', default: false, desc: 'rowDragEntireRow (꺼지면 작업명 컬럼의 핸들)' },
      { key: 'multiRow', type: 'boolean', default: false, desc: 'rowDragMultiRow (선택된 여러 행 함께)' },
    ],
    render: (p, ctx) => <RowDrag p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  rowDragManaged={${p.managed}}${p.entireRow ? '\n  rowDragEntireRow' : ''}${p.multiRow ? "\n  rowDragMultiRow\n  rowSelection={{ mode: 'multiRow' }}" : ''}
  columnDefs={[{ field: 'taskName', rowDrag: ${!p.entireRow} }, ...]}
  onRowDragEnd={e => {
    const order = [];
    e.api.forEachNode(n => order.push(n.data.id));
  }}
/>`,
    usage: {
      file: 'page/work/workGroup/modal/WorkGroupPrioritySetting.jsx',
      code: `<Table
  rowNumbers
  rowData={settingTpJoinList}
  columnDefs={columnDefs}
  rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
  rowDragManaged
  animateRows
  rowDragEntireRow
  onRowDragEnd={props => props.api.refreshCells()}
/>`,
    },
  },
  {
    id: 'pinned-rows',
    category: CAT,
    name: '고정 행 (상단/하단)',
    desc: 'pinnedTopRowData / pinnedBottomRowData 로 스크롤해도 고정되는 행. 편집·스타일 가능하며 이벤트의 rowPinned 로 구분합니다.',
    keywords: ['pinnedTopRowData', 'pinnedBottomRowData', 'rowPinned', 'getPinnedTopRow', 'getPinnedBottomRowCount', 'getRowStyle', 'singleClickEdit'],
    controls: [
      { key: 'top', type: 'boolean', default: true },
      { key: 'bottom', type: 'boolean', default: true },
    ],
    render: (p, ctx) => <PinnedRows p={p} ctx={ctx} />,
    code: p => `const [top] = useState(() => [defaultCondition]); // 같은 참조 유지 (편집 보존)

<AgGridReact${p.top ? '\n  pinnedTopRowData={top}' : ''}${p.bottom ? '\n  pinnedBottomRowData={[totals]}' : ''}
  getRowStyle={p => (p.node.rowPinned ? { fontWeight: 'bold' } : undefined)}
  onCellEditingStopped={e => console.log(e.rowPinned, e.value)}
/>`,
    usage: {
      file: 'page/work/workGroup/work/component/ConditionInfo.jsx',
      code: `onRowDragEnd={onRowDragEnd}
defaultColDef={{ ...defaultColDef, editable: props => props.context.editable }}
pinnedTopRowData={[defaultConditionInfo]}
getRowStyle={getPinnedRowStyle}
onCellEditingStopped={onCellEditingStopped}
stopEditingWhenCellsLoseFocus
singleClickEdit
rowDragManaged`,
    },
  },
  {
    id: 'row-height',
    category: CAT,
    name: '행 높이 · 자동 높이',
    desc: 'rowHeight 고정, getRowHeight 로 행마다 다르게, wrapText + autoHeight 로 내용에 맞춰 자동 계산합니다.',
    keywords: ['rowHeight', 'getRowHeight', 'autoHeight', 'wrapText', 'resetRowHeights', 'onRowHeightChanged', 'setRowHeight'],
    controls: [
      { key: 'mode', type: 'select', options: ['fixed', 'getRowHeight'], default: 'fixed' },
      { key: 'rowHeight', type: 'number', default: 32 },
      { key: 'autoHeight', type: 'boolean', default: true, desc: '메모 컬럼 wrapText + autoHeight' },
    ],
    render: p => <RowHeight p={p} />,
    code: p => `<AgGridReact
  ${p.mode === 'fixed' ? `rowHeight={${p.rowHeight}}` : 'getRowHeight={p => (p.data.id % 2 ? 28 : 48)}'}
  columnDefs={[
    { field: 'memo', wrapText: ${p.autoHeight}, autoHeight: ${p.autoHeight} },
  ]}
/>`,
    usage: {
      file: 'page/work/workGroup/work/modal/WorkGroupPlanModal.jsx',
      code: `const columnDefs = [
  {
    field: 'explan',
    headerName: '실행 계획 정보',
    flex: 1,
    cellStyle: { whiteSpace: 'normal', overflowWrap: 'break-word' },
    autoHeight: true,
    valueFormatter: ({ data }) => data,
  },
];`,
    },
  },
  {
    id: 'full-width-rows',
    category: CAT,
    name: '전체 폭 행',
    desc: 'isFullWidthRow 가 true 인 행은 컬럼을 무시하고 fullWidthCellRenderer 로 행 전체를 그립니다 (배너, 소계 등).',
    keywords: ['isFullWidthRow', 'fullWidthCellRenderer', 'fullWidthCellRendererParams', 'embedFullWidthRows'],
    controls: [],
    render: () => <FullWidth />,
    code: () => `<AgGridReact
  isFullWidthRow={p => !!p.rowNode.data?.banner}
  fullWidthCellRenderer={p => <div className="banner">{p.data.banner}</div>}
/>`,
  },
  {
    id: 'row-span',
    category: CAT,
    name: '행 병합 (rowSpan)',
    desc: 'colDef.rowSpan(params) 로 아래 행까지 셀을 늘립니다. AG 와 동일하게 suppressRowTransform 과 함께 사용합니다.',
    keywords: ['rowSpan', 'suppressRowTransform', 'r2-cell-span'],
    controls: [],
    render: () => <RowSpan />,
    code: () => `<AgGridReact
  suppressRowTransform
  columnDefs={[
    { field: 'region', rowSpan: params => /* 같은 지역 연속 행 수 */ spanOf(params) },
  ]}
/>`,
  },
  {
    id: 'cell-span',
    category: CAT,
    name: '셀 스패닝 (같은 값 자동 병합)',
    desc: 'enableCellSpan + colDef.spanRows: 위아래로 같은 값이 이어지면 한 셀로 합칩니다. spanRows 에 함수를 주면 병합 조건을 직접 정합니다.',
    keywords: ['enableCellSpan', 'spanRows', 'valueA', 'valueB', 'cell spanning'],
    controls: [
      { key: 'enabled', type: 'boolean', default: true, desc: 'enableCellSpan' },
      { key: 'custom', type: 'boolean', default: true, desc: '상태 컬럼: 같은 DBMS 안에서만 병합 (함수)' },
    ],
    render: p => <CellSpan p={p} />,
    code: p => `<AgGridReact
  enableCellSpan={${p.enabled}}
  columnDefs={[
    { field: 'dbms', spanRows: true },
    { field: 'status', spanRows: ${p.custom ? '({ valueA, valueB, nodeA, nodeB }) => valueA === valueB && nodeA.data.dbms === nodeB.data.dbms' : 'true'} },
  ]}
/>`,
  },
  {
    id: 'master-detail',
    category: CAT,
    name: '마스터 / 디테일',
    desc: 'masterDetail + detailCellRendererParams(detailGridOptions, getDetailRowData) 로 행을 펼치면 하위 그리드가 열립니다.',
    keywords: ['masterDetail', 'detailCellRendererParams', 'detailGridOptions', 'getDetailRowData', 'detailRowHeight', 'detailRowAutoHeight', 'isRowMaster', 'agGroupCellRenderer', 'detailCellRenderer', 'onRowGroupOpened'],
    controls: [],
    render: (p, ctx) => <MasterDetail ctx={ctx} />,
    code: () => `<AgGridReact
  masterDetail
  detailRowHeight={200}
  columnDefs={[{ field: 'taskName', cellRenderer: 'agGroupCellRenderer' }, ...]}
  detailCellRendererParams={{
    detailGridOptions: { columnDefs: detailColumns },
    getDetailRowData: params => params.successCallback(params.data.steps),
  }}
/>`,
    usage: {
      file: 'page/approval/ApprovalInfo/ApprovalCheck.jsx',
      code: `isRowMaster={isRowMaster}
rowNumbers
suppressRowTransform
detailCellRendererParams={detailCellRendererParams}
masterDetail
detailRowHeight={200}
rowSelection={rowSelection}
onCellClicked={setOpinionModal}`,
    },
  },
];
