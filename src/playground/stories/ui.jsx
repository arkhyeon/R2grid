import React, { useMemo, useRef, useState } from 'react';
import { BASE_COLUMNS, makeRows, SAMPLE } from '../data.js';
import { Grid } from './_shared.jsx';

const CAT = 'UI 구성';

function DetailPanel({ api }) {
  const [row, setRow] = useState(() => api.getSelectedRows()[0]);
  React.useEffect(() => {
    const h = () => setRow(api.getSelectedRows()[0]);
    api.addEventListener('selectionChanged', h);
    return () => api.removeEventListener('selectionChanged', h);
  }, [api]);
  return (
    <div style={{ padding: 12, fontSize: 13 }}>
      <b>선택 행 상세</b>
      {row ? (
        <dl style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: '4px 8px', marginTop: 8 }}>
          {Object.entries(row)
            .filter(([k]) => k !== 'history')
            .map(([k, v]) => (
              <React.Fragment key={k}>
                <dt style={{ opacity: 0.6 }}>{k}</dt>
                <dd style={{ margin: 0 }}>{String(v)}</dd>
              </React.Fragment>
            ))}
        </dl>
      ) : (
        <p style={{ opacity: 0.6 }}>행을 선택하세요</p>
      )}
    </div>
  );
}

function SideBar({ p, ctx }) {
  const sideBar = useMemo(
    () => ({
      toolPanels: [
        { id: 'detail', labelDefault: '상세', iconKey: 'menu', toolPanel: DetailPanel, width: 260 },
        { id: 'columns', labelDefault: '컬럼', iconKey: 'columns', toolPanel: 'agColumnsToolPanel' },
        { id: 'filters', labelDefault: '필터', iconKey: 'filter', toolPanel: 'agFiltersToolPanel' },
      ],
      position: p.position,
      defaultToolPanel: p.open ? 'detail' : undefined,
    }),
    [p.position, p.open],
  );
  return (
    <Grid
      key={`${p.position}${p.open}`}
      height={400}
      rowData={SAMPLE}
      columnDefs={BASE_COLUMNS.map(c => ({ ...c, filter: true }))}
      rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
      sideBar={sideBar}
      onToolPanelVisibleChanged={e => ctx.log(`toolPanelVisibleChanged: ${e.key} visible=${e.visible}`)}
    />
  );
}

function StatusBarStory({ p }) {
  const panels = [
    { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
    { statusPanel: 'agFilteredRowCountComponent' },
    { statusPanel: 'agSelectedRowCountComponent' },
    p.agg && { statusPanel: 'agAggregationComponent', statusPanelParams: { aggFuncs: ['count', 'sum', 'avg', 'min', 'max'] } },
  ].filter(Boolean);
  return (
    <>
      <div className="pg-toolbar">
        <span className="pg-note">숫자 셀을 여러 칸 드래그하면 합계/평균이 표시됩니다 · 행을 선택하면 선택 수 표시</span>
      </div>
      <Grid key={String(p.agg)} rowData={SAMPLE} columnDefs={BASE_COLUMNS} cellSelection rowSelection={{ mode: 'multiRow' }} statusBar={{ statusPanels: panels }} />
    </>
  );
}

function ContextMenu({ ctx }) {
  const getContextMenuItems = params => [
    ...(params.node
      ? [
          { name: `"${params.node.data.taskName}" 로그 확인`, action: () => ctx.log(`로그 확인: ${params.node.data.taskName}`), icon: 'search' },
          { name: '상태 변경', subMenu: ['대기', '진행', '완료'].map(s => ({ name: s, checked: params.node.data.status === s, action: () => params.node.setDataValue('status', s) })) },
          'separator',
        ]
      : []),
    'copy',
    'copyWithHeaders',
    'paste',
    'separator',
    'export',
    'chartRange',
  ];
  return (
    <Grid
      rowData={SAMPLE}
      columnDefs={BASE_COLUMNS}
      cellSelection
      enableCharts
      getContextMenuItems={getContextMenuItems}
      onContextMenuVisibleChanged={e => e.visible && ctx.log('contextMenu 열림')}
    />
  );
}

function ColumnMenu({ p }) {
  return (
    <Grid
      key={p.style}
      rowData={SAMPLE}
      columnDefs={BASE_COLUMNS.map(c => ({ ...c, filter: true, suppressHeaderMenuButton: false }))}
      columnMenu={p.style}
      defaultColDef={p.style === 'legacy' ? { menuTabs: ['generalMenuTab', 'filterMenuTab', 'columnsMenuTab'] } : undefined}
    />
  );
}

function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="r2-icon r2-icon-loading" />
      불러오는 중…
    </div>
  );
}
function Overlays({ p }) {
  return (
    <Grid
      rowData={p.state === 'empty' ? [] : SAMPLE}
      columnDefs={BASE_COLUMNS}
      loading={p.state === 'loading'}
      loadingOverlayComponent={p.custom ? Loading : undefined}
      overlayNoRowsTemplate={p.custom ? '<span style="padding:10px;border:1px dashed #aaa">조회된 데이터가 없습니다</span>' : undefined}
    />
  );
}

function Rtl({ p }) {
  return (
    <Grid
      key={String(p.rtl)}
      rowData={SAMPLE}
      columnDefs={BASE_COLUMNS.map((c, i) => ({ ...c, pinned: i === 0 ? 'left' : null }))}
      enableRtl={p.rtl}
      rowSelection={{ mode: 'multiRow' }}
      cellSelection
    />
  );
}

function PopupParent({ p }) {
  const rows = useMemo(() => makeRows(3), []);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
      <div className="pg-toolbar">
        <span className="pg-note">아주 낮은 그리드(130px)에서 헤더 메뉴/필터를 열어 보세요. 기본은 그리드 안에 갇히고, popupParent=document.body 면 밖으로 나옵니다.</span>
      </div>
      <Grid
        key={String(p.body)}
        height={130}
        rowData={rows}
        columnDefs={BASE_COLUMNS.map(c => ({ ...c, filter: true }))}
        popupParent={p.body ? document.body : undefined}
        columnMenu="legacy"
      />
    </div>
  );
}

export default [
  {
    id: 'side-bar',
    category: CAT,
    name: '사이드바 · 툴패널',
    desc: '내장 컬럼/필터 툴패널과 커스텀 툴패널(컴포넌트). openToolPanel / closeToolPanel / getSideBar 로 제어합니다.',
    keywords: ['sideBar', 'toolPanels', 'agColumnsToolPanel', 'agFiltersToolPanel', 'toolPanel', 'defaultToolPanel', 'openToolPanel', 'closeToolPanel', 'getSideBar', 'isToolPanelShowing', 'onToolPanelVisibleChanged', 'suppressColumnsToolPanel', 'suppressFiltersToolPanel'],
    controls: [
      { key: 'position', type: 'select', options: ['right', 'left'], default: 'right' },
      { key: 'open', type: 'boolean', default: true, desc: 'defaultToolPanel' },
    ],
    render: (p, ctx) => <SideBar p={p} ctx={ctx} />,
    code: p => `const sideBar = {
  toolPanels: [
    { id: 'detail', labelDefault: '상세', iconKey: 'menu', toolPanel: DetailPanel },
    { id: 'columns', labelDefault: '컬럼', toolPanel: 'agColumnsToolPanel' },
    { id: 'filters', labelDefault: '필터', toolPanel: 'agFiltersToolPanel' },
  ],
  position: '${p.position}',${p.open ? "\n  defaultToolPanel: 'detail'," : ''}
};

<AgGridReact sideBar={sideBar} onToolPanelVisibleChanged={e => console.log(e.key)} />`,
    usage: {
      file: 'page/management/dbmsMapping/DbmsMapping.jsx',
      code: `rowNumbers
rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
sideBar={sideBar}
reactiveCustomComponents
components={{ rowAddOn: props => RowAddOn(props, deleteDbms, null) }}`,
    },
  },
  {
    id: 'status-bar',
    category: CAT,
    name: '상태 표시줄',
    desc: '하단 상태 표시줄: 전체/필터/선택 행 수, 범위 선택 집계(개수·합계·평균·최소·최대), 커스텀 패널.',
    keywords: ['statusBar', 'statusPanels', 'agTotalAndFilteredRowCountComponent', 'agTotalRowCountComponent', 'agFilteredRowCountComponent', 'agSelectedRowCountComponent', 'agAggregationComponent', 'getStatusPanel'],
    controls: [{ key: 'agg', type: 'boolean', default: true, desc: 'agAggregationComponent' }],
    render: p => <StatusBarStory p={p} />,
    code: p => `<AgGridReact
  cellSelection
  statusBar={{
    statusPanels: [
      { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
      { statusPanel: 'agFilteredRowCountComponent' },
      { statusPanel: 'agSelectedRowCountComponent' },${p.agg ? "\n      { statusPanel: 'agAggregationComponent' }," : ''}
    ],
  }}
/>`,
  },
  {
    id: 'context-menu',
    category: CAT,
    name: '컨텍스트 메뉴',
    desc: 'getContextMenuItems 로 우클릭 메뉴를 구성합니다. 내장 항목(copy, paste, export, chartRange…)과 커스텀 항목(name/action/icon/subMenu/checked)을 섞을 수 있습니다.',
    keywords: ['getContextMenuItems', 'suppressContextMenu', 'preventDefaultOnContextMenu', 'copy', 'copyWithHeaders', 'paste', 'export', 'chartRange', 'subMenu', 'separator', 'onContextMenuVisibleChanged'],
    controls: [],
    render: (p, ctx) => <ContextMenu ctx={ctx} />,
    code: () => `const getContextMenuItems = params => [
  { name: '로그 확인', action: () => openLog(params.node.data) },
  { name: '상태 변경', subMenu: ['대기', '진행'].map(s => ({ name: s, action: () => params.node.setDataValue('status', s) })) },
  'separator',
  'copy', 'copyWithHeaders', 'paste', 'separator', 'export',
];

<AgGridReact getContextMenuItems={getContextMenuItems} />`,
    usage: {
      file: 'page/work/workGroup/work/WorkGroupAdd.jsx',
      code: `const getContextMenuItems = useCallback(
  ({ node }) =>
    node
      ? [
          {
            name: '로그 확인',
            action: () =>
              navigate('/history/register/table', {
                state: { ...state, tbl_name: node.data.tbl_name },
              }),
          },
        ]
      : [],
  [navigate, state],
);`,
    },
  },
  {
    id: 'column-menu',
    category: CAT,
    name: '컬럼 메뉴',
    desc: "columnMenu: 'new'(목록형) 또는 'legacy'(탭: 일반/필터/컬럼). menuTabs, mainMenuItems / getMainMenuItems 로 항목을 바꿉니다.",
    keywords: ['columnMenu', 'legacy', 'menuTabs', 'generalMenuTab', 'filterMenuTab', 'columnsMenuTab', 'mainMenuItems', 'getMainMenuItems', 'suppressHeaderMenuButton', 'showColumnMenu', 'pinSubMenu', 'autoSizeThis', 'columnChooser'],
    controls: [{ key: 'style', type: 'select', options: ['new', 'legacy'], default: 'legacy' }],
    render: p => <ColumnMenu p={p} />,
    code: p => `<AgGridReact
  columnMenu="${p.style}"${p.style === 'legacy' ? "\n  defaultColDef={{ menuTabs: ['generalMenuTab', 'filterMenuTab', 'columnsMenuTab'] }}" : ''}
/>`,
    usage: { file: 'components/PageTemplate/Table.jsx', code: `columnMenu="legacy"` },
  },
  {
    id: 'overlays',
    category: CAT,
    name: '오버레이 (로딩 / 빈 데이터)',
    desc: "loading prop(또는 setGridOption('loading', true))으로 로딩 오버레이, rowData 가 비면 noRows 오버레이. 컴포넌트/템플릿으로 바꿀 수 있습니다.",
    keywords: ['loading', 'loadingOverlayComponent', 'noRowsOverlayComponent', 'overlayLoadingTemplate', 'overlayNoRowsTemplate', 'showLoadingOverlay', 'showNoRowsOverlay', 'hideOverlay', 'suppressNoRowsOverlay'],
    controls: [
      { key: 'state', type: 'select', options: ['data', 'loading', 'empty'], default: 'loading' },
      { key: 'custom', type: 'boolean', default: true, desc: '커스텀 오버레이' },
    ],
    render: p => <Overlays p={p} />,
    code: p => `<AgGridReact
  loading={${p.state === 'loading'}}${p.custom ? "\n  loadingOverlayComponent={Loading}\n  overlayNoRowsTemplate='<span>조회된 데이터가 없습니다</span>'" : ''}
  rowData={${p.state === 'empty' ? '[]' : 'rowData'}}
/>`,
    usage: {
      file: 'page/service/syncSystem/syncSetting/modal/SyncScheduleAddModal.jsx',
      code: `columnDefs={createRegisteredTableDef}
defaultColGroupDef={{ menuTabs: [] }}
overlayNoRowsTemplate={NO_ROWS_TEMPLATE}`,
    },
  },
  {
    id: 'rtl',
    category: CAT,
    name: '오른쪽 → 왼쪽 (RTL)',
    desc: 'enableRtl 이면 컬럼이 오른쪽부터 배치되고 좌우 고정·스크롤·리사이즈·방향키가 반전됩니다.',
    keywords: ['enableRtl', 'r2-rtl', 'direction'],
    controls: [{ key: 'rtl', type: 'boolean', default: true }],
    render: p => <Rtl p={p} />,
    code: p => `<AgGridReact enableRtl={${p.rtl}} columnDefs={columnDefs} rowData={rowData} />`,
  },
  {
    id: 'popup-parent',
    category: CAT,
    name: '팝업 위치 (popupParent)',
    desc: '메뉴·필터·팝업 에디터는 기본적으로 그리드 안에 붙어 페이지/그리드 스크롤을 따라가고 그리드 밖으로 나가지 않습니다. 작은 모달 안 그리드처럼 잘리는 경우 popupParent 로 붙일 요소를 바꿉니다.',
    keywords: ['popupParent', 'document.body', 'cellEditorPopup', 'clip'],
    controls: [{ key: 'body', type: 'boolean', default: false, desc: 'popupParent = document.body' }],
    render: p => <PopupParent p={p} />,
    code: p => `<AgGridReact${p.body ? '\n  popupParent={document.body}' : ''} />`,
    usage: {
      file: 'page/approval/ApprovalInfo/modal/ApprovalCheckModal.jsx',
      code: `const popupParent = useMemo(() => {
  return document.querySelector('body');
}, []);
...
  columnDefs={columnCols}
  height="130px"
  popupParent={popupParent}`,
    },
  },
];
