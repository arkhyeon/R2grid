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
      {
        key: 'rows',
        type: 'select',
        default: 100000,
        label: '행 개수',
        desc: '생성할 데모 행 수. 위 버튼으로 정렬·필터·전체 선택 시간을 재면 이벤트 로그에 ms 로 찍힙니다.',
        options: [
          { value: 10000, desc: '1만 — 일반 대량 목록' },
          { value: 100000, desc: '10만 — 정렬 수십 ms 수준' },
          { value: 500000, desc: '50만 — 데이터 생성에 1~2초, 정렬은 수백 ms' },
        ],
      },
      {
        key: 'rowBuffer',
        type: 'number',
        default: 10,
        label: 'rowBuffer',
        desc: '보이는 영역 위·아래에 미리 그려 둘 행 수. 크게 하면 빠른 스크롤 때 빈 행이 덜 보이지만 DOM 이 늘어 렌더가 무거워집니다. 0 이면 보이는 행만.',
      },
    ],
    render: (p, ctx) => <BigData p={p} ctx={ctx} />,
    code: p => `${IMPORT_LINE}

const rowData = useMemo(() => makeRows(${p.rows}), []);

<div style={{ height: 420 }}>   {/* 부모에 높이가 있어야 가상화됨 */}
  <R2Grid rowData={rowData} columnDefs={columnDefs} rowBuffer={${p.rowBuffer}} />
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
    code: () => `<R2Grid
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
      {
        key: 'flash',
        type: 'boolean',
        default: true,
        label: 'enableCellChangeFlash',
        desc: '컬럼 속성(여기선 defaultColDef 로 전체). 셀 값이 setDataValue·트랜잭션·편집으로 바뀌면 그 셀 배경을 잠깐 강조합니다. api.flashCells 는 이 값과 상관없이 동작합니다.',
        on: "'임의 행 값 변경' 시 바뀐 셀이 깜빡임",
        off: '값은 바뀌지만 강조 없음',
      },
      { key: 'duration', type: 'number', default: 500, label: 'cellFlashDuration', desc: '강조색이 유지되는 시간(ms). 이 시간이 지나면 사라지기 시작합니다.' },
      { key: 'fade', type: 'number', default: 1000, label: 'cellFadeDuration', desc: '강조색이 사라지는 데 걸리는 시간(ms). 0 이면 바로 꺼집니다.' },
    ],
    render: (p, ctx) => <Flash p={p} ctx={ctx} />,
    code: p => `<R2Grid
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
