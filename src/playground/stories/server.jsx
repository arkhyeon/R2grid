import React, { useMemo, useRef, useState } from 'react';
import { BASE_COLUMNS, makeRows, SALES } from '../data.js';
import { Grid } from './_shared.jsx';

const CAT = '서버 데이터 · 페이지';

const SERVER_ROWS = makeRows(2350);
// 가짜 서버: 정렬/필터 후 구간 반환 (지연 300ms)
function fakeServer({ startRow, endRow, sortModel = [], filterModel = {} }, all = SERVER_ROWS) {
  let rows = all;
  const f = filterModel.owner;
  if (f?.filter) rows = rows.filter(r => r.owner.includes(f.filter));
  if (sortModel.length) {
    const { colId, sort } = sortModel[0];
    rows = [...rows].sort((a, b) => (a[colId] > b[colId] ? 1 : a[colId] < b[colId] ? -1 : 0) * (sort === 'asc' ? 1 : -1));
  }
  return new Promise(res => setTimeout(() => res({ rows: rows.slice(startRow, endRow), total: rows.length }), 300));
}

function Pagination({ p, ctx }) {
  return (
    <Grid
      key={`${p.auto}${p.size}${p.grouped}${p.childRows}`}
      height={400}
      rowData={p.grouped ? SALES : makeRows(500)}
      columnDefs={
        p.grouped
          ? [
              { field: 'region', rowGroup: true, hide: true },
              { field: 'product', width: 100 },
              { field: 'year', width: 80 },
              { field: 'quarter', width: 80 },
              { field: 'sales', aggFunc: 'sum', width: 120 },
            ]
          : BASE_COLUMNS
      }
      pagination
      paginationPageSize={p.size}
      paginationAutoPageSize={p.auto}
      paginationPageSizeSelector={[10, 20, 50, 100]}
      paginateChildRows={p.childRows}
      groupDefaultExpanded={1}
      onPaginationChanged={e => e.newPage && ctx.log(`paginationChanged: ${e.api.paginationGetCurrentPage() + 1} / ${e.api.paginationGetTotalPages()}`)}
    />
  );
}

const btn = { padding: '5px 12px', marginRight: 6, borderRadius: 6, border: '1px solid var(--pg-field-border)', background: 'var(--pg-field-bg)', color: 'inherit', cursor: 'pointer' };

function Ssrm({ p, ctx }) {
  const ref = useRef(null);
  // 데모용 서버 데이터 (이 화면 안에서만 바뀜)
  const db = useRef(null);
  if (!db.current) db.current = SERVER_ROWS.map(r => ({ ...r }));
  const seq = useRef(100000);
  const [, setTick] = useState(0);
  const datasource = useMemo(
    () => ({
      getRows: params => {
        const { startRow, endRow, sortModel, filterModel } = params.request;
        ctx.log(`getRows ${startRow}~${endRow} sort=${JSON.stringify(sortModel)}`);
        fakeServer({ startRow, endRow, sortModel, filterModel }, db.current).then(({ rows, total }) => params.success({ rowData: rows, rowCount: total }));
      },
    }),
    [],
  );
  const api = () => ref.current?.api;
  // 서버에 먼저 반영했다고 치고, 그리드에는 트랜잭션으로 같은 변경을 알림
  const apply = (tx, label) => {
    const done = res => ctx.log(`${label}: ${res?.status} (add ${res?.add?.length ?? 0} / update ${res?.update?.length ?? 0} / remove ${res?.remove?.length ?? 0})`);
    if (p.async) api().applyServerSideTransactionAsync(tx, done);
    else done(api().applyServerSideTransaction(tx));
    setTick(t => t + 1);
  };
  const add = () => {
    const row = { ...db.current[0], id: ++seq.current, taskName: `새 작업_${seq.current}`, rowCnt: 0, status: '대기' };
    db.current = [row, ...db.current];
    apply({ add: [row], addIndex: 0 }, '맨 위에 추가');
  };
  const update = () => {
    const sel = api().getSelectedRows();
    if (!sel.length) return ctx.log('선택한 행이 없습니다 (불러온 행 중)');
    const changed = sel.map(r => ({ ...r, status: '완료', rowCnt: r.rowCnt + 1 }));
    const byId = new Map(changed.map(r => [r.id, r]));
    db.current = db.current.map(r => byId.get(r.id) || r);
    apply({ update: changed }, '선택 행 완료 처리');
  };
  const remove = () => {
    const sel = api().getSelectedRows();
    if (!sel.length) return ctx.log('선택한 행이 없습니다 (불러온 행 중)');
    const ids = new Set(sel.map(r => r.id));
    db.current = db.current.filter(r => !ids.has(r.id));
    apply({ remove: sel }, '선택 행 삭제');
  };
  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button type="button" style={btn} onClick={add}>맨 위에 추가</button>
        <button type="button" style={btn} onClick={update}>선택 행 완료 처리</button>
        <button type="button" style={btn} onClick={remove}>선택 행 삭제</button>
        <button type="button" style={btn} onClick={() => ctx.log(`getServerSideSelectionState: ${JSON.stringify(api().getServerSideSelectionState())}`)}>
          선택 상태 보기
        </button>
      </div>
      <Grid
        gridRef={ref}
        height={400}
        rowModelType="serverSide"
        serverSideDatasource={datasource}
        cacheBlockSize={100}
        getRowId={x => String(x.data.id)}
        rowSelection={p.selection ? { mode: 'multiRow' } : undefined}
        columnDefs={BASE_COLUMNS.map(c => (c.field === 'owner' ? { ...c, filter: 'r2TextColumnFilter' } : c))}
        onSelectionChanged={e => ctx.log(`selectionChanged(${e.source}) → ${JSON.stringify(e.api.getServerSideSelectionState())}`)}
      />
    </div>
  );
}

function Infinite({ p, ctx }) {
  const ref = useRef(null);
  const datasource = useMemo(
    () => ({
      getRows: params => {
        ctx.log(`getRows ${params.startRow}~${params.endRow}`);
        fakeServer(params).then(({ rows, total }) => params.successCallback(rows, params.endRow >= total ? total : -1));
      },
    }),
    [],
  );
  return (
    <>
      <div className="pg-toolbar">
        <button onClick={() => ref.current.api.purgeInfiniteCache()}>purgeInfiniteCache</button>
        <button onClick={() => ctx.log(`getInfiniteRowCount=${ref.current.api.getInfiniteRowCount()} lastKnown=${ref.current.api.isLastRowIndexKnown()}`)}>행 수 확인</button>
        <span className="pg-note">스크롤하면 다음 블록을 요청하고, 마지막 블록에서 전체 행 수가 확정됩니다</span>
      </div>
      <Grid
        key={p.maxBlocks}
        gridRef={ref}
        height={380}
        rowModelType="infinite"
        datasource={datasource}
        cacheBlockSize={100}
        maxBlocksInCache={p.maxBlocks || undefined}
        columnDefs={BASE_COLUMNS}
      />
    </>
  );
}

export default [
  {
    id: 'pagination',
    category: CAT,
    name: '페이지네이션',
    desc: 'pagination + paginationPageSize / paginationAutoPageSize / paginationPageSizeSelector. 행 그룹은 최상위 행 단위로 페이지를 나누고 펼친 자식은 같은 페이지에 둡니다 (paginateChildRows 로 변경).',
    keywords: ['pagination', 'paginationPageSize', 'paginationAutoPageSize', 'paginationPageSizeSelector', 'paginateChildRows', 'suppressPaginationPanel', 'paginationGoToPage', 'paginationGetTotalPages', 'paginationGetRowCount', 'onPaginationChanged'],
    controls: [
      {
        key: 'size',
        type: 'select',
        default: 20,
        label: 'paginationPageSize',
        desc: '한 페이지 행 수. 하단 페이지 크기 선택(paginationPageSizeSelector)으로 사용자가 바꿀 수도 있습니다.',
        options: [
          { value: 10, desc: '10행' },
          { value: 20, desc: '20행' },
          { value: 50, desc: '50행' },
          { value: 100, desc: '100행' },
        ],
      },
      {
        key: 'auto',
        type: 'boolean',
        default: false,
        label: 'paginationAutoPageSize',
        desc: '그리드 높이에 들어가는 만큼을 한 페이지로 자동 계산합니다. paginationPageSize 보다 우선하고, 그리드 크기가 바뀌면 다시 계산됩니다.',
        on: '스크롤 없이 화면에 꽉 차는 행 수',
        off: 'paginationPageSize 사용',
      },
      {
        key: 'grouped',
        type: 'boolean',
        default: false,
        label: '행 그룹 데이터',
        desc: '데모 데이터를 지역으로 행 그룹. 그룹이 있을 때 페이지를 어떻게 나눌지는 아래 paginateChildRows 가 정합니다.',
        on: '지역 그룹 + 페이지네이션',
        off: '평평한 목록',
      },
      {
        key: 'childRows',
        type: 'boolean',
        default: false,
        label: 'paginateChildRows',
        desc: '그룹(또는 마스터/디테일)이 있을 때 페이지 크기를 무엇으로 셀지.',
        on: '펼친 하위 행까지 모두 세서 나눔 — 한 그룹이 여러 페이지에 걸칠 수 있음',
        off: '최상위 그룹 단위로 나눔 — 그룹은 쪼개지지 않고, 펼치면 그 페이지가 길어짐',
      },
    ],
    render: (p, ctx) => <Pagination p={p} ctx={ctx} />,
    code: p => `<R2Grid
  pagination
  paginationPageSize={${p.size}}${p.auto ? '\n  paginationAutoPageSize' : ''}
  paginationPageSizeSelector={[10, 20, 50, 100]}${p.childRows ? '\n  paginateChildRows' : ''}
  onPaginationChanged={e => console.log(e.api.paginationGetCurrentPage())}
/>`,
    usage: {
      file: 'components/PageTemplate/Table.jsx',
      code: `const onPaginationChanged = params => {
  if (ref.current) {
    if (params.newData) {
      ref.current?.api.paginationGoToPage(0);
    }
    if (params.newData || params.newPage || params.keepRenderedRows) {
      setCurPage(ref.current?.api.paginationGetCurrentPage());
      setTotalPage(ref.current?.api.paginationGetTotalPages());
    }
  }
};`,
    },
  },
  {
    id: 'server-side',
    category: CAT,
    name: '서버 사이드 행 모델 (SSRM)',
    desc: "rowModelType: 'serverSide' — 보이는 구간의 블록(cacheBlockSize)만 getRows 로 요청합니다. 정렬/필터가 바뀌면 캐시를 비우고 request.sortModel / filterModel 로 다시 요청합니다. 서버 데이터를 바꾼 뒤 applyServerSideTransaction 으로 알리면 다시 요청하지 않고 불러온 행에 바로 반영합니다. 선택은 행 id 기준이라 아직 안 불러온 행까지 '전체 선택' 할 수 있습니다.",
    keywords: ['rowModelType', 'serverSide', 'serverSideDatasource', 'getRows', 'success', 'fail', 'cacheBlockSize', 'maxBlocksInCache', 'serverSideInitialRowCount', 'refreshServerSide', 'retryServerSideLoads', 'setGridOption', 'request.sortModel', 'request.filterModel', 'applyServerSideTransaction', 'applyServerSideTransactionAsync', 'flushServerSideAsyncTransactions', 'applyServerSideRowData', 'getServerSideSelectionState', 'setServerSideSelectionState', 'asyncTransactionWaitMillis'],
    controls: [
      {
        key: 'selection',
        type: 'boolean',
        default: true,
        label: "rowSelection: { mode: 'multiRow' }",
        desc: "SSRM 에서 선택은 { selectAll, toggledNodes } 상태로 관리됩니다. 헤더 체크박스로 전체 선택하면 selectAll=true 가 되어 아직 안 불러온 행도 로드되는 즉시 선택된 상태로 나오고, 그 뒤 해제한 행만 toggledNodes 에 남습니다. getState().rowSelection 에도 이 모양으로 저장됩니다.",
        on: "체크박스·헤더 체크박스 표시 — '선택 상태 보기' 로 상태 확인",
        off: '선택 없음 (완료 처리·삭제 버튼은 선택 행이 필요)',
      },
      {
        key: 'async',
        type: 'boolean',
        default: false,
        label: 'Async 트랜잭션',
        desc: 'applyServerSideTransaction 은 블록을 불러오는 중이면 적용하지 않고 StoreLoading 을 돌려줍니다. applyServerSideTransactionAsync 는 asyncTransactionWaitMillis(기본 50ms) 동안 모았다가, 로딩 중이면 로드가 끝난 뒤 한 번에 적용하고 콜백으로 결과를 줍니다.',
        on: 'applyServerSideTransactionAsync(tx, callback) — 로딩 중에도 나중에 적용',
        off: 'applyServerSideTransaction(tx) — 즉시 적용, 결과 status 바로 반환',
      },
    ],
    render: (p, ctx) => <Ssrm p={p} ctx={ctx} />,
    code: p => `const datasource = useMemo(() => ({
  getRows: params => {
    const { startRow, endRow, sortModel, filterModel } = params.request;
    api.post('/rows', { startRow, endRow, sortModel, filterModel })
      .then(res => params.success({ rowData: res.rows, rowCount: res.total }))
      .catch(() => params.fail());
  },
}), []);

<R2Grid
  ref={gridRef}
  rowModelType="serverSide"
  serverSideDatasource={datasource}
  cacheBlockSize={100}
  getRowId={p => String(p.data.id)}   // 트랜잭션·선택은 id 로 행을 찾음${p.selection ? "\n  rowSelection={{ mode: 'multiRow' }}" : ''}
/>

// 서버에 저장한 뒤 그리드에 같은 변경 알림 (다시 요청하지 않음)
const res = await api.post('/rows', newRow);
gridRef.current.api.${p.async ? 'applyServerSideTransactionAsync' : 'applyServerSideTransaction'}({ add: [res.data], addIndex: 0 }${p.async ? ', r => console.log(r.status)' : ''});
gridRef.current.api.${p.async ? 'applyServerSideTransactionAsync' : 'applyServerSideTransaction'}({ update: [changedRow] });
gridRef.current.api.${p.async ? 'applyServerSideTransactionAsync' : 'applyServerSideTransaction'}({ remove: [deletedRow] });${p.selection ? `

// 선택 상태 — 안 불러온 행 포함
const { selectAll, toggledNodes } = gridRef.current.api.getServerSideSelectionState();
// selectAll=true  → toggledNodes 는 선택 해제된 id
// selectAll=false → toggledNodes 는 선택된 id` : ''}`,
    usage: {
      file: 'page/work/workGroup/work/modal/WorkGroupPlanModal.jsx',
      code: `const onGridReady = e => {
  e.api.setGridOption('loading', true);
  e.api.setGridOption('serverSideDatasource', {
    getRows: props => {
      axios
        .post('execute/bs-table/plan', {
          serverid: state.serverid,
          tb_id: selectedSql.tb_id,
          sql: selectedSql.sql_stmt_user ?? selectedSql.sql_stmt_auto,
          ...`,
    },
  },
  {
    id: 'infinite',
    category: CAT,
    name: '무한 스크롤 (Infinite)',
    desc: "rowModelType: 'infinite' + datasource.getRows({ startRow, endRow, sortModel, filterModel, successCallback(rows, lastRow) }). lastRow 를 모르면 -1. maxBlocksInCache 를 넘으면 오래된 블록을 버립니다.",
    keywords: ['rowModelType', 'infinite', 'datasource', 'successCallback', 'failCallback', 'lastRow', 'cacheBlockSize', 'maxBlocksInCache', 'infiniteInitialRowCount', 'cacheOverflowSize', 'purgeInfiniteCache', 'refreshInfiniteCache', 'getInfiniteRowCount', 'isLastRowIndexKnown', 'setRowCount'],
    controls: [{
        key: 'maxBlocks',
        type: 'select',
        default: 0,
        label: 'maxBlocksInCache',
        desc: '메모리에 유지할 블록(cacheBlockSize 행 단위) 수. 넘으면 가장 오래 안 본 블록을 버리고, 다시 스크롤하면 서버에서 다시 받습니다.',
        options: [
          { value: 0, desc: '제한 없음 — 받은 블록 전부 유지' },
          { value: 3, desc: '3블록만 유지 — 메모리 적게, 되돌아가면 재요청' },
          { value: 10, desc: '10블록 유지' },
        ],
      }],
    render: (p, ctx) => <Infinite p={p} ctx={ctx} />,
    code: p => `const datasource = {
  getRows: ({ startRow, endRow, sortModel, filterModel, successCallback, failCallback }) => {
    fetchRows(startRow, endRow, sortModel, filterModel)
      .then(({ rows, total }) => successCallback(rows, endRow >= total ? total : -1))
      .catch(failCallback);
  },
};

<R2Grid rowModelType="infinite" datasource={datasource} cacheBlockSize={100}${p.maxBlocks ? ` maxBlocksInCache={${p.maxBlocks}}` : ''} />`,
  },
];
