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
      { field: 'taskName', headerName: '텍스트 (r2TextCellEditor)', width: 170 },
      { field: 'rowCnt', headerName: '숫자 (r2NumberCellEditor)', width: 160, cellEditor: 'r2NumberCellEditor', cellEditorParams: { min: 0, precision: 0 } },
      { field: 'dbms', headerName: '선택 (r2SelectCellEditor)', width: 160, cellEditor: 'r2SelectCellEditor', cellEditorParams: { values: ['Oracle', 'MySQL', 'PostgreSQL', 'Tibero', 'MSSQL'] } },
      { field: 'status', headerName: '리치 선택 (팝업)', width: 140, cellEditor: 'r2RichSelectCellEditor', cellEditorPopup: true, cellEditorParams: { values: ['대기', '진행', '완료', '오류'] } },
      { field: 'memo', headerName: '긴 텍스트 (팝업)', width: 160, cellEditor: 'r2LargeTextCellEditor', cellEditorPopup: true, cellEditorParams: { maxLength: 200, rows: 5 } },
      { field: 'useYn', headerName: '체크', width: 80 },
      { field: 'due', headerName: '날짜 (r2DateStringCellEditor)', width: 180, cellEditor: 'r2DateStringCellEditor' },
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
      { field: 'history', headerName: `월별 추이 (${p.type})`, width: 220, cellRenderer: 'r2SparklineCellRenderer', cellRendererParams: { sparklineOptions: { type: p.type, direction: p.direction, marker: { enabled: p.marker, size: 4 } } } },
      { field: 'history', colId: 'bar', headerName: '막대', width: 160, cellRenderer: 'r2SparklineCellRenderer', cellRendererParams: { sparklineOptions: { type: 'bar', direction: 'vertical', fill: '#ffa03a' } } },
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
      {
        key: 'renderers',
        type: 'boolean',
        default: true,
        label: 'cellRenderer',
        desc: "셀을 React 컴포넌트로 그립니다. 컴포넌트를 직접 주거나(진행률: ProgressBar), components 에 등록한 이름 문자열(상태: 'statusBadge')로 지정합니다. 렌더러는 표시만 바꾸고 정렬·필터·복사는 원래 값으로 합니다.",
        on: '상태 = 색 배지, 진행률 = 막대',
        off: '값 텍스트 그대로',
      },
      {
        key: 'rules',
        type: 'boolean',
        default: true,
        label: 'cellClassRules / cellStyle',
        desc: 'cellClassRules: { 클래스명: 조건함수 } — 조건이 참인 셀에 CSS 클래스. cellStyle: 스타일 객체나 함수. 값이 바뀌면 다시 평가됩니다.',
        on: '행 수 400만↑ 빨강·250만↑ 주황 (클래스), 미사용 행 흐리게 (스타일)',
        off: '조건부 스타일 없음',
      },
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

<R2Grid columnDefs={columnDefs} components={{ statusBadge: StatusBadge }} />`,
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
      {
        key: 'browser',
        type: 'boolean',
        default: false,
        label: 'enableBrowserTooltips',
        desc: '툴팁을 그리드 자체 팝업 대신 브라우저 기본 title 속성으로 띄울지. 브라우저 툴팁은 꾸밀 수 없고 지연 시간도 브라우저가 정합니다.',
        on: '브라우저 기본 툴팁 (tooltipShowDelay 무시)',
        off: '그리드 툴팁 — 테마 색, 지연 시간 조절 가능',
      },
      { key: 'delay', type: 'number', default: 400, label: 'tooltipShowDelay', desc: '마우스를 올린 뒤 툴팁이 뜨기까지 시간(ms). 그리드 툴팁에만 적용. tooltipHideDelay 로 자동 숨김 시간도 지정 가능.' },
    ],
    render: p => <Tooltips p={p} />,
    code: p => `<R2Grid
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
    keywords: ['editable', 'cellEditor', 'cellEditorParams', 'cellEditorPopup', 'r2TextCellEditor', 'r2NumberCellEditor', 'r2SelectCellEditor', 'r2RichSelectCellEditor', 'r2LargeTextCellEditor', 'r2CheckboxCellEditor', 'r2DateCellEditor', 'r2DateStringCellEditor', 'singleClickEdit', 'stopEditingWhenCellsLoseFocus', 'enterNavigatesVertically', 'onCellValueChanged', 'valueSetter', 'valueParser', 'startEditingCell', 'stopEditing', 'readOnlyEdit'],
    controls: [
      {
        key: 'singleClickEdit',
        type: 'boolean',
        default: false,
        label: 'singleClickEdit',
        desc: '편집 시작 동작. 기본은 더블클릭·Enter·F2·바로 타이핑으로 시작합니다.',
        on: '셀 한 번 클릭으로 바로 편집',
        off: '더블클릭(또는 Enter/F2/타이핑)으로 편집',
      },
      {
        key: 'loseFocus',
        type: 'boolean',
        default: true,
        label: 'stopEditingWhenCellsLoseFocus',
        desc: '편집 중 그리드 밖(다른 입력창·버튼 등)을 클릭했을 때 편집을 끝낼지. 끝낼 때 입력값은 저장됩니다.',
        on: '바깥 클릭 = 값 저장하고 편집 종료',
        off: '바깥 클릭해도 편집 상태 유지 (Enter/Esc 로 종료)',
      },
      {
        key: 'enterVertical',
        type: 'boolean',
        default: false,
        label: 'enterNavigatesVertically(+AfterEdit)',
        desc: 'Enter 키 동작을 엑셀처럼 바꿉니다. 앞의 것은 편집 중이 아닐 때, AfterEdit 는 편집을 Enter 로 마친 직후에 아래 셀로 이동할지.',
        on: 'Enter = 아래 셀로 이동 (편집 확정 후에도)',
        off: 'Enter = 편집 시작/확정, 포커스는 그 셀에 머묾',
      },
    ],
    render: (p, ctx) => <Editing p={p} ctx={ctx} />,
    code: p => `<R2Grid
  defaultColDef={{ editable: true }}${p.singleClickEdit ? '\n  singleClickEdit' : ''}
  stopEditingWhenCellsLoseFocus={${p.loseFocus}}${p.enterVertical ? '\n  enterNavigatesVertically\n  enterNavigatesVerticallyAfterEdit' : ''}
  columnDefs={[
    { field: 'rowCnt', cellEditor: 'r2NumberCellEditor', cellEditorParams: { min: 0 } },
    { field: 'dbms', cellEditor: 'r2SelectCellEditor', cellEditorParams: { values: DBMS } },
    { field: 'status', cellEditor: 'r2RichSelectCellEditor', cellEditorPopup: true, cellEditorParams: { values } },
    { field: 'memo', cellEditor: 'r2LargeTextCellEditor', cellEditorPopup: true },
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
    code: () => `<R2Grid
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
      {
        key: 'multi',
        type: 'boolean',
        default: true,
        label: 'cellSelection.suppressMultiRanges',
        desc: 'Ctrl+드래그로 범위를 여러 개 동시에 잡을 수 있게 할지 (이 컨트롤을 끄면 suppressMultiRanges: true).',
        on: 'Ctrl+드래그로 범위 추가 — 복사 시 범위들을 차례로',
        off: '항상 범위 하나 — 새로 드래그하면 이전 범위 해제',
      },
      {
        key: 'headers',
        type: 'boolean',
        default: true,
        label: 'copyHeadersToClipboard',
        desc: 'Ctrl+C 로 복사할 때 첫 줄에 컬럼 헤더 이름을 넣을지. 붙여넣기(Ctrl+V)는 헤더 없이 값만 기대합니다.',
        on: '복사 결과 첫 줄 = 헤더 이름',
        off: '값만 복사',
      },
    ],
    render: (p, ctx) => <RangeClipboard p={p} ctx={ctx} />,
    code: p => `<R2Grid
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
      {
        key: 'mode',
        type: 'select',
        default: 'fill',
        label: 'cellSelection.handle.mode',
        desc: '범위 오른쪽 아래 핸들을 끌 때 하는 일.',
        options: [
          { value: 'fill', desc: '채우기 핸들 — 끈 만큼 값을 복사(숫자 2개 이상이면 등차 연장, Alt 로 전환), 안쪽으로 끌면 비우기' },
          { value: 'range', desc: '범위 핸들 — 값은 그대로, 선택 범위 크기만 늘리고 줄임' },
        ],
      },
      {
        key: 'direction',
        type: 'select',
        default: 'xy',
        label: 'cellSelection.handle.direction',
        desc: '핸들을 끌 수 있는 방향 (fill 모드에서만 의미).',
        options: [
          { value: 'xy', desc: '가로·세로 둘 다 (끈 방향 중 큰 쪽으로)' },
          { value: 'x', desc: '가로(오른쪽/왼쪽)로만' },
          { value: 'y', desc: '세로(아래/위)로만' },
        ],
      },
    ],
    render: (p, ctx) => <FillHandle p={p} ctx={ctx} />,
    code: p => `<R2Grid
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
      { key: 'search', type: 'text', default: 'USER_1', label: 'findSearchValue', desc: '찾을 텍스트. 화면에 보이는 값(포맷 적용 후) 기준으로 모든 셀에서 찾아 강조합니다. 비우면 찾기 해제. 이전/다음 버튼 = api.findPrevious/findNext.' },
      {
        key: 'caseSensitive',
        type: 'boolean',
        default: false,
        label: 'findOptions.caseSensitive',
        desc: '대소문자를 구분해 찾을지.',
        on: "'user_1' 은 'USER_1' 과 다름",
        off: '대소문자 무시',
      },
    ],
    render: (p, ctx) => <Find p={p} ctx={ctx} />,
    code: p => `<R2Grid
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
    desc: 'cellRenderer: "r2SparklineCellRenderer" 로 배열 값을 셀 안의 작은 차트(line/area/bar)로 그립니다.',
    keywords: ['r2SparklineCellRenderer', 'sparklineOptions', 'line', 'area', 'bar', 'marker', 'itemStyler'],
    controls: [
      {
        key: 'type',
        type: 'select',
        default: 'area',
        label: "sparklineOptions.type",
        desc: "r2SparklineCellRenderer 의 차트 종류. 셀 값은 숫자 배열이어야 합니다.",
        options: [
          { value: 'line', desc: '꺾은선 — 추세' },
          { value: 'area', desc: '면 — 추세 + 크기감' },
          { value: 'bar', desc: '막대 — 개별 값 비교 (방향 옵션 적용)' },
        ],
      },
      {
        key: 'direction',
        type: 'select',
        default: 'vertical',
        label: 'sparklineOptions.direction',
        desc: "막대(bar)의 방향. line/area 에는 영향 없음.",
        options: [
          { value: 'vertical', desc: '세로 막대 (값이 위로)' },
          { value: 'horizontal', desc: '가로 막대 (값이 오른쪽으로)' },
        ],
      },
      {
        key: 'marker',
        type: 'boolean',
        default: false,
        label: 'sparklineOptions.marker.enabled',
        desc: 'line/area 의 각 데이터 점에 동그라미를 찍을지.',
        on: '점 표시',
        off: '선만',
      },
    ],
    render: p => <Sparklines p={p} />,
    code: p => `{
  field: 'history',            // [12, 40, 33, ...]
  cellRenderer: 'r2SparklineCellRenderer',
  cellRendererParams: {
    sparklineOptions: { type: '${p.type}', direction: '${p.direction}', marker: { enabled: ${p.marker} } },
  },
}`,
  },
];
