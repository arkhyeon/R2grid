import React, { useMemo, useRef } from 'react';
import { BASE_COLUMNS, makeRows, SALES } from '../data.js';
import { Grid } from './_shared.jsx';

const CAT = '서버 데이터 · 페이지';

const SERVER_ROWS = makeRows(2350);
// 가짜 서버: 정렬/필터 후 구간 반환 (지연 300ms)
function fakeServer({ startRow, endRow, sortModel = [], filterModel = {} }) {
  let rows = SERVER_ROWS;
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

function Ssrm({ ctx }) {
  const datasource = useMemo(
    () => ({
      getRows: params => {
        const { startRow, endRow, sortModel, filterModel } = params.request;
        ctx.log(`getRows ${startRow}~${endRow} sort=${JSON.stringify(sortModel)}`);
        fakeServer({ startRow, endRow, sortModel, filterModel }).then(({ rows, total }) => params.success({ rowData: rows, rowCount: total }));
      },
    }),
    [],
  );
  return (
    <Grid
      height={400}
      rowModelType="serverSide"
      serverSideDatasource={datasource}
      cacheBlockSize={100}
      columnDefs={BASE_COLUMNS.map(c => (c.field === 'owner' ? { ...c, filter: 'agTextColumnFilter' } : c))}
    />
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
      { key: 'size', type: 'select', options: [10, 20, 50, 100], default: 20, desc: 'paginationPageSize' },
      { key: 'auto', type: 'boolean', default: false, desc: 'paginationAutoPageSize (높이에 맞춤)' },
      { key: 'grouped', type: 'boolean', default: false, desc: '행 그룹 데이터' },
      { key: 'childRows', type: 'boolean', default: false, desc: 'paginateChildRows' },
    ],
    render: (p, ctx) => <Pagination p={p} ctx={ctx} />,
    code: p => `<AgGridReact
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
    desc: "rowModelType: 'serverSide' — 보이는 구간의 블록(cacheBlockSize)만 getRows 로 요청합니다. 정렬/필터가 바뀌면 캐시를 비우고 request.sortModel / filterModel 로 다시 요청합니다.",
    keywords: ['rowModelType', 'serverSide', 'serverSideDatasource', 'getRows', 'success', 'fail', 'cacheBlockSize', 'maxBlocksInCache', 'serverSideInitialRowCount', 'refreshServerSide', 'retryServerSideLoads', 'setGridOption', 'request.sortModel', 'request.filterModel'],
    controls: [],
    render: (p, ctx) => <Ssrm ctx={ctx} />,
    code: () => `const datasource = useMemo(() => ({
  getRows: params => {
    const { startRow, endRow, sortModel, filterModel } = params.request;
    api.post('/rows', { startRow, endRow, sortModel, filterModel })
      .then(res => params.success({ rowData: res.rows, rowCount: res.total }))
      .catch(() => params.fail());
  },
}), []);

<AgGridReact rowModelType="serverSide" serverSideDatasource={datasource} cacheBlockSize={100} />`,
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
    controls: [{ key: 'maxBlocks', type: 'select', options: [0, 3, 10], default: 0, desc: 'maxBlocksInCache (0 = 제한 없음)' }],
    render: (p, ctx) => <Infinite p={p} ctx={ctx} />,
    code: p => `const datasource = {
  getRows: ({ startRow, endRow, sortModel, filterModel, successCallback, failCallback }) => {
    fetchRows(startRow, endRow, sortModel, filterModel)
      .then(({ rows, total }) => successCallback(rows, endRow >= total ? total : -1))
      .catch(failCallback);
  },
};

<AgGridReact rowModelType="infinite" datasource={datasource} cacheBlockSize={100}${p.maxBlocks ? ` maxBlocksInCache={${p.maxBlocks}}` : ''} />`,
  },
];
