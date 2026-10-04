import React, { useMemo, useRef, useState } from 'react';
import { BASE_COLUMNS, makeRows, SAMPLE } from '../data.js';
import { Grid } from './_shared.jsx';

const CAT = '셀 · 편집';

function StatusBadge({ value }) {
  const color = { 대기: '#9e9e9e', 진행: '#1e88e5', 완료: '#43a047', 오류: '#e53935' }[value] || '#999';
  return <span style={{ padding: '1px 8px', borderRadius: 10, background: color, color: '#fff', fontSize: 11 }}>{value}</span>;
}
function ProgressBar({ value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: '100%' }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'color-mix(in srgb, transparent, currentColor 12%)' }}>
        <div style={{ width: `${value}%`, height: '100%', borderRadius: 4, background: 'var(--r2-accent-color)' }} />
      </div>
      <span style={{ width: 32, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

function CellRendering({ p }) {
  const defs = useMemo(
    () => [
      { field: 'taskName', headerName: '작업명', width: 150 },
      { headerName: '작업명(대문자)', valueGetter: x => x.data.taskName.toUpperCase(), width: 150 },
      { field: 'status', headerName: '상태', width: 90, cellRenderer: p.renderers ? 'statusBadge' : undefined },
      { field: 'progress', headerName: '진행률', width: 150, cellRenderer: p.renderers ? ProgressBar : undefined },
      {
        field: 'rowCnt',
        headerName: '행 수',
        width: 130,
        type: 'numericColumn',
        valueFormatter: x => x.value.toLocaleString(),
        cellClassRules: p.rules ? { 'pg-cell-danger': x => x.value > 4_000_000, 'pg-cell-warn': x => x.value > 2_500_000 && x.value <= 4_000_000 } : undefined,
      },
      { field: 'useYn', headerName: '사용', width: 80, cellStyle: p.rules ? x => (x.value ? null : { opacity: 0.4 }) : undefined },
    ],
    [p.renderers, p.rules],
  );
  return (
    <>
      <style>{`.pg-cell-danger{color:#e53935;font-weight:700}.pg-cell-warn{color:#fb8c00}`}</style>
      <Grid rowData={SAMPLE} columnDefs={defs} components={{ statusBadge: StatusBadge }} />
    </>
  );
}

function Tooltips({ p }) {
  const defs = [
    { field: 'taskName', headerName: '작업명', width: 150, tooltipField: 'owner', headerTooltip: '소유자를 툴팁으로 (tooltipField)' },
    { field: 'rowCnt', headerName: '행 수', width: 130, tooltipValueGetter: x => `정확한 값: ${x.value.toLocaleString()} 행`, headerTooltip: 'tooltipValueGetter' },
    ...BASE_COLUMNS.slice(2, 5),
  ];
  return <Grid key={String(p.browser)} rowData={SAMPLE} columnDefs={defs} enableBrowserTooltips={p.browser} tooltipShowDelay={p.delay} />;
}

function Editing({ p, ctx }) {
  const [rows] = useState(() => makeRows(40).map(r => ({ ...r, memo: `메모 ${r.id}`, due: r.updatedAt })));
  const defs = useMemo(
    () => [
      { field: 'taskName', headerName: '텍스트 (agTextCellEditor)', width: 170 },
      { field: 'rowCnt', headerName: '숫자 (agNumberCellEditor)', width: 160, cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 0, precision: 0 } },
      { field: 'dbms', headerName: '선택 (agSelectCellEditor)', width: 160, cellEditor: 'agSelectCellEditor', cellEditorParams: { values: ['Oracle', 'MySQL', 'PostgreSQL', 'Tibero', 'MSSQL'] } },
      { field: 'status', headerName: '리치 선택 (팝업)', width: 140, cellEditor: 'agRichSelectCellEditor', cellEditorPopup: true, cellEditorParams: { values: ['대기', '진행', '완료', '오류'] } },
      { field: 'memo', headerName: '긴 텍스트 (팝업)', width: 160, cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true, cellEditorParams: { maxLength: 200, rows: 5 } },
      { field: 'useYn', headerName: '체크', width: 80 },
      { field: 'due', headerName: '날짜 (agDateStringCellEditor)', width: 180, cellEditor: 'agDateStringCellEditor' },
    ],
    [],
  );
  return (
    <Grid
      key={String(p.singleClickEdit)}
      rowData={rows}
      columnDefs={defs}
      defaultColDef={{ editable: true }}
      singleClickEdit={p.singleClickEdit}
      stopEditingWhenCellsLoseFocus={p.loseFocus}
      enterNavigatesVertically={p.enterVertical}
      enterNavigatesVerticallyAfterEdit={p.enterVertical}
      onCellValueChanged={e => ctx.log(`cellValueChanged ${e.colDef.field}: ${JSON.stringify(e.oldValue)} → ${JSON.stringify(e.newValue)}`)}
      onCellEditingStarted={e => ctx.log(`cellEditingStarted ${e.colDef.field}`)}
    />
  );
}

function FullRowEdit({ ctx }) {
  const ref = useRef(null);
  const [rows] = useState(() => makeRows(15));
  return (
    <>
      <div className="pg-toolbar">
        <button onClick={() => ref.current.api.undoCellEditing()}>undo (Ctrl+Z)</button>
        <button onClick={() => ref.current.api.redoCellEditing()}>redo (Ctrl+Y)</button>
        <span className="pg-note">행을 더블클릭 → 행 전체 편집 · Tab 으로 셀 이동 · Enter 로 확정</span>
      </div>
      <Grid
        gridRef={ref}
        rowData={rows}
        columnDefs={BASE_COLUMNS.map(c => ({ ...c, editable: c.field !== 'id' }))}
        editType="fullRow"
        undoRedoCellEditing
        undoRedoCellEditingLimit={20}
        rowNumbers
        onRowValueChanged={e => ctx.log(`rowValueChanged: ${JSON.stringify({ id: e.data.id, taskName: e.data.taskName, rowCnt: e.data.rowCnt })}`)}
        onUndoStarted={() => ctx.log('undoStarted')}
        onRedoStarted={() => ctx.log('redoStarted')}
      />
    </>
  );
}

function RangeClipboard({ p, ctx }) {
  const [rows] = useState(() => makeRows(60));
  return (
    <>
      <div className="pg-toolbar">
        <span className="pg-note">드래그로 범위 선택 → Ctrl+C / Ctrl+X / Ctrl+V, Shift+클릭으로 확장, Ctrl+드래그로 다중 범위, Delete 로 지우기</span>
      </div>
      <Grid
        key={`${p.multi}${p.headers}`}
        rowData={rows}
        columnDefs={BASE_COLUMNS}
        defaultColDef={{ editable: true }}
        cellSelection={p.multi ? true : { suppressMultiRanges: true }}
        copyHeadersToClipboard={p.headers}
        rowNumbers
        onCellSelectionChanged={e => e.finished && ctx.log(`cellSelectionChanged: ${e.api.getCellRanges().map(r => `${r.startRow.rowIndex}~${r.endRow.rowIndex} × ${r.columns.length}열`).join(' | ')}`)}
        onPasteEnd={() => ctx.log('pasteEnd')}
      />
    </>
  );
}

function FillHandle({ p, ctx }) {
  const [rows] = useState(() => makeRows(40).map((r, i) => ({ ...r, seq: i < 2 ? (i + 1) * 10 : null })));
  return (
    <>
      <div className="pg-toolbar">
        <span className="pg-note">범위 선택 후 오른쪽 아래 작은 사각형을 끌어 채우기 · 숫자 2개 이상은 등차 연장, Alt 누르면 복사/증가 전환 · 안쪽으로 끌면 비우기</span>
      </div>
      <Grid
        key={`${p.mode}${p.direction}`}
        rowData={rows}
        columnDefs={[{ field: 'seq', headerName: '순번(10,20…)', width: 130 }, ...BASE_COLUMNS]}
        defaultColDef={{ editable: true }}
        cellSelection={{ handle: { mode: p.mode, direction: p.direction } }}
        undoRedoCellEditing
        onFillEnd={e => ctx.log(`fillEnd: ${e.initialRange.startRow.rowIndex}~${e.initialRange.endRow.rowIndex} → ${e.finalRange.startRow.rowIndex}~${e.finalRange.endRow.rowIndex}`)}
      />
    </>
  );
}

function Find({ p, ctx }) {
  const ref = useRef(null);
  const [info, setInfo] = useState('');
  return (
    <>
      <div className="pg-toolbar">
        <button onClick={() => ref.current.api.findPrevious()}>◀ 이전</button>
        <button onClick={() => ref.current.api.findNext()}>다음 ▶</button>
        <button onClick={() => ref.current.api.findClearActive()}>활성 해제</button>
        <span className="pg-note">{info}</span>
      </div>
      <Grid
        gridRef={ref}
        rowData={SAMPLE}
        columnDefs={BASE_COLUMNS}
        findSearchValue={p.search}
        findOptions={{ caseSensitive: p.caseSensitive }}
        onFindChanged={e => {
          const a = e.activeMatch;
          setInfo(`${e.totalMatches}개 일치${a ? ` · 현재 ${a.node.rowIndex + 1}행 ${a.column.getColId()}` : ''}`);
          ctx.log(`findChanged: total=${e.totalMatches}`);
        }}
      />
    </>
  );
}

function Sparklines({ p }) {
  const defs = useMemo(
    () => [
      { field: 'taskName', headerName: '작업명', width: 140 },
      { field: 'history', headerName: `월별 추이 (${p.type})`, width: 220, cellRenderer: 'agSparklineCellRenderer', cellRendererParams: { sparklineOptions: { type: p.type, direction: p.direction, marker: { enabled: p.marker, size: 4 } } } },
      { field: 'history', colId: 'bar', headerName: '막대', width: 160, cellRenderer: 'agSparklineCellRenderer', cellRendererParams: { sparklineOptions: { type: 'bar', direction: 'vertical', fill: '#ffa03a' } } },
      ...BASE_COLUMNS.slice(2, 5),
    ],
    [p.type, p.direction, p.marker],
  );
  return <Grid rowData={SAMPLE} columnDefs={defs} rowHeight={40} />;
}

export default [
  {
    id: 'cell-rendering',
    category: CAT,
    name: '셀 렌더링 · 스타일',
    desc: 'valueGetter / valueFormatter / cellRenderer(함수·컴포넌트·components 등록명) / cellClassRules / cellStyle.',
    keywords: ['cellRenderer', 'cellRendererParams', 'cellRendererSelector', 'components', 'valueGetter', 'valueFormatter', 'cellClass', 'cellClassRules', 'cellStyle', 'refreshCells', 'redrawRows'],
    controls: [
      { key: 'renderers', type: 'boolean', default: true, desc: '상태 배지 / 진행 막대 렌더러' },
      { key: 'rules', type: 'boolean', default: true, desc: 'cellClassRules / cellStyle' },
    ],
    render: p => <CellRendering p={p} />,
    code: () => `const columnDefs = [
  { headerName: '작업명(대문자)', valueGetter: p => p.data.taskName.toUpperCase() },
  { field: 'status', cellRenderer: 'statusBadge' },          // components 등록명
  { field: 'progress', cellRenderer: ProgressBar },          // 컴포넌트 직접
  { field: 'rowCnt', valueFormatter: p => p.value.toLocaleString(),
    cellClassRules: { 'cell-danger': p => p.value > 4_000_000 } },
  { field: 'useYn', cellStyle: p => (p.value ? null : { opacity: 0.4 }) },
];

<AgGridReact columnDefs={columnDefs} components={{ statusBadge: StatusBadge }} />`,
    usage: {
      file: 'page/work/workGroup/modal/WorkGroupPrioritySetting.jsx',
      code: `components={{
  rowAddOn: props =>
    RowAddOn(props, () => {
      setSettingTpJoinList(prevState =>
        prevState.filter(ps => ps.col_name !== props.data.col_name),
      );
    }),
}}`,
    },
  },
  {
    id: 'tooltips',
    category: CAT,
    name: '툴팁',
    desc: 'tooltipField / tooltipValueGetter / headerTooltip. enableBrowserTooltips 면 브라우저 기본 title 툴팁을 씁니다.',
    keywords: ['tooltipField', 'tooltipValueGetter', 'headerTooltip', 'enableBrowserTooltips', 'tooltipShowDelay', 'tooltipComponent'],
    controls: [
      { key: 'browser', type: 'boolean', default: false, desc: 'enableBrowserTooltips' },
      { key: 'delay', type: 'number', default: 400, desc: 'tooltipShowDelay (ms)' },
    ],
    render: p => <Tooltips p={p} />,
    code: p => `<AgGridReact
  enableBrowserTooltips={${p.browser}}
  tooltipShowDelay={${p.delay}}
  columnDefs={[
    { field: 'taskName', tooltipField: 'owner', headerTooltip: '소유자 표시' },
    { field: 'rowCnt', tooltipValueGetter: p => \`정확한 값: \${p.value}\` },
  ]}
/>`,
  },
  {
    id: 'editing',
    category: CAT,
    name: '셀 편집 · 내장 에디터',
    desc: '더블클릭/Enter/F2/타이핑으로 편집, Esc 취소. 내장 에디터: text, number, select, richSelect(팝업), largeText(팝업), checkbox, date/dateString.',
    keywords: ['editable', 'cellEditor', 'cellEditorParams', 'cellEditorPopup', 'agTextCellEditor', 'agNumberCellEditor', 'agSelectCellEditor', 'agRichSelectCellEditor', 'agLargeTextCellEditor', 'agCheckboxCellEditor', 'agDateCellEditor', 'agDateStringCellEditor', 'singleClickEdit', 'stopEditingWhenCellsLoseFocus', 'enterNavigatesVertically', 'onCellValueChanged', 'valueSetter', 'valueParser', 'startEditingCell', 'stopEditing', 'readOnlyEdit'],
    controls: [
      { key: 'singleClickEdit', type: 'boolean', default: false },
      { key: 'loseFocus', type: 'boolean', default: true, desc: 'stopEditingWhenCellsLoseFocus' },
      { key: 'enterVertical', type: 'boolean', default: false, desc: 'enterNavigatesVertically(+AfterEdit)' },
    ],
    render: (p, ctx) => <Editing p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  defaultColDef={{ editable: true }}${p.singleClickEdit ? '\n  singleClickEdit' : ''}
  stopEditingWhenCellsLoseFocus={${p.loseFocus}}${p.enterVertical ? '\n  enterNavigatesVertically\n  enterNavigatesVerticallyAfterEdit' : ''}
  columnDefs={[
    { field: 'rowCnt', cellEditor: 'agNumberCellEditor', cellEditorParams: { min: 0 } },
    { field: 'dbms', cellEditor: 'agSelectCellEditor', cellEditorParams: { values: DBMS } },
    { field: 'status', cellEditor: 'agRichSelectCellEditor', cellEditorPopup: true, cellEditorParams: { values } },
    { field: 'memo', cellEditor: 'agLargeTextCellEditor', cellEditorPopup: true },
  ]}
  onCellValueChanged={e => save(e.data)}
/>`,
  },
  {
    id: 'full-row-edit',
    category: CAT,
    name: '행 전체 편집 · Undo/Redo',
    desc: 'editType="fullRow" 는 행의 편집 가능한 셀을 한꺼번에 편집하고 확정 시 rowValueChanged 를 보냅니다. undoRedoCellEditing 으로 Ctrl+Z / Ctrl+Y 되돌리기 (행 편집·붙여넣기·채우기는 한 단위).',
    keywords: ['editType', 'fullRow', 'onRowValueChanged', 'onRowEditingStarted', 'onRowEditingStopped', 'undoRedoCellEditing', 'undoRedoCellEditingLimit', 'undoCellEditing', 'redoCellEditing', 'onUndoStarted', 'onRedoStarted'],
    controls: [],
    render: (p, ctx) => <FullRowEdit ctx={ctx} />,
    code: () => `<AgGridReact
  editType="fullRow"
  undoRedoCellEditing
  undoRedoCellEditingLimit={20}
  onRowValueChanged={e => save(e.data)}
/>

api.undoCellEditing();
api.redoCellEditing();`,
    usage: {
      file: 'page/work/projectDestruction/DestructionManagementControl.jsx',
      code: `<Table
  id="DestructionManagementControlTable"
  rowData={projectList}
  columnDefs={columnDefs}
  rowNumbers
  onRowValueChanged={handleUpdateProject}
  undoRedoCellEditing
  editType="fullRow"
  ref={layoutGridRef}
  height="580px"
/>`,
    },
  },
  {
    id: 'range-clipboard',
    category: CAT,
    name: '범위 선택 · 클립보드',
    desc: '셀 범위 드래그 선택(가장자리 자동 스크롤), 다중 범위, Ctrl+C/X/V (엑셀과 TSV 호환), 헤더 포함 복사, Delete 로 지우기.',
    keywords: ['cellSelection', 'enableRangeSelection', 'suppressMultiRanges', 'copyHeadersToClipboard', 'copyToClipboard', 'cutToClipboard', 'pasteFromClipboard', 'getCellRanges', 'addCellRange', 'clearCellSelection', 'processCellForClipboard', 'processDataFromClipboard', 'sendToClipboard', 'onCellSelectionChanged', 'onPasteEnd'],
    controls: [
      { key: 'multi', type: 'boolean', default: true, desc: '다중 범위 (false = suppressMultiRanges)' },
      { key: 'headers', type: 'boolean', default: true, desc: 'copyHeadersToClipboard' },
    ],
    render: (p, ctx) => <RangeClipboard p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  cellSelection${p.multi ? '' : '={{ suppressMultiRanges: true }}'}
  copyHeadersToClipboard={${p.headers}}
  defaultColDef={{ editable: true }}
  processCellForClipboard={p => p.value}   // 복사 값 가공 (선택)
/>

api.getCellRanges();
api.copyToClipboard({ includeHeaders: true });`,
    usage: {
      file: 'components/PageTemplate/Table.jsx',
      code: `// 셀 선택(드래그 복사) / 헤더 복사를 전역 기본값으로
// 개별 화면에서 gridOptions로 넘긴 값이 항상 우선, 필요 시 cellSelection: false 로 끄기 가능.
const mergedGridOptions = useMemo(
  () => ({
    cellSelection: true,
    copyHeadersToClipboard: true, // 헤더까지 클립보드에 복사
    ...gridOptions,
  }),
  [gridOptions],
);`,
    },
  },
  {
    id: 'fill-handle',
    category: CAT,
    name: '채우기 핸들 (드래그 채우기)',
    desc: '엑셀처럼 범위 오른쪽 아래 핸들을 끌어 값을 채웁니다. 숫자 2개 이상은 등차 연장, 1개/문자는 복사, Alt 로 전환, 축소하면 비움. setFillValue 로 채울 값을 직접 정할 수 있습니다.',
    keywords: ['cellSelection.handle', 'fill', 'enableFillHandle', 'enableRangeHandle', 'fillHandleDirection', 'setFillValue', 'fillOperation', 'suppressClearOnFillReduction', 'onFillStart', 'onFillEnd', '드래그 복사'],
    controls: [
      { key: 'mode', type: 'select', options: ['fill', 'range'], default: 'fill', desc: "fill = 값 채우기, range = 범위만 조절" },
      { key: 'direction', type: 'select', options: ['xy', 'x', 'y'], default: 'xy' },
    ],
    render: (p, ctx) => <FillHandle p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  cellSelection={{
    handle: {
      mode: '${p.mode}',
      direction: '${p.direction}',
      // setFillValue: params => params.values[0] + params.currentIndex,
    },
  }}
  onFillEnd={e => console.log(e.finalRange)}
/>`,
  },
  {
    id: 'find',
    category: CAT,
    name: '찾기 (Find)',
    desc: 'findSearchValue 로 표시 텍스트를 검색해 강조하고, findNext / findPrevious 로 일치 항목 사이를 이동합니다.',
    keywords: ['findSearchValue', 'findOptions', 'caseSensitive', 'findNext', 'findPrevious', 'findGoTo', 'findClearActive', 'findGetTotalMatches', 'findGetActiveMatch', 'onFindChanged', 'r2-find-match'],
    controls: [
      { key: 'search', type: 'text', default: 'USER_1', desc: '찾을 텍스트' },
      { key: 'caseSensitive', type: 'boolean', default: false },
    ],
    render: (p, ctx) => <Find p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  findSearchValue="${p.search}"
  findOptions={{ caseSensitive: ${p.caseSensitive} }}
  onFindChanged={e => setInfo(\`\${e.totalMatches}개\`)}
/>

api.findNext();
api.findPrevious();`,
  },
  {
    id: 'sparklines',
    category: CAT,
    name: '스파크라인',
    desc: 'cellRenderer: "agSparklineCellRenderer" 로 배열 값을 셀 안의 작은 차트(line/area/bar)로 그립니다.',
    keywords: ['agSparklineCellRenderer', 'sparklineOptions', 'line', 'area', 'bar', 'marker', 'itemStyler'],
    controls: [
      { key: 'type', type: 'select', options: ['line', 'area', 'bar'], default: 'area' },
      { key: 'direction', type: 'select', options: ['vertical', 'horizontal'], default: 'vertical', desc: 'bar 방향' },
      { key: 'marker', type: 'boolean', default: false },
    ],
    render: p => <Sparklines p={p} />,
    code: p => `{
  field: 'history',            // [12, 40, 33, ...]
  cellRenderer: 'agSparklineCellRenderer',
  cellRendererParams: {
    sparklineOptions: { type: '${p.type}', direction: '${p.direction}', marker: { enabled: ${p.marker} } },
  },
}`,
  },
];
