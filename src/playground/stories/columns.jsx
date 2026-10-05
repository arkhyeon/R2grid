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
  return <Grid key={`${p.width}`} rowData={SAMPLE} columnDefs={BASE_COLUMNS} rowNumbers={p.rowNumbers ? { width: p.width } : false} cellSelection={p.cellSelection} />;
}

function SelectionColumn({ p, ctx }) {
  return (
    <Grid
      key={`${p.checkboxes}${p.headerCheckbox}${p.pinned}${p.width}`}
      rowData={SAMPLE}
      columnDefs={BASE_COLUMNS}
      rowSelection={{ mode: 'multiRow', checkboxes: p.checkboxes, headerCheckbox: p.headerCheckbox }}
      selectionColumnDef={{ pinned: p.pinned === 'none' ? null : p.pinned, width: p.width, maxWidth: p.width, minWidth: p.width }}
      onSelectionChanged={e => ctx.log(`선택 ${e.api.getSelectedRows().length}행`)}
    />
  );
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
      {
        key: 'pinId',
        type: 'boolean',
        default: true,
        label: "ID pinned: 'left'",
        desc: "colDef.pinned 는 컬럼을 왼쪽('left') 또는 오른쪽('right') 고정 영역에 둡니다. 고정 컬럼은 가로 스크롤해도 제자리에 남습니다. ID 컬럼엔 lockPosition: 'left' 도 있어 항상 맨 앞입니다.",
        on: 'ID 가 왼쪽 고정 영역 — 가로 스크롤해도 보임',
        off: '일반 컬럼 — 가로 스크롤하면 같이 밀려남',
      },
      {
        key: 'pinDate',
        type: 'boolean',
        default: false,
        label: "수정일 pinned: 'right'",
        desc: '수정일 컬럼을 오른쪽 고정 영역에 둡니다. 헤더 메뉴(≡) › 열 고정 으로 사용자가 직접 바꿀 수도 있습니다 (onColumnPinned 로그 확인).',
        on: '수정일이 맨 오른쪽에 고정',
        off: '원래 순서 위치',
      },
      {
        key: 'hideDbms',
        type: 'boolean',
        default: false,
        label: 'DBMS hide',
        desc: 'colDef.hide 는 처음 표시 여부입니다. 숨긴 컬럼도 데이터·필터·정렬 상태는 그대로이고, 헤더 메뉴 › 열 선택 에서 다시 켤 수 있습니다.',
        on: 'DBMS 컬럼 숨김',
        off: 'DBMS 컬럼 표시',
      },
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
    controls: [
      {
        key: 'openByDefault',
        type: 'boolean',
        default: false,
        label: 'openByDefault',
        desc: "그룹(colGroupDef) 속성. 처음 그릴 때 그룹을 펼친 상태로 둘지 정합니다. 펼치면 columnGroupShow: 'open' 컬럼(파기모델·추출방식)이 보이고, 접으면 'closed' 또는 미지정 컬럼만 보입니다. 헤더의 ▸ 로 언제든 토글.",
        on: '1·2단계 그룹이 펼쳐진 채 시작 (컬럼 4개씩)',
        off: '접힌 채 시작 (사용·파기구분 2개씩)',
      },
    ],
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
    controls: [
      {
        key: 'strategy',
        type: 'select',
        default: 'fitCellContents',
        label: 'autoSizeStrategy',
        desc: '그리드가 컬럼 폭을 자동으로 정하는 방식. colDef 의 width 보다 우선합니다. 사용자가 직접 리사이즈하면 그 폭이 유지됩니다.',
        options: [
          { value: 'none', desc: '자동 조정 없음 — colDef 의 width/flex 그대로' },
          { value: 'fitCellContents', desc: '첫 데이터 렌더 때 1회, 각 컬럼을 헤더·셀 내용 길이에 맞춤 (보이는 행 기준)' },
          { value: 'fitGridWidth', desc: '컬럼 폭 합계를 그리드 폭에 맞춤 (비율 유지). 그리드 크기가 바뀔 때마다 다시 맞춤' },
          { value: 'fitProvidedWidth', desc: '컬럼 폭 합계를 지정한 width(여기선 900px)에 맞춤' },
        ],
      },
    ],
    render: (p, ctx) => <Sizing p={p} ctx={ctx} />,
    code: p => `<R2Grid
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
      code: `const saveVisibleColumnsToCookie = (event, id) => {
  if (!id) return;
  const allColumns = event.api.getColumns();
  ...
  setCookie(id, headerNames);
};
...
onColumnVisible={saveVisibleColumnsToCookie}`,
    },
  },
  {
    id: 'row-numbers',
    category: CAT,
    name: '행 번호 컬럼',
    desc: 'rowNumbers 로 맨 앞에 행 번호 컬럼(colId r2-Grid-RowNumbersColumn)을 추가합니다. 정렬·필터 후의 표시 순서대로 1부터 매기고, 셀 범위 선택(cellSelection)이 켜져 있으면 번호를 눌러 그 행 전체를 범위로 잡습니다.',
    keywords: ['rowNumbers', 'r2-Grid-RowNumbersColumn', '행 번호'],
    controls: [
      {
        key: 'rowNumbers',
        type: 'boolean',
        default: true,
        label: 'rowNumbers',
        desc: 'true 또는 옵션 객체 { width, headerName, valueFormatter, cellClass … } 로 행 번호 컬럼을 켭니다. 옵션은 그 컬럼의 colDef 처럼 적용됩니다.',
        on: '맨 앞 행 번호 컬럼 표시',
        off: '행 번호 없음',
      },
      { key: 'width', type: 'number', default: 60, label: 'rowNumbers.width', desc: '행 번호 컬럼 폭(px). 행 수가 많아 자릿수가 늘면 키우세요.' },
      {
        key: 'cellSelection',
        type: 'boolean',
        default: true,
        label: 'cellSelection',
        desc: '셀 범위 선택 기능. 켜져 있을 때만 행 번호 클릭/드래그가 행 단위 범위 선택이 됩니다 (Ctrl+C 로 그 행들 복사 가능).',
        on: '번호 클릭 → 그 행 전체 범위 선택',
        off: '번호는 표시만',
      },
    ],
    render: p => <RowNumbers p={p} />,
    code: p => `<R2Grid
  rowNumbers={${p.rowNumbers ? `{ width: ${p.width} }` : 'false'}}${p.cellSelection ? '\n  cellSelection' : ''}
  ...
/>`,
    usage: { file: 'page/work/workGroup/WorkGroupList.jsx', code: `<Table\n  id="WorkGroupListTable"\n  ref={gridRef}\n  rowNumbers\n  rowData={workList}\n  columnDefs={columnDefs}\n  ...` },
  },
  {
    id: 'selection-column',
    category: CAT,
    name: '체크박스 컬럼',
    desc: "rowSelection 의 checkboxes 가 켜지면 맨 앞에 선택 체크박스 컬럼(colId r2-Grid-SelectionColumn)이 생깁니다. 이 컬럼의 폭·고정·헤더 등은 selectionColumnDef 로 바꿉니다. 그룹 컬럼 안에 넣으려면 checkboxLocation: 'autoGroupColumn'.",
    keywords: ['selectionColumnDef', 'r2-Grid-SelectionColumn', 'checkboxes', 'headerCheckbox', 'checkboxLocation', '체크박스'],
    controls: [
      {
        key: 'checkboxes',
        type: 'boolean',
        default: true,
        label: 'rowSelection.checkboxes',
        desc: '각 행에 선택 체크박스를 둘지. 함수로 행마다 정할 수도 있습니다 (예: 잠긴 행 제외).',
        on: '체크박스 컬럼 표시',
        off: '체크박스 컬럼 없음 — 행 클릭(enableClickSelection)이나 api 로만 선택',
      },
      {
        key: 'headerCheckbox',
        type: 'boolean',
        default: true,
        label: 'rowSelection.headerCheckbox',
        desc: '헤더의 전체 선택 체크박스. 누르면 전체 행(또는 selectAll 옵션에 따라 필터된 행/현재 페이지)을 선택합니다. 일부만 선택되면 − 표시.',
        on: '헤더에 전체 선택 체크박스',
        off: '헤더 비움',
      },
      {
        key: 'pinned',
        type: 'select',
        default: 'left',
        label: 'selectionColumnDef.pinned',
        desc: '체크박스 컬럼 고정 위치. 이동은 항상 잠겨 있습니다(lockPosition).',
        options: [
          { value: 'left', desc: '왼쪽 고정 — 가로 스크롤해도 체크박스가 보임' },
          { value: 'none', desc: '고정 안 함 — 가로 스크롤하면 밀려남' },
          { value: 'right', desc: '오른쪽 고정' },
        ],
      },
      { key: 'width', type: 'number', default: 48, label: 'selectionColumnDef.width', desc: '체크박스 컬럼 폭(px). 기본 48 고정폭(min=max).' },
    ],
    render: (p, ctx) => <SelectionColumn p={p} ctx={ctx} />,
    code: p => `<R2Grid
  rowSelection={{ mode: 'multiRow', checkboxes: ${p.checkboxes}, headerCheckbox: ${p.headerCheckbox} }}
  selectionColumnDef={{ pinned: ${p.pinned === 'none' ? 'null' : `'${p.pinned}'`}, width: ${p.width}, maxWidth: ${p.width}, minWidth: ${p.width} }}
  ...
/>`,
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

<R2Grid ref={top} alignedGrids={[bottom]} rowData={rows} columnDefs={columnDefs} />
<R2Grid ref={bottom} alignedGrids={[top]} rowData={totals} columnDefs={columnDefs} headerHeight={0} />`,
  },
];
