import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Table from './demo/Table.jsx';
import Phase4Demo from './demo/Phase4Demo.jsx';

// CLM ExcelDownload.jsx 처럼 차트 이미지를 prependContent + addImageToCell 로 넣는다
function chartPng() {
  const c = document.createElement('canvas');
  c.width = 865;
  c.height = 350;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, 865, 350);
  x.fillStyle = '#2196f3';
  [120, 200, 90, 260, 170, 300, 150].forEach((h, i) => x.fillRect(60 + i * 110, 330 - h, 60, h));
  x.fillStyle = '#333';
  x.font = '20px sans-serif';
  x.fillText('CLM 차트 (엑셀 이미지 삽입 테스트)', 20, 30);
  return c.toDataURL('image/png');
}
export function excelChartDownload(gridRef) {
  const imageDataURL = chartPng();
  gridRef.current.api.exportDataAsExcel({
    fileName: 'clm-grid.xlsx',
    prependContent: [
      {
        cells: [
          {
            data: { type: 'String', value: imageDataURL },
            mergeAcross: gridRef.current.api.getAllGridColumns().length - 1,
          },
        ],
      },
    ],
    rowHeight: params => (params.rowIndex === 1 ? 350 : 20),
    addImageToCell: i =>
      i === 1 && {
        image: {
          id: 'logo',
          base64: imageDataURL,
          imageType: 'png',
          width: 865,
          height: 350,
          position: { colSpan: gridRef.current.api.getAllGridColumns().length },
        },
      },
  });
}
import './app.css';

const STATUS = ['진행', '완료', '대기', '오류', '검토'];
const DBMS = ['Oracle', 'MySQL', 'PostgreSQL', 'MSSQL', 'Tibero'];

function makeRows(n, start = 0) {
  const rows = new Array(n);
  for (let k = 0; k < n; k++) {
    const i = start + k;
    rows[k] = {
      id: i + 1,
      taskName: `작업_${String(i + 1).padStart(6, '0')}`,
      dbms: DBMS[i % DBMS.length],
      owner: `USER_${(i * 7) % 500}`,
      rowCnt: Math.floor(Math.random() * 5_000_000),
      progress: Math.floor(Math.random() * 101),
      status: STATUS[i % STATUS.length],
      useYn: i % 3 !== 0,
      memo: i % 4 === 0 ? `메모 ${i}` : null,
      updatedAt: new Date(Date.now() - i * 60000).toISOString().slice(0, 19).replace('T', ' '),
    };
  }
  return rows;
}

// CLM components/AgGridAddOn/SimpleTextEditor.jsx 그대로
function SimpleTextEditor({ value, onValueChange, eventKey, column }) {
  const refInput = useRef(null);
  const updateValue = val => onValueChange(val === '' ? null : val);
  useEffect(() => {
    let startValue;
    if (eventKey === 'Backspace') startValue = '';
    else if (eventKey && eventKey.length === 1) startValue = eventKey;
    else startValue = value;
    if (startValue == null) startValue = '';
    updateValue(startValue);
    refInput.current?.focus();
  }, []);
  return (
    <input
      value={value || ''}
      ref={refInput}
      onChange={event => updateValue(event.target.value)}
      className="r2-input-field-input r2-text-field-input"
      style={{ width: column.actualWidth || '100%', height: column.gos.gridOptions.rowHeight || '100%' }}
    />
  );
}

function StatusBadge({ value }) {
  const color = { 완료: '#2e7d32', 진행: '#1565c0', 대기: '#757575', 오류: '#c62828', 검토: '#e65100' }[value] || '#555';
  return (
    <span style={{ background: color, color: '#fff', padding: '1px 8px', borderRadius: 10, fontSize: 11 }}>{value}</span>
  );
}

function ProgressBar({ value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: '100%' }}>
      <div style={{ flex: 1, height: 6, background: '#8882', borderRadius: 4 }}>
        <div style={{ width: `${value}%`, height: '100%', background: '#2196f3', borderRadius: 4 }} />
      </div>
      <span style={{ width: 34, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

// CLM OwnerListSidebar 처럼 api.addEventListener('selectionChanged') 로 선택행 추적하는 커스텀 툴패널
function DetailPanel({ api }) {
  const [row, setRow] = useState(() => api.getSelectedRows()[0]);
  useEffect(() => {
    const h = () => setRow(api.getSelectedRows()[0]);
    api.addEventListener('selectionChanged', h);
    return () => {
      if (!api.isDestroyed()) api.removeEventListener('selectionChanged', h);
    };
  }, [api]);
  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ margin: '0 0 8px' }}>선택 행 상세</h3>
      <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{row ? JSON.stringify(row, null, 2) : '선택 없음'}</pre>
    </div>
  );
}

export default function App() {
  const gridRef = useRef(null);
  const initialCount = Number(new URLSearchParams(window.location.search).get('rows')) || 100_000;
  const [count, setCount] = useState(initialCount);
  const [rows, setRows] = useState(() => makeRows(initialCount));
  const [dark, setDark] = useState(false);
  const [pagination, setPagination] = useState(false);
  const [quick, setQuick] = useState('');
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'main');
  const [log, setLog] = useState([]);
  const push = useCallback(msg => setLog(l => [`${new Date().toLocaleTimeString()} ${msg}`, ...l].slice(0, 14)), []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (dark) root.setAttribute('data-r2-theme-mode', 'dark');
    else root.removeAttribute('data-r2-theme-mode');
  }, [dark]);

  const columnDefs = useMemo(
    () => [
      {
        headerName: '기본',
        children: [
          { field: 'id', headerName: 'ID', width: 90, flex: 0, pinned: 'left', filter: 'agNumberColumnFilter' },
          { field: 'taskName', headerName: '작업명', minWidth: 150, editable: true, tooltipField: 'taskName' },
        ],
      },
      {
        headerName: '대상',
        children: [
          {
            field: 'dbms',
            headerName: 'DBMS',
            minWidth: 110,
            editable: true,
            cellEditor: 'agRichSelectCellEditor',
            cellEditorParams: { values: DBMS },
          },
          {
            field: 'owner',
            headerName: '소유자',
            minWidth: 110,
            filter: 'agTextColumnFilter',
            editable: true,
            cellEditor: SimpleTextEditor,
            cellEditorPopup: true,
          },
        ],
      },
      {
        field: 'rowCnt',
        headerName: '행 수',
        minWidth: 120,
        type: 'numericColumn',
        filter: 'agNumberColumnFilter',
        editable: true,
        enableCellChangeFlash: true,
        valueFormatter: ({ value }) => (value == null ? '' : value.toLocaleString('ko-KR')),
        cellClassRules: {
          'cell-danger': ({ value }) => value > 4_000_000,
          'cell-warn': ({ value }) => value > 2_000_000 && value <= 4_000_000,
        },
      },
      { field: 'progress', headerName: '진행률', minWidth: 150, cellRenderer: ProgressBar, filter: 'agNumberColumnFilter' },
      { field: 'status', headerName: '상태', minWidth: 90, cellRenderer: 'statusBadge' },
      { field: 'useYn', headerName: '사용', width: 80, flex: 0, editable: true },
      { field: 'memo', headerName: '메모', minWidth: 120, editable: true, cellEditor: 'agLargeTextCellEditor' },
      { field: 'updatedAt', headerName: '수정일시', minWidth: 160 },
      {
        headerName: '',
        field: 'action',
        cellRenderer: 'rowAddOn',
        width: 70,
        flex: 0,
        pinned: 'right',
        sortable: false,
        filter: false,
        suppressHeaderMenuButton: true,
      },
    ],
    [],
  );

  const sideBar = useMemo(
    () => ({
      toolPanels: [
        { id: 'detail', labelDefault: '상세', iconKey: 'menu', toolPanel: DetailPanel, mustHaveSelectedRow: true },
        { id: 'columns', labelDefault: '컬럼', iconKey: 'columns', toolPanel: 'agColumnsToolPanel', ignoreSelectedRowGuard: true },
        { id: 'filters', labelDefault: '필터', iconKey: 'filter', toolPanel: 'agFiltersToolPanel', ignoreSelectedRowGuard: true },
      ],
    }),
    [],
  );

  const api = () => gridRef.current?.api;
  const regen = n => {
    setCount(n);
    api()?.setGridOption('loading', true);
    setTimeout(() => setRows(makeRows(n)), 30);
  };

  return (
    <div className="app">
      <header>
        <h1>R2grid — AG-Grid 호환 데이터 그리드</h1>
        <div className="controls">
          {[10_000, 100_000, 500_000].map(n => (
            <button key={n} className={count === n ? 'on' : ''} onClick={() => regen(n)}>
              {n.toLocaleString('ko-KR')}건
            </button>
          ))}
          <button onClick={() => setDark(d => !d)}>{dark ? '☀ 라이트' : '🌙 다크'}</button>
          <button className={pagination ? 'on' : ''} onClick={() => setPagination(p => !p)}>
            페이지네이션
          </button>
          <input placeholder="빠른 검색 (quickFilterText)" value={quick} onChange={e => setQuick(e.target.value)} />
          <span className="sep" />
          <button onClick={() => api().autoSizeAllColumns()}>autoSize</button>
          <button onClick={() => api().sizeColumnsToFit()}>sizeToFit</button>
          <button
            onClick={() => {
              const nodes = api().getRenderedNodes().slice(0, 8);
              api().applyTransaction({ update: nodes.map(n => ({ ...n.data, rowCnt: Math.floor(Math.random() * 5_000_000) })) });
            }}
          >
            값 갱신(flash)
          </button>
          <button onClick={() => api().applyTransaction({ add: makeRows(1, Date.now() % 1e6), addIndex: 0 })}>행 추가</button>
          <button onClick={() => api().applyTransaction({ remove: api().getSelectedRows() })}>선택 삭제</button>
          <button
            onClick={() => api().setFilterModel({ taskName: { filterType: 'text', type: 'contains', filter: '0001' } })}
          >
            setFilterModel
          </button>
          <button onClick={() => api().setFilterModel(null)}>필터 해제</button>
          <button onClick={() => api().exportDataAsCsv({ fileName: 'clm-grid.csv' })}>CSV</button>
          <button onClick={() => excelChartDownload(gridRef)}>엑셀(+차트)</button>
          <span className="sep" />
          <button className={tab === 'main' ? 'on' : ''} onClick={() => setTab('main')}>
            메인
          </button>
          <button className={tab === 'p4' ? 'on' : ''} onClick={() => setTab('p4')}>
            Phase4 기능
          </button>
        </div>
      </header>

      {tab === 'p4' && (
        <div className="layout p4-layout">
          <Phase4Demo log={push} />
          <aside className="log">
            <h3>이벤트 로그</h3>
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </aside>
        </div>
      )}
      <div className="layout" style={tab === 'main' ? undefined : { display: 'none' }}>
        <div className="grid-area">
          <Table
            ref={gridRef}
            height="100%"
            rowData={rows}
            columnDefs={columnDefs}
            rowSelection={{ mode: 'multiRow', checkboxes: true, enableSelectionWithoutKeys: true, enableClickSelection: true }}
            rowNumbers
            pagination={pagination}
            paginationPageSize={100}
            quickFilterText={quick}
            getRowId={params => String(params.data.id)}
            sideBar={sideBar}
            reactiveCustomComponents
            components={{
              statusBadge: props => <StatusBadge value={props.value} />,
              rowAddOn: props => (
                <button
                  className="mini-btn"
                  onClick={e => {
                    e.stopPropagation();
                    props.api.applyTransaction({ remove: [props.data] });
                  }}
                >
                  삭제
                </button>
              ),
            }}
            getContextMenuItems={({ node }) =>
              node
                ? [
                    { name: '로그 확인', action: e => push(`로그 확인: ${e.node.data.taskName}`) },
                    'separator',
                    'copy',
                    'copyWithHeaders',
                    'paste',
                    'separator',
                    'export',
                  ]
                : []
            }
            onGridReady={e => {
              window.__gridApi = e.api;
              push('gridReady');
            }}
            onRowDataUpdated={e => push(`rowDataUpdated (${e.api.getDisplayedRowCount().toLocaleString()}행)`)}
            onSelectionChanged={e => push(`selectionChanged: ${e.api.getSelectedRows().length}행 (${e.source})`)}
            onCellValueChanged={e => push(`cellValueChanged ${e.colDef.field}: ${e.oldValue} → ${e.newValue}`)}
            onFilterChanged={e => push(`filterChanged (${e.api.getDisplayedRowCount().toLocaleString()}행)`)}
            onSortChanged={() => push('sortChanged')}
            onColumnVisible={e => push(`columnVisible: ${e.columns?.map(c => c.getColId()).join(',')}`)}
            onPaginationChanged={e => e.newPage && push(`paginationChanged → ${e.api.paginationGetCurrentPage() + 1}p`)}
          />
        </div>
        <aside className="log">
          <h3>이벤트 로그</h3>
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </aside>
      </div>
      {tab === 'main' && <MasterDetailDemo />}
    </div>
  );
}

function MasterDetailDemo() {
  const rows = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        groupName: `업무그룹 ${i + 1}`,
        owner: `USER_${i}`,
        tables: Array.from({ length: (i % 4) + 1 }, (__, k) => ({ tbl: `TB_${i}_${k}`, cnt: (i + 1) * (k + 3) * 1000 })),
      })),
    [],
  );
  return (
    <div className="md-area">
      <h2>마스터/디테일 (agGroupCellRenderer + detailCellRendererParams)</h2>
      <Table
        height="320px"
        rowData={rows}
        masterDetail
        isRowMaster={d => d.tables.length > 1}
        detailRowHeight={170}
        columnDefs={[
          { field: 'groupName', headerName: '그룹', cellRenderer: 'agGroupCellRenderer' },
          { field: 'owner', headerName: '소유자' },
          { headerName: '테이블 수', valueGetter: p => p.data.tables.length, type: 'numericColumn' },
        ]}
        detailCellRendererParams={{
          detailGridOptions: {
            columnDefs: [
              { field: 'tbl', headerName: '테이블', flex: 1 },
              { field: 'cnt', headerName: '건수', flex: 1, valueFormatter: p => p.value.toLocaleString() },
            ],
          },
          getDetailRowData: p => p.successCallback(p.data.tables),
        }}
      />
    </div>
  );
}
