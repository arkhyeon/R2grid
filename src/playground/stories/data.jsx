import React, { useMemo, useRef, useState } from 'react';
import { BASE_COLUMNS, makeRows } from '../data.js';
import { Grid, IMPORT_LINE } from './_shared.jsx';

const CAT = '데이터 · 성능';

function BigData({ p, ctx }) {
  const [info, setInfo] = useState('');
  const rowData = useMemo(() => {
    const t = performance.now();
    const rows = makeRows(p.rows);
    setTimeout(() => setInfo(`생성 ${Math.round(performance.now() - t)}ms`), 0);
    return rows;
  }, [p.rows]);
  const ref = useRef(null);
  const time = (label, fn) => {
    const t = performance.now();
    fn();
    const ms = Math.round(performance.now() - t);
    ctx.log(`${label}: ${ms}ms`);
  };
  return (
    <>
      <div className="pg-toolbar">
        <span className="pg-note">{p.rows.toLocaleString()}행 · {info} · DOM 행은 화면 높이만큼만 생성</span>
        <button onClick={() => time('행 수 정렬', () => ref.current.api.applyColumnState({ state: [{ colId: 'rowCnt', sort: 'desc' }], defaultState: { sort: null } }))}>행 수 정렬</button>
        <button onClick={() => time('2컬럼 정렬', () => ref.current.api.applyColumnState({ state: [{ colId: 'dbms', sort: 'asc', sortIndex: 0 }, { colId: 'rowCnt', sort: 'desc', sortIndex: 1 }], defaultState: { sort: null } }))}>DBMS+행 수 정렬</button>
        <button onClick={() => time('텍스트 필터', () => ref.current.api.setFilterModel({ owner: { filterType: 'text', type: 'contains', filter: 'USER_1' } }))}>소유자 필터</button>
        <button onClick={() => time('전체 선택', () => ref.current.api.selectAll())}>전체 선택</button>
        <button onClick={() => time('초기화', () => { ref.current.api.setFilterModel(null); ref.current.api.deselectAll(); ref.current.api.applyColumnState({ defaultState: { sort: null } }); })}>초기화</button>
        <button onClick={() => ctx.log(`DOM 행 수: ${document.querySelectorAll('.pg-stage .r2-center-cols-container .r2-row').length}`)}>DOM 행 수</button>
      </div>
      <Grid gridRef={ref} height={420} rowData={rowData} columnDefs={BASE_COLUMNS} rowSelection={{ mode: 'multiRow' }} rowBuffer={p.rowBuffer} />
    </>
  );
}

function Transactions({ ctx }) {
  const ref = useRef(null);
  const [rowData] = useState(() => makeRows(20));
  const next = useRef(1000);
  const api = () => ref.current.api;
  const run = tx => {
    const r = api().applyTransaction(tx);
    ctx.log(`applyTransaction → add ${r.add.length}, update ${r.update.length}, remove ${r.remove.length}`);
  };
  return (
    <>
      <div className="pg-toolbar">
        <button onClick={() => run({ add: makeRows(1, next.current++), addIndex: 0 })}>맨 앞에 추가</button>
        <button
          onClick={() => {
            const nodes = api().getSelectedNodes();
            run({ update: nodes.map(n => ({ ...n.data, rowCnt: Math.round(Math.random() * 1e6), status: '완료' })) });
          }}
        >
          선택 행 수정
        </button>
        <button onClick={() => run({ remove: api().getSelectedRows() })}>선택 행 삭제</button>
        <span className="pg-note">getRowId 로 행 id 를 지정하면 update/remove 가 id 로 매칭됩니다</span>
      </div>
      <Grid
        gridRef={ref}
        rowData={rowData}
        columnDefs={BASE_COLUMNS.map(c => (c.field === 'rowCnt' || c.field === 'status' ? { ...c, enableCellChangeFlash: true } : c))}
        getRowId={p => String(p.data.id)}
        rowSelection={{ mode: 'multiRow' }}
        onRowDataUpdated={() => ctx.log('rowDataUpdated')}
      />
    </>
  );
}

function Flash({ p, ctx }) {
  const ref = useRef(null);
  const [rowData] = useState(() => makeRows(30));
  const tick = () => {
    const api = ref.current.api;
    const n = api.getDisplayedRowAtIndex(Math.floor(Math.random() * 10));
    n.setDataValue('rowCnt', Math.round(Math.random() * 5e6));
    ctx.log(`setDataValue row ${n.data.id}`);
  };
  return (
    <>
      <div className="pg-toolbar">
        <button onClick={tick}>임의 행 값 변경</button>
        <button
          onClick={() => {
            const api = ref.current.api;
            api.flashCells({ rowNodes: [api.getDisplayedRowAtIndex(0), api.getDisplayedRowAtIndex(1)], columns: ['taskName', 'owner'] });
          }}
        >
          flashCells (0~1행)
        </button>
      </div>
      <Grid
        gridRef={ref}
        rowData={rowData}
        columnDefs={BASE_COLUMNS}
        defaultColDef={{ enableCellChangeFlash: p.flash }}
        cellFlashDuration={p.duration}
        cellFadeDuration={p.fade}
      />
    </>
  );
}

export default [
  {
    id: 'big-data',
    category: CAT,
    name: '대용량 · 가상화',
    desc: '행/컬럼 가상화로 화면에 보이는 셀만 그립니다. 50만 행에서도 DOM 행 수가 일정하고, 정렬은 타입별 키 정렬(숫자 Float64Array, 문자열 순위)로 처리합니다.',
    keywords: ['virtualization', '가상화', 'rowBuffer', 'suppressColumnVirtualisation', '100000', '500000', 'performance', '성능'],
    controls: [
      { key: 'rows', type: 'select', options: [10000, 100000, 500000], default: 100000 },
      { key: 'rowBuffer', type: 'number', default: 10, desc: '화면 밖에 미리 그려둘 행 수' },
    ],
    render: (p, ctx) => <BigData p={p} ctx={ctx} />,
    code: p => `${IMPORT_LINE}

const rowData = useMemo(() => makeRows(${p.rows}), []);

<div style={{ height: 420 }}>   {/* 부모에 높이가 있어야 가상화됨 */}
  <AgGridReact rowData={rowData} columnDefs={columnDefs} rowBuffer={${p.rowBuffer}} />
</div>`,
  },
  {
    id: 'transactions',
    category: CAT,
    name: '트랜잭션 (add/update/remove)',
    desc: 'applyTransaction 으로 전체 rowData 교체 없이 부분 갱신합니다. getRowId 로 안정적인 행 id 를 지정하세요.',
    keywords: ['applyTransaction', 'applyTransactionAsync', 'getRowId', 'add', 'update', 'remove', 'addIndex', 'onRowDataUpdated', 'getSelectedRows'],
    controls: [],
    render: (p, ctx) => <Transactions ctx={ctx} />,
    code: () => `<AgGridReact
  ref={gridRef}
  rowData={rowData}
  columnDefs={columnDefs}
  getRowId={p => String(p.data.id)}
/>

gridRef.current.api.applyTransaction({ add: [newRow], addIndex: 0 });
gridRef.current.api.applyTransaction({ update: changedRows });
gridRef.current.api.applyTransaction({ remove: gridRef.current.api.getSelectedRows() });`,
    usage: {
      file: 'page/approval/ApprovalInfo/ApprovalRequest.jsx',
      code: `.post('delete/aprvRequest', { mis_id: data.mis_id, input_id })
.then(() => {
  CLM.alert(\`요청된 결재가 삭제되었습니다.\`);
  api.applyTransaction({ remove: [data] });
})`,
    },
  },
  {
    id: 'cell-flash',
    category: CAT,
    name: '셀 변경 깜빡임',
    desc: 'enableCellChangeFlash 가 켜진 컬럼은 값이 바뀌면 배경이 깜빡입니다. api.flashCells 로 직접 깜빡이게 할 수도 있습니다.',
    keywords: ['enableCellChangeFlash', 'flashCells', 'cellFlashDuration', 'cellFadeDuration', 'setDataValue', 'r2-cell-data-changed'],
    controls: [
      { key: 'flash', type: 'boolean', default: true, desc: 'defaultColDef.enableCellChangeFlash' },
      { key: 'duration', type: 'number', default: 500, desc: 'cellFlashDuration (ms)' },
      { key: 'fade', type: 'number', default: 1000, desc: 'cellFadeDuration (ms)' },
    ],
    render: (p, ctx) => <Flash p={p} ctx={ctx} />,
    code: p => `<AgGridReact
  defaultColDef={{ enableCellChangeFlash: ${p.flash} }}
  cellFlashDuration={${p.duration}}
  cellFadeDuration={${p.fade}}
  ...
/>

api.getDisplayedRowAtIndex(0).setDataValue('rowCnt', 123);
api.flashCells({ rowNodes: [node], columns: ['taskName'] });`,
    usage: {
      file: 'page/project/project/ProjectCurrent.jsx',
      code: `const defaultColDef = useMemo(
  () => ({
    enableCellChangeFlash: true,
  }),
  [],
);`,
    },
  },
];
