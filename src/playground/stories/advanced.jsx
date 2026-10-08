// 추가 기능 스토리: 그리드 상태 / 일괄 편집 / 컬럼 툴패널·드롭 영역 / 그리드 간 행 드래그 / 컬럼 호버
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BASE_COLUMNS, SALES, SAMPLE } from '../data.js';
import { Grid } from './_shared.jsx';

const btn = { padding: '5px 12px', marginRight: 6, borderRadius: 6, border: '1px solid var(--pg-field-border)', background: 'var(--pg-field-bg)', color: 'inherit', cursor: 'pointer' };

// ── 그리드 상태 저장 · 복원 ──
function GridStateDemo({ ctx }) {
  const ref = useRef(null);
  const [saved, setSaved] = useState(null);
  const [remountKey, setRemountKey] = useState(0);
  const [useInitial, setUseInitial] = useState(false);
  const cols = useMemo(() => BASE_COLUMNS.map(c => ({ ...c, filter: true, enableRowGroup: true })), []);
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <button type="button" style={btn} onClick={() => setSaved(ref.current.api.getState())}>
          getState() 저장
        </button>
        <button type="button" style={btn} disabled={!saved} onClick={() => ref.current.api.setState(saved)}>
          setState() 복원
        </button>
        <button type="button" style={btn} onClick={() => ref.current.api.setState({})}>
          setState({'{}'}) 초기화
        </button>
        <button
          type="button"
          style={btn}
          disabled={!saved}
          onClick={() => {
            setUseInitial(true);
            setRemountKey(k => k + 1);
          }}
        >
          새 그리드 + initialState
        </button>
      </div>
      <Grid
        key={remountKey}
        gridRef={ref}
        height={300}
        rowData={SAMPLE}
        columnDefs={cols}
        rowSelection={{ mode: 'multiRow' }}
        rowGroupPanelShow="always"
        pagination
        paginationPageSize={20}
        initialState={useInitial ? saved : undefined}
        onStateUpdated={e => ctx.log(`stateUpdated: ${e.sources.join(', ')}`)}
      />
      <pre style={{ maxHeight: 160, overflow: 'auto', fontSize: 11, margin: '8px 0 0', padding: 8, background: 'var(--pg-code-bg, #1e1e1e)', color: '#ddd', borderRadius: 6 }}>
        {saved ? JSON.stringify(saved, null, 2) : '(정렬·필터·컬럼 이동/숨김·그룹·선택·페이지를 바꾼 뒤 getState() 저장)'}
      </pre>
    </div>
  );
}

// ── 일괄 편집 ──
function BatchEditDemo({ ctx }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  const rows = useMemo(() => SAMPLE.slice(0, 50).map(r => ({ ...r })), []);
  const cols = useMemo(
    () => [
      { field: 'id', width: 70 },
      { field: 'taskName', headerName: '작업명', editable: true, width: 160 },
      { field: 'dbms', editable: true, cellEditor: 'r2SelectCellEditor', cellEditorParams: { values: ['Oracle', 'MySQL', 'PostgreSQL', 'Tibero', 'MSSQL'] }, width: 130 },
      { field: 'rowCnt', headerName: '행 수', editable: true, width: 120 },
      { field: 'status', headerName: '상태', editable: true, cellEditor: 'r2RichSelectCellEditor', cellEditorParams: { values: ['대기', '진행', '완료', '오류'] }, width: 110 },
    ],
    [],
  );
  const api = () => ref.current.api;
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <button type="button" style={btn} disabled={on} onClick={() => api().startBatchEdit()}>
          startBatchEdit
        </button>
        <button type="button" style={btn} disabled={!on} onClick={() => api().commitBatchEdit()}>
          commitBatchEdit (저장)
        </button>
        <button type="button" style={btn} disabled={!on} onClick={() => api().cancelBatchEdit()}>
          cancelBatchEdit (취소)
        </button>
        <span style={{ fontSize: 12, opacity: 0.75 }}>{on ? '일괄 편집 중 — 바뀐 셀은 강조, 데이터엔 아직 반영 안 됨' : '시작 후 셀을 여러 개 고쳐 보세요'}</span>
      </div>
      <Grid
        gridRef={ref}
        height={320}
        rowData={rows}
        columnDefs={cols}
        onBatchEditingStarted={() => {
          setOn(true);
          ctx.log('batchEditingStarted');
        }}
        onBatchEditingStopped={e => {
          setOn(false);
          ctx.log(`batchEditingStopped — 반영 ${e.changes?.length ?? 0}건`);
        }}
        onCellValueChanged={e => ctx.log(`cellValueChanged ${e.colDef.field}: ${e.oldValue} → ${e.newValue}`)}
      />
    </div>
  );
}

// ── 컬럼 툴패널 · 피벗 모드 · 드롭 영역 ──
const TP_COLS = [
  { field: 'region', headerName: '지역', enableRowGroup: true, enablePivot: true },
  { field: 'product', headerName: '제품', enableRowGroup: true, enablePivot: true },
  { field: 'year', headerName: '연도', width: 90, enableRowGroup: true, enablePivot: true },
  { field: 'quarter', headerName: '분기', width: 90, enableRowGroup: true, enablePivot: true },
  { field: 'qty', headerName: '수량', width: 100, enableValue: true },
  { field: 'sales', headerName: '매출', width: 130, enableValue: true, aggFunc: 'sum', allowedAggFuncs: ['sum', 'avg', 'min', 'max', 'count'] },
];
function ColumnsToolPanelDemo({ p, ctx }) {
  return (
    <Grid
      key={`${p.groupPanel}${p.pivotPanel}`}
      height={420}
      rowData={SALES}
      columnDefs={TP_COLS}
      sideBar={{ toolPanels: ['columns'], defaultToolPanel: 'columns' }}
      rowGroupPanelShow={p.groupPanel}
      pivotPanelShow={p.pivotPanel}
      autoGroupColumnDef={{ minWidth: 180 }}
      onColumnRowGroupChanged={e => ctx.log(`행 그룹: ${e.api.getRowGroupColumns().map(c => c.getColId()).join(' > ') || '(없음)'}`)}
      onColumnValueChanged={e => ctx.log(`값: ${e.api.getValueColumns().map(c => `${c.getColDef().aggFunc}(${c.getColId()})`).join(', ') || '(없음)'}`)}
      onColumnPivotModeChanged={e => ctx.log(`피벗 모드: ${e.api.isPivotMode()}`)}
      onColumnPivotChanged={e => ctx.log(`열 레이블: ${e.api.getPivotColumns().map(c => c.getColId()).join(', ') || '(없음)'}`)}
    />
  );
}

// ── 그리드 간 행 드래그 ──
function RowDropZoneDemo({ ctx }) {
  const left = useRef(null);
  const right = useRef(null);
  const [l] = useState(() => SAMPLE.slice(0, 12).map(r => ({ ...r })));
  const [rEmpty] = useState(() => []);
  const cols = useMemo(() => [{ field: 'id', width: 70, rowDrag: true }, { field: 'taskName', headerName: '작업명', flex: 1 }, { field: 'dbms', width: 110 }], []);
  // 두 그리드가 다 마운트된 뒤 연결 (StrictMode 재마운트에도 안전하게 cleanup)
  useEffect(() => {
    const a = left.current?.api;
    const b = right.current?.api;
    if (!a || !b) return undefined;
    const zone = b.getRowDropZoneParams({
      onDragStop: e => {
        const exists = new Set();
        b.forEachNode(n => exists.add(n.data.id));
        const add = e.nodes.map(n => n.data).filter(d => !exists.has(d.id));
        if (add.length) {
          b.applyTransaction({ add, addIndex: e.overIndex >= 0 ? e.overIndex : undefined });
          a.applyTransaction({ remove: add });
        }
        ctx.log(`onDragStop: ${add.length}행 이동 (대상 overIndex ${e.overIndex})`);
      },
      onDragEnter: () => ctx.log('onDragEnter (오른쪽 그리드)'),
      onDragLeave: () => ctx.log('onDragLeave'),
    });
    a.addRowDropZone(zone);
    return () => a.removeRowDropZone(zone);
  }, []);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div>
        <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.75 }}>원본 (ID 칸의 핸들을 끌어 오른쪽으로)</div>
        <Grid gridRef={left} height={320} rowData={l} columnDefs={cols} getRowId={p => String(p.data.id)} rowDragManaged rowSelection={{ mode: 'multiRow', checkboxes: false, enableClickSelection: true }} rowDragMultiRow />
      </div>
      <div>
        <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.75 }}>대상</div>
        <Grid gridRef={right} height={320} rowData={rEmpty} columnDefs={cols} getRowId={p => String(p.data.id)} />
      </div>
    </div>
  );
}

export default [
  {
    id: 'grid-state',
    category: 'UI 구성',
    name: '그리드 상태 저장 · 복원',
    desc: 'api.getState() / api.setState(state, propertiesToIgnore) / initialState / onStateUpdated (AG v34 GridState 모양).\n컬럼 폭·순서·숨김·고정, 정렬, 필터, 행 그룹·집계·피벗, 그룹 펼침, 행 선택, 페이지, 스크롤, 포커스 셀, 셀 범위, 사이드바를 한 객체로 저장합니다. 쿠키/서버에 저장했다가 그대로 복원하면 됩니다.',
    keywords: ['getState', 'setState', 'initialState', 'onStateUpdated', 'stateUpdated', 'GridState', '상태 저장', 'columnState', '쿠키'],
    controls: [],
    wide: true,
    render: (p, ctx) => <GridStateDemo ctx={ctx} />,
    code: () => `// 저장
const state = gridRef.current.api.getState();
localStorage.setItem('myGrid', JSON.stringify(state));

// 복원 (그리드 생성 시)
<R2Grid initialState={JSON.parse(localStorage.getItem('myGrid') || 'null')} ... />

// 복원 (나중에) — 빠진 항목은 기본값, 두 번째 인자로 제외 가능
api.setState(state, ['filter']);

// 바뀔 때마다 저장
<R2Grid onStateUpdated={e => save(e.state)} ... />  // e.sources: ['sort', 'columnSizing', ...]`,
  },
  {
    id: 'batch-edit',
    category: '셀 · 편집',
    name: '일괄 편집 (Batch Edit)',
    desc: 'api.startBatchEdit() 후의 편집은 데이터에 바로 쓰지 않고 보류합니다(바뀐 셀 강조). commitBatchEdit() 때 한 번에 반영되며 cellValueChanged 가 그때 발생하고, cancelBatchEdit() 는 전부 버립니다. 저장 버튼이 있는 편집 화면에 맞습니다. (AG v34 BatchEditModule)',
    keywords: ['startBatchEdit', 'commitBatchEdit', 'cancelBatchEdit', 'isBatchEditing', 'getEditRowValues', 'batchEditingStarted', 'batchEditingStopped', '일괄', '저장'],
    controls: [],
    render: (p, ctx) => <BatchEditDemo ctx={ctx} />,
    code: () => `api.startBatchEdit();          // 편집 보류 시작
// ... 사용자가 여러 셀 수정 (화면엔 새 값, 데이터는 그대로)
api.getEditRowValues(rowNode); // { colId: 보류 값 }
api.commitBatchEdit();         // 한 번에 반영 → cellValueChanged
api.cancelBatchEdit();         // 전부 취소

<R2Grid
  onBatchEditingStarted={...}
  onBatchEditingStopped={e => console.log(e.changes)}
/>`,
  },
  {
    id: 'columns-tool-panel',
    category: '그룹 · 집계 · 피벗',
    name: '컬럼 툴패널 · 드롭 영역',
    desc: "AG 컬럼 툴패널: 피벗 모드 토글, 컬럼 목록, 행 그룹 / 값 / 열 레이블 영역. enableRowGroup·enableValue·enablePivot 컬럼을 목록이나 헤더에서 끌어다 놓고, 칩을 끌어 순서를 바꾸거나 밖에 놓아 뺍니다. 값 칩의 함수 이름을 누르면 집계 함수(allowedAggFuncs)를 고릅니다.\ntoolPanelParams: suppressPivotMode / suppressRowGroups / suppressValues / suppressPivots / suppressColumnFilter.",
    keywords: ['r2ColumnsToolPanel', 'sideBar', 'enableRowGroup', 'enableValue', 'enablePivot', 'allowedAggFuncs', 'defaultAggFunc', 'pivotPanelShow', 'rowGroupPanelShow', 'setColumnAggFunc', 'addValueColumns', 'moveRowGroupColumn', '피벗 모드', '드롭'],
    controls: [
      {
        key: 'groupPanel',
        type: 'select',
        default: 'always',
        label: 'rowGroupPanelShow',
        desc: '그리드 위 행 그룹 패널(가로 드롭 영역)을 언제 보일지. 헤더나 툴패널에서 enableRowGroup 컬럼을 끌어다 놓아 그룹을 만듭니다.',
        options: [
          { value: 'always', desc: '항상 표시' },
          { value: 'onlyWhenGrouping', desc: '행 그룹이 하나 이상 있을 때만' },
          { value: 'never', desc: '숨김 — 툴패널의 행 그룹 영역만 사용' },
        ],
      },
      {
        key: 'pivotPanel',
        type: 'select',
        default: 'always',
        label: 'pivotPanelShow',
        desc: '피벗 모드일 때 그리드 위에 열 레이블(피벗) 드롭 영역을 행 그룹 패널 옆에 보일지. 피벗 모드가 아니면 항상 숨김.',
        options: [
          { value: 'always', desc: '피벗 모드면 항상' },
          { value: 'onlyWhenPivoting', desc: '피벗 컬럼이 하나 이상 있을 때만' },
          { value: 'never', desc: '숨김' },
        ],
      },
    ],
    wide: true,
    render: (p, ctx) => <ColumnsToolPanelDemo p={p} ctx={ctx} />,
    code: p => `<R2Grid
  sideBar={{ toolPanels: ['columns'], defaultToolPanel: 'columns' }}
  rowGroupPanelShow="${p.groupPanel}"
  pivotPanelShow="${p.pivotPanel}"
  columnDefs={[
    { field: 'region', enableRowGroup: true, enablePivot: true },
    { field: 'year', enableRowGroup: true, enablePivot: true },
    { field: 'sales', enableValue: true, aggFunc: 'sum', allowedAggFuncs: ['sum', 'avg', 'max'] },
  ]}
/>

api.setColumnAggFunc('sales', 'avg');
api.addValueColumns(['qty']);
api.moveRowGroupColumn(0, 1);`,
  },
  {
    id: 'row-drop-zone',
    category: '행',
    name: '그리드 간 행 드래그',
    desc: '대상 그리드의 api.getRowDropZoneParams({ onDragStop … }) 를 원본 그리드의 api.addRowDropZone() 에 넘기면, 원본에서 끈 행을 대상에 놓을 때 콜백이 대상 그리드 기준 overIndex/overNode 와 함께 호출됩니다. 임의 DOM 요소도 { getContainer } 로 드롭 영역이 됩니다.',
    keywords: ['addRowDropZone', 'removeRowDropZone', 'getRowDropZoneParams', 'RowDropZoneParams', 'onDragStop', 'rowDrag', 'rowDragMultiRow', '드래그', '그리드 간'],
    controls: [],
    wide: true,
    render: (p, ctx) => <RowDropZoneDemo ctx={ctx} />,
    code: () => `const zone = targetApi.getRowDropZoneParams({
  onDragStop: e => {
    targetApi.applyTransaction({ add: e.nodes.map(n => n.data), addIndex: e.overIndex });
    sourceApi.applyTransaction({ remove: e.nodes.map(n => n.data) });
  },
});
sourceApi.addRowDropZone(zone);

// 임의 요소
sourceApi.addRowDropZone({
  getContainer: () => trashRef.current,
  onDragStop: e => sourceApi.applyTransaction({ remove: e.nodes.map(n => n.data) }),
});`,
  },
  {
    id: 'column-hover',
    category: '컬럼',
    name: '컬럼 호버 강조',
    desc: 'columnHoverHighlight: 마우스가 올라간 컬럼 전체(셀 + 헤더)를 강조합니다. api.isColumnHovered(col) 로 확인. 색은 --r2-column-hover-color.',
    keywords: ['columnHoverHighlight', 'isColumnHovered', 'r2-column-hover', '호버'],
    controls: [{
        key: 'on',
        type: 'boolean',
        default: true,
        label: 'columnHoverHighlight',
        desc: '마우스가 올라간 컬럼 전체(셀 + 헤더)에 r2-column-hover 클래스를 붙여 강조합니다. 색은 --r2-column-hover-color (기본 = 행 호버색).',
        on: '세로 줄 강조',
        off: '행 호버 강조만',
      }],
    render: p => <Grid key={String(p.on)} rowData={SAMPLE} columnDefs={BASE_COLUMNS} columnHoverHighlight={p.on} />,
    code: p => `<R2Grid columnHoverHighlight={${p.on}} ... />`,
  },
];
