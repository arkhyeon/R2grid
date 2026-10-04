import React, { useMemo, useRef, useState } from 'react';
import { BASE_COLUMNS, SAMPLE } from '../data.js';
import { Grid, IMPORT_LINE } from './_shared.jsx';

const CAT = '컬럼';

function ColumnDefs({ p, ctx }) {
  const columnDefs = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 80, pinned: p.pinId ? 'left' : null, lockPosition: 'left' },
      { field: 'taskName', headerName: '작업명', minWidth: 140, flex: 2, headerTooltip: '작업 이름 (headerTooltip)' },
      { field: 'dbms', headerName: 'DBMS', width: 110, hide: p.hideDbms },
      { field: 'rowCnt', headerName: '행 수', type: 'numericColumn', width: 130, valueFormatter: x => x.value?.toLocaleString() },
      { field: 'progress', headerName: '진행률', width: 110, cellDataType: 'number', valueFormatter: x => `${x.value}%` },
      { field: 'useYn', headerName: '사용', width: 80 },
      { field: 'updatedAt', headerName: '수정일', width: 120, pinned: p.pinDate ? 'right' : null },
    ],
    [p.pinId, p.pinDate, p.hideDbms],
  );
  return <Grid rowData={SAMPLE} columnDefs={columnDefs} onColumnPinned={e => ctx.log(`columnPinned ${e.column?.getColId()} → ${e.pinned}`)} />;
}

function stageGroup(n) {
  const g = (column, data) => {
    const parent = column.originalParent.colGroupDef.field;
    return data[parent]?.[column.colId];
  };
  return {
    headerName: `${n}단계`,
    field: `stage${n}`,
    marryChildren: true,
    children: [
      { headerName: '파기모델', colId: 'model', field: `s${n}model`, columnGroupShow: 'open', valueGetter: ({ column, data }) => g(column, data), width: 120 },
      { headerName: '사용', colId: 'yn', field: `s${n}yn`, valueGetter: ({ column, data }) => g(column, data), width: 70 },
      { headerName: '추출방식', colId: 'extr', field: `s${n}extr`, columnGroupShow: 'open', valueGetter: ({ column, data }) => g(column, data), width: 100 },
      { headerName: '파기구분', colId: 'type', field: `s${n}type`, valueGetter: ({ column, data }) => g(column, data), width: 90 },
    ],
  };
}
const STAGE_ROWS = SAMPLE.slice(0, 40).map((r, i) => ({
  ...r,
  stage1: { model: ['원본>임시>분리', '원본>분리', '원본'][i % 3], yn: i % 4 ? 'O' : 'X', extr: i % 2 ? '업무맵' : '계층쿼리', type: i % 2 ? '삭제' : '업데이트' },
  stage2: { model: ['원본>분리', '원본'][i % 2], yn: i % 3 ? 'O' : 'X', extr: '업무맵', type: '삭제' },
}));
function ColumnGroups({ p, ctx }) {
  const columnDefs = useMemo(() => {
    const defs = [{ field: 'taskName', headerName: '작업명', width: 140 }, stageGroup(1), stageGroup(2)];
    if (p.openByDefault) defs.slice(1).forEach(d => (d.openByDefault = true));
    return defs;
  }, [p.openByDefault]);
  return (
    <Grid
      key={String(p.openByDefault)}
      rowData={STAGE_ROWS}
      columnDefs={columnDefs}
      onColumnGroupOpened={e => ctx.log(`columnGroupOpened: ${e.columnGroup.getColGroupDef().headerName} → ${e.columnGroup.isExpanded()}`)}
      onColumnMoved={e => ctx.log(`columnMoved: ${e.column?.getColId()}`)}
    />
  );
}

function Sizing({ p, ctx }) {
  const ref = useRef(null);
  const strategy = p.strategy === 'none' ? undefined : p.strategy === 'fitProvidedWidth' ? { type: 'fitProvidedWidth', width: 900 } : { type: p.strategy };
  return (
    <>
      <div className="pg-toolbar">
        <button onClick={() => ref.current.api.autoSizeAllColumns()}>autoSizeAllColumns</button>
        <button onClick={() => ref.current.api.autoSizeAllColumns(true)}>autoSize (헤더 제외)</button>
        <button onClick={() => ref.current.api.sizeColumnsToFit()}>sizeColumnsToFit</button>
        <button onClick={() => ref.current.api.setColumnWidths([{ key: 'taskName', newWidth: 300 }])}>작업명 300px</button>
        <span className="pg-note">헤더 경계를 끌어 리사이즈 · 더블클릭 = 자동 맞춤</span>
      </div>
      <Grid
        key={p.strategy}
        gridRef={ref}
        rowData={SAMPLE}
        columnDefs={BASE_COLUMNS}
        autoSizeStrategy={strategy}
        onColumnResized={e => e.finished && ctx.log(`columnResized: ${e.column?.getColId() ?? '(여러 컬럼)'} ${e.column ? e.column.getActualWidth() + 'px' : ''} source=${e.source}`)}
      />
    </>
  );
}

function ColumnState({ ctx }) {
  const ref = useRef(null);
  const [saved, setSaved] = useState(null);
  return (
    <>
      <div className="pg-toolbar">
        <button
          onClick={() => {
            const s = ref.current.api.getColumnState();
            setSaved(s);
            ctx.log(`getColumnState → ${s.length}개 저장`);
          }}
        >
          상태 저장
        </button>
        <button disabled={!saved} onClick={() => ref.current.api.applyColumnState({ state: saved, applyOrder: true })}>
          복원 (applyColumnState)
        </button>
        <button onClick={() => ref.current.api.resetColumnState()}>resetColumnState</button>
        <button onClick={() => ref.current.api.setColumnsVisible(['dbms', 'status'], false)}>DBMS·상태 숨김</button>
        <button onClick={() => ref.current.api.moveColumns(['updatedAt'], 1)}>수정일 → 2번째</button>
        <span className="pg-note">헤더 드래그로 이동, 그리드 밖으로 끌면 숨김</span>
      </div>
      <Grid
        gridRef={ref}
        rowData={SAMPLE}
        columnDefs={BASE_COLUMNS}
        onColumnMoved={e => e.finished && ctx.log(`columnMoved ${e.column?.getColId()} → ${e.toIndex}`)}
        onColumnVisible={e => ctx.log(`columnVisible ${e.columns.map(c => c.getColId())} → ${e.visible}`)}
      />
    </>
  );
}

function RowNumbers({ p }) {
  return <Grid rowData={SAMPLE} columnDefs={BASE_COLUMNS} rowNumbers={p.rowNumbers} cellSelection rowSelection={p.checkbox ? { mode: 'multiRow' } : undefined} />;
}

function ColSpan() {
  const rows = SAMPLE.slice(0, 30).map((r, i) => (i % 6 === 0 ? { ...r, section: `── ${i / 6 + 1}구간 ──` } : r));
  const defs = [
    { field: 'section', headerName: '구분', width: 120, colSpan: x => (x.data.section ? 4 : 1), valueGetter: x => x.data.section ?? x.data.taskName },
    { field: 'dbms', headerName: 'DBMS', width: 110 },
    { field: 'owner', headerName: '소유자', width: 110 },
    { field: 'status', headerName: '상태', width: 90 },
    { field: 'rowCnt', headerName: '행 수', width: 120, type: 'numericColumn' },
  ];
  return <Grid rowData={rows} columnDefs={defs} />;
}

function Aligned({ ctx }) {
  const top = useRef(null);
  const bottom = useRef(null);
  const totals = useMemo(() => [{ id: '합계', taskName: '', dbms: '', owner: '', rowCnt: SAMPLE.reduce((s, r) => s + r.rowCnt, 0), status: '', updatedAt: '' }], []);
  return (
    <>
      <div className="pg-toolbar">
        <span className="pg-note">위 그리드의 컬럼 폭/순서/숨김/가로 스크롤이 아래 합계 그리드에 그대로 반영됩니다</span>
      </div>
      <Grid gridRef={top} height={300} rowData={SAMPLE} columnDefs={BASE_COLUMNS} alignedGrids={[bottom]} onColumnResized={e => e.finished && ctx.log('위 그리드 리사이즈 → 아래 동기화')} />
      <Grid gridRef={bottom} height={70} rowData={totals} columnDefs={BASE_COLUMNS} headerHeight={0} alignedGrids={[top]} />
    </>
  );
}

export default [
  {
    id: 'column-defs',
    category: CAT,
    name: '컬럼 정의',
    desc: 'width / flex / minWidth / hide / pinned / lockPosition / headerTooltip / type(numericColumn) / cellDataType 등 컬럼 속성.',
    keywords: ['columnDefs', 'field', 'headerName', 'width', 'flex', 'minWidth', 'maxWidth', 'hide', 'pinned', 'lockPosition', 'headerTooltip', 'numericColumn', 'cellDataType', 'columnTypes'],
    controls: [
      { key: 'pinId', type: 'boolean', default: true, desc: "ID 컬럼 pinned: 'left'" },
      { key: 'pinDate', type: 'boolean', default: false, desc: "수정일 컬럼 pinned: 'right'" },
      { key: 'hideDbms', type: 'boolean', default: false, desc: 'DBMS 컬럼 hide' },
    ],
    render: (p, ctx) => <ColumnDefs p={p} ctx={ctx} />,
    code: p => `const columnDefs = [
  { field: 'id', headerName: 'ID', width: 80, pinned: ${p.pinId ? "'left'" : 'null'}, lockPosition: 'left' },
  { field: 'taskName', headerName: '작업명', minWidth: 140, flex: 2, headerTooltip: '작업 이름' },
  { field: 'dbms', headerName: 'DBMS', width: 110, hide: ${p.hideDbms} },
  { field: 'rowCnt', headerName: '행 수', type: 'numericColumn', valueFormatter: p => p.value?.toLocaleString() },
  { field: 'progress', headerName: '진행률', cellDataType: 'number', valueFormatter: p => \`\${p.value}%\` },
  { field: 'useYn', headerName: '사용' },              // boolean → 체크박스 자동
  { field: 'updatedAt', headerName: '수정일', pinned: ${p.pinDate ? "'right'" : 'null'} },
];`,
  },
  {
    id: 'column-groups',
    category: CAT,
    name: '컬럼 그룹 · 접기',
    desc: '그룹 헤더(children), columnGroupShow 로 펼쳤을 때만 보이는 컬럼, marryChildren 으로 그룹 밖 이동 금지. 컬럼의 originalParent.colGroupDef 로 부모 그룹 정의에 접근할 수 있습니다.',
    keywords: ['children', 'columnGroupShow', 'openByDefault', 'marryChildren', 'originalParent', 'colGroupDef', 'setColumnGroupOpened', 'getColumnGroupState', 'onColumnGroupOpened', 'defaultColGroupDef'],
    controls: [{ key: 'openByDefault', type: 'boolean', default: false, desc: '처음부터 펼친 상태' }],
    render: (p, ctx) => <ColumnGroups p={p} ctx={ctx} />,
    code: p => `{
  headerName: '1단계',
  field: 'stage1',
  marryChildren: true,${p.openByDefault ? '\n  openByDefault: true,' : ''}
  children: [
    { headerName: '파기모델', colId: 'model', columnGroupShow: 'open', valueGetter },
    { headerName: '사용', colId: 'yn', valueGetter },
    { headerName: '추출방식', colId: 'extr', columnGroupShow: 'open', valueGetter },
  ],
}

// valueGetter 에서 부모 그룹 정의 참조
const valueGetter = ({ column, data }) => data[column.originalParent.colGroupDef.field][column.colId];`,
    usage: {
      file: 'page/work/workGroup/WorkGroupList.jsx',
      code: `{
  headerName: '1단계',
  field: 'stage1_info',
  marryChildren: true,
  children: [
    {
      headerName: '파기모델',
      field: 'stage_1_model',
      flex: 0.73,
      columnGroupShow: 'open',
      valueGetter: ({ column, data }) => makeStageData(column, data),
    },
    ...
// makeStageData: const parentColumn = column.originalParent.colGroupDef.field;`,
    },
  },
  {
    id: 'column-sizing',
    category: CAT,
    name: '컬럼 크기 · 자동 맞춤',
    desc: '드래그 리사이즈, 더블클릭 자동 맞춤, autoSizeColumns / sizeColumnsToFit, autoSizeStrategy(fitCellContents / fitGridWidth / fitProvidedWidth).',
    keywords: ['autoSizeStrategy', 'fitCellContents', 'fitGridWidth', 'fitProvidedWidth', 'autoSizeColumns', 'autoSizeAllColumns', 'sizeColumnsToFit', 'setColumnWidths', 'skipHeaderOnAutoSize', 'onColumnResized', 'resizable'],
    controls: [{ key: 'strategy', type: 'select', options: ['none', 'fitCellContents', 'fitGridWidth', 'fitProvidedWidth'], default: 'fitCellContents', desc: 'autoSizeStrategy.type' }],
    render: (p, ctx) => <Sizing p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  autoSizeStrategy={${p.strategy === 'none' ? 'undefined' : p.strategy === 'fitProvidedWidth' ? "{ type: 'fitProvidedWidth', width: 900 }" : `{ type: '${p.strategy}' }`}}
  onColumnResized={e => e.finished && console.log(e.column?.getActualWidth())}
  ...
/>

api.autoSizeAllColumns();          // 내용에 맞춤
api.autoSizeAllColumns(true);      // 헤더 제외
api.sizeColumnsToFit();            // 그리드 폭에 맞춤`,
    usage: {
      file: 'page/service/SeparateInfo/separateExecute/SeparateExecute.jsx',
      code: `<Table
  id="SeparateExecuteTable2"
  rowData={executeList}
  columnDefs={executeDefs}
  onRowDataUpdated={props => {
    setTimeout(() => {
      if (executeDefs.length < 9) {
        props.api.sizeColumnsToFit();
      } else {
        const allColumnIds = [];
        props.api.getColumns().forEach(column => {
          allColumnIds.push(column.getId());
        });
        props.api.autoSizeColumns(allColumnIds, false);
      }
    }, 100);
  }}
  autoSizeStrategy={{ type: 'fitCellContents' }}
/>`,
    },
  },
  {
    id: 'column-state',
    category: CAT,
    name: '컬럼 이동 · 숨김 · 상태 저장',
    desc: '헤더 드래그 이동, 그리드 밖으로 끌어 숨김, getColumnState / applyColumnState 로 폭·순서·고정·정렬·숨김을 저장/복원합니다.',
    keywords: ['getColumnState', 'applyColumnState', 'resetColumnState', 'moveColumns', 'setColumnsVisible', 'setColumnsPinned', 'onColumnMoved', 'onColumnVisible', 'suppressDragLeaveHidesColumns', 'suppressMovableColumns', 'maintainColumnOrder'],
    controls: [],
    render: (p, ctx) => <ColumnState ctx={ctx} />,
    code: () => `const saved = gridRef.current.api.getColumnState();      // 쿠키/스토리지 저장
gridRef.current.api.applyColumnState({ state: saved, applyOrder: true });
gridRef.current.api.setColumnsVisible(['dbms', 'status'], false);
gridRef.current.api.moveColumns(['updatedAt'], 1);
gridRef.current.api.resetColumnState();`,
    usage: {
      file: 'components/PageTemplate/Table.jsx',
      code: `// 숨김 컬럼을 쿠키에 저장해 다음 방문 때 복원
onColumnVisible={saveVisibleColumnsToCookie}`,
    },
  },
  {
    id: 'row-numbers',
    category: CAT,
    name: '행 번호 컬럼',
    desc: 'rowNumbers 로 행 번호 컬럼(ag-Grid-RowNumbersColumn)을 추가합니다. 셀 범위 선택 시 행 번호 클릭으로 행 전체 범위를 선택합니다.',
    keywords: ['rowNumbers', 'ag-Grid-RowNumbersColumn', 'selectionColumnDef'],
    controls: [
      { key: 'rowNumbers', type: 'boolean', default: true },
      { key: 'checkbox', type: 'boolean', default: true, desc: "rowSelection: { mode: 'multiRow' } (체크박스 컬럼)" },
    ],
    render: p => <RowNumbers p={p} />,
    code: p => `<AgGridReact
  rowNumbers={${p.rowNumbers}}
  cellSelection${p.checkbox ? "\n  rowSelection={{ mode: 'multiRow' }}" : ''}
  ...
/>`,
    usage: { file: 'page/work/workGroup/WorkGroupList.jsx', code: `<Table\n  id="WorkGroupListTable"\n  ref={gridRef}\n  rowNumbers\n  rowData={workList}\n  columnDefs={columnDefs}\n  ...` },
  },
  {
    id: 'col-span',
    category: CAT,
    name: '컬럼 병합 (colSpan)',
    desc: 'colDef.colSpan(params) 이 2 이상을 돌려주면 오른쪽 컬럼까지 한 셀로 합칩니다.',
    keywords: ['colSpan', '셀 병합', 'merge'],
    controls: [],
    render: () => <ColSpan />,
    code: () => `{
  field: 'section',
  colSpan: params => (params.data.section ? 4 : 1),   // 구간 행은 4칸 병합
  valueGetter: params => params.data.section ?? params.data.taskName,
}`,
  },
  {
    id: 'aligned-grids',
    category: CAT,
    name: '그리드 정렬 연동 (alignedGrids)',
    desc: '여러 그리드의 컬럼 폭/순서/숨김/고정/그룹 열림과 가로 스크롤을 서로 맞춥니다. 합계 그리드를 따로 둘 때 유용합니다.',
    keywords: ['alignedGrids', '합계 그리드', 'footer grid', 'headerHeight'],
    controls: [],
    render: (p, ctx) => <Aligned ctx={ctx} />,
    code: () => `const top = useRef(null);
const bottom = useRef(null);

<AgGridReact ref={top} alignedGrids={[bottom]} rowData={rows} columnDefs={columnDefs} />
<AgGridReact ref={bottom} alignedGrids={[top]} rowData={totals} columnDefs={columnDefs} headerHeight={0} />`,
  },
];
