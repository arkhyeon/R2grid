// CLM30 실제 화면 설정을 그대로 옮긴 재현 데모 (CLM 공통 Table 래퍼 이식본 사용)
import React from 'react';
import App from '../../App.jsx';
import { ColumnGroupDemo, FullRowDemo, GroupDemo, RowDragDemo, SsrmPlanDemo, TreeDemo } from '../../demo/Phase4Demo.jsx';

const CAT = 'CLM 화면 재현';

const tableNote = '스테이지의 그리드는 CLM 공통 Table.jsx 래퍼를 그대로 옮긴 컴포넌트로 렌더합니다 (기본 cellSelection·헤더 복사·툴패널 가드·Alt 단축키 포함).';

const screen = ({ id, name, file, Comp, keywords, desc, usage }) => ({
  id,
  category: CAT,
  name,
  desc: `${desc}\n${tableNote}`,
  keywords: [file.split('/').pop().replace('.jsx', ''), ...keywords],
  controls: [],
  render: (p, ctx) => <Comp log={ctx.log} />,
  code: () => `// CLM30: ${file}\n// 실제 설정은 아래 '본 프로젝트(CLM30) 사용 예' 패널 참고`,
  usage: { file, code: usage },
});

export default [
  {
    id: 'clm-all-in-one',
    category: CAT,
    name: '종합 데모 (CLM Table)',
    desc: '10만 건 + CLM 공통 Table 래퍼: 그룹 헤더, 좌/우 고정, 리치 셀렉트, 팝업 에디터, 사이드바 상세 패널, 컨텍스트 메뉴, 엑셀(+차트) 다운로드, 마스터/디테일.',
    keywords: ['Table.jsx', 'CLM', '종합', 'excelChartDownload', '100000'],
    controls: [],
    wide: true,
    render: () => <App />,
    code: () => `// src/App.jsx — CLM Table 래퍼(src/demo/Table.jsx) 종합 데모`,
  },
  screen({
    id: 'clm-workgroup-list',
    name: '업무 그룹 목록 (컬럼 그룹 접기)',
    file: 'page/work/workGroup/WorkGroupList.jsx',
    Comp: ColumnGroupDemo,
    keywords: ['columnGroupShow', 'marryChildren', 'originalParent'],
    desc: '1·2단계 그룹 헤더의 ▸ 를 눌러 세부 컬럼을 펼칩니다.',
    usage: `<Table
  id="WorkGroupListTable"
  ref={gridRef}
  rowNumbers
  rowData={workList}
  columnDefs={columnDefs}
  rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
  suppressRowTransform
  sideBar={sideBar}
  onSelectionChanged={disabledToolPanel}
  onToolPanelVisibleChanged={disabledToolPanel}
  reactiveCustomComponents
  onRowDoubleClicked={({ data }) => {
    navigate('/work/workgroup/workgroupadd', { state: { ...data, bg_id } });
  }}
/>`,
  }),
  screen({
    id: 'clm-user-group-role',
    name: '사용자 그룹 권한 (트리)',
    file: 'page/management/userGroup/UserGroupRole.jsx',
    Comp: TreeDemo,
    keywords: ['treeData', 'getDataPath', 'aggFunc'],
    desc: '메뉴 트리 + 읽기/쓰기 권한 체크, 상위 행은 하위 값으로 집계합니다.',
    usage: `treeData
getRowId={params => String(params.data.mid)}
getDataPath={({ depth1, depth2, depth3 }) => {
  if (depth3) return [depth1, depth2, depth3];
  if (depth2) return [depth1, depth2];
  return [depth1];
}}
suppressAggFuncInHeader
animateRows
context={{ lockWrite: useBsCdRole }}
components={{ roleCheckbox: props => RoleCheckbox(props, setRoles) }}`,
  }),
  screen({
    id: 'clm-message-address',
    name: '메시지 주소록 (행 그룹 선택)',
    file: 'page/widget/message/modal/MessageAddress.jsx',
    Comp: GroupDemo,
    keywords: ['rowGroup', 'groupSelectsChildren'],
    desc: '그룹을 체크하면 하위 사용자가 모두 선택되고 getSelectedNodes 는 리프만 반환합니다.\n⚠ 실제 화면은 columnDefs 를 gridOptions 에 넣는데 Table 이 columnDefs prop 으로 덮어써 그룹 컬럼이 빠질 수 있습니다 (AG 동일 동작) — 데모는 prop 으로 전달.',
    usage: `groupSelectsChildren: true,
columnDefs: [
  {
    headerName: '그룹',
    field: 'group',
    flex: 1,
    rowGroup: true,
    suppressColumnsToolPanel: true,
    hide: true,
  },
],`,
  }),
  screen({
    id: 'clm-workgroup-plan',
    name: '실행 계획 (SSRM)',
    file: 'page/work/workGroup/work/modal/WorkGroupPlanModal.jsx',
    Comp: SsrmPlanDemo,
    keywords: ['serverSideDatasource', 'autoHeight', 'setGridOption'],
    desc: 'onGridReady 에서 setGridOption 으로 serverSideDatasource 를 지정하는 CLM 패턴.',
    usage: `<Table
  id="WorkGroupPlanModalTable"
  ref={tableRef}
  columnDefs={columnDefs}
  height="600px"
  cellSelection
  rowModelType="serverSide"
  onGridReady={onGridReady}
/>`,
  }),
  screen({
    id: 'clm-priority-condition',
    name: '우선순위 · 조건 정보 (행 드래그 · 고정 행)',
    file: 'page/work/workGroup/modal/WorkGroupPrioritySetting.jsx',
    Comp: RowDragDemo,
    keywords: ['rowDragManaged', 'rowDragEntireRow', 'pinnedTopRowData', 'ConditionInfo'],
    desc: '행 전체 드래그 정렬(우선순위)과 상단 고정 기본 조건 행 편집(조건 정보 — ConditionInfo.jsx).',
    usage: `rowDragManaged
animateRows
rowDragEntireRow
onRowDragEnd={props => props.api.refreshCells()}`,
  }),
  screen({
    id: 'clm-destruction-control',
    name: '파기 관리 임계 설정 (행 편집 · undo)',
    file: 'page/work/projectDestruction/DestructionManagementControl.jsx',
    Comp: FullRowDemo,
    keywords: ['editType', 'fullRow', 'undoRedoCellEditing'],
    desc: '행 단위 편집 + Ctrl+Z/Y.',
    usage: `onRowValueChanged={handleUpdateProject}
undoRedoCellEditing
editType="fullRow"`,
  }),
];
