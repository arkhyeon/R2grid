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
        { id: 'columns', labelDefault: '컬럼', iconKey: 'columns', toolPanel: 'r2ColumnsToolPanel' },
        { id: 'filters', labelDefault: '필터', iconKey: 'filter', toolPanel: 'r2FiltersToolPanel' },
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
    { statusPanel: 'r2TotalAndFilteredRowCountComponent', align: 'left' },
    { statusPanel: 'r2FilteredRowCountComponent' },
    { statusPanel: 'r2SelectedRowCountComponent' },
    p.agg && { statusPanel: 'r2AggregationComponent', statusPanelParams: { aggFuncs: ['count', 'sum', 'avg', 'min', 'max'] } },
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
    keywords: ['sideBar', 'toolPanels', 'r2ColumnsToolPanel', 'r2FiltersToolPanel', 'toolPanel', 'defaultToolPanel', 'openToolPanel', 'closeToolPanel', 'getSideBar', 'isToolPanelShowing', 'onToolPanelVisibleChanged', 'suppressColumnsToolPanel', 'suppressFiltersToolPanel'],
    controls: [
      {
        key: 'position',
        type: 'select',
        default: 'right',
        label: 'sideBar.position',
        desc: '사이드바(탭 버튼 + 툴패널)를 그리드 어느 쪽에 둘지.',
        options: [
          { value: 'right', desc: '오른쪽 (기본)' },
          { value: 'left', desc: '왼쪽' },
        ],
      },
      {
        key: 'open',
        type: 'boolean',
        default: true,
        label: 'sideBar.defaultToolPanel',
        desc: '처음부터 열어 둘 툴패널 id. 지정하지 않으면 탭 버튼만 보이고 패널은 닫혀 있습니다.',
        on: "'detail' 패널이 열린 채 시작",
        off: '닫힌 채 시작 — 탭 버튼으로 열기',
      },
    ],
    render: (p, ctx) => <SideBar p={p} ctx={ctx} />,
    code: p => `const sideBar = {
  toolPanels: [
    { id: 'detail', labelDefault: '상세', iconKey: 'menu', toolPanel: DetailPanel },
    { id: 'columns', labelDefault: '컬럼', toolPanel: 'r2ColumnsToolPanel' },
    { id: 'filters', labelDefault: '필터', toolPanel: 'r2FiltersToolPanel' },
  ],
  position: '${p.position}',${p.open ? "\n  defaultToolPanel: 'detail'," : ''}
};

<R2Grid sideBar={sideBar} onToolPanelVisibleChanged={e => console.log(e.key)} />`,
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
    keywords: ['statusBar', 'statusPanels', 'r2TotalAndFilteredRowCountComponent', 'r2TotalRowCountComponent', 'r2FilteredRowCountComponent', 'r2SelectedRowCountComponent', 'r2AggregationComponent', 'getStatusPanel'],
    controls: [{
        key: 'agg',
        type: 'boolean',
        default: true,
        label: 'r2AggregationComponent',
        desc: '상태바 패널. 셀 범위를 2칸 이상 드래그하면 그 범위 숫자들의 개수·합계·평균·최소·최대를 보여줍니다 (statusPanelParams.aggFuncs 로 항목 선택).',
        on: '범위 선택 시 오른쪽에 집계 표시',
        off: '행 수/선택 수 패널만',
      }],
    render: p => <StatusBarStory p={p} />,
    code: p => `<R2Grid
  cellSelection
  statusBar={{
    statusPanels: [
      { statusPanel: 'r2TotalAndFilteredRowCountComponent', align: 'left' },
      { statusPanel: 'r2FilteredRowCountComponent' },
      { statusPanel: 'r2SelectedRowCountComponent' },${p.agg ? "\n      { statusPanel: 'r2AggregationComponent' }," : ''}
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

<R2Grid getContextMenuItems={getContextMenuItems} />`,
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
    controls: [{
        key: 'style',
        type: 'select',
        default: 'legacy',
        label: 'columnMenu',
        desc: '헤더 메뉴(≡) 모양.',
        options: [
          { value: 'new', desc: '목록형 메뉴 하나 — 정렬·필터·고정·크기·열 선택 (필터는 헤더의 필터 아이콘으로 따로)' },
          { value: 'legacy', desc: '탭형 메뉴 — 일반/필터/열 선택 탭 (menuTabs 로 탭 구성). CLM 이 쓰는 방식' },
        ],
      }],
    render: p => <ColumnMenu p={p} />,
    code: p => `<R2Grid
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
      {
        key: 'state',
        type: 'select',
        default: 'loading',
        label: '그리드 상태',
        desc: '오버레이는 그리드 위에 덮는 안내 화면입니다. loading prop 이 true 면 로딩 오버레이, 행이 0개면 빈 데이터 오버레이가 뜹니다 (api.showLoadingOverlay 등으로 직접 제어도 가능).',
        options: [
          { value: 'data', desc: '데이터 있음 — 오버레이 없음' },
          { value: 'loading', desc: 'loading={true} — 로딩 오버레이' },
          { value: 'empty', desc: 'rowData=[] — 빈 데이터 오버레이' },
        ],
      },
      {
        key: 'custom',
        type: 'boolean',
        default: true,
        label: 'loadingOverlayComponent / overlayNoRowsTemplate',
        desc: '오버레이 내용을 바꿉니다. 컴포넌트(…Component) 또는 HTML 문자열(…Template) 둘 다 가능.',
        on: '커스텀 로딩 컴포넌트·빈 데이터 문구',
        off: "기본 '로딩 중...' / '표시할 행이 없습니다'",
      },
    ],
    render: p => <Overlays p={p} />,
    code: p => `<R2Grid
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
    controls: [{
        key: 'rtl',
        type: 'boolean',
        default: true,
        label: 'enableRtl',
        desc: '오른쪽→왼쪽 레이아웃. 컬럼 순서·고정 위치·스크롤·키보드 좌우 이동이 모두 뒤집힙니다 (아랍어·히브리어 화면용).',
        on: '첫 컬럼이 오른쪽 끝',
        off: '일반 왼쪽→오른쪽',
      }],
    render: p => <Rtl p={p} />,
    code: p => `<R2Grid enableRtl={${p.rtl}} columnDefs={columnDefs} rowData={rowData} />`,
  },
  {
    id: 'popup-parent',
    category: CAT,
    name: '팝업 위치 (popupParent)',
    desc: '메뉴·필터·팝업 에디터는 기본적으로 그리드 안에 붙어 페이지/그리드 스크롤을 따라가고 그리드 밖으로 나가지 않습니다. 작은 모달 안 그리드처럼 잘리는 경우 popupParent 로 붙일 요소를 바꿉니다.',
    keywords: ['popupParent', 'document.body', 'cellEditorPopup', 'clip'],
    controls: [{
        key: 'body',
        type: 'boolean',
        default: false,
        label: 'popupParent',
        desc: '컬럼 메뉴·필터·컨텍스트 메뉴 같은 팝업을 붙일 요소. 기본은 그리드 자신이라 그리드가 작으면 팝업이 그리드 안에서 잘립니다. (셀 편집 팝업·선택 목록은 셀 안에 그려져 항상 그리드 안)',
        on: 'document.body — 팝업이 그리드 밖으로 나갈 수 있음 (모달 안 작은 그리드에 유용)',
        off: '그리드 영역 안에만 표시',
      }],
    render: p => <PopupParent p={p} />,
    code: p => `<R2Grid${p.body ? '\n  popupParent={document.body}' : ''} />`,
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
