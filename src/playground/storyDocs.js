// 플레이그라운드 기능 문서 (스토리 id → 문서) — seed-ui componentDocs 와 같은 구성
// whenToUse : 언제 쓰는지
// notes     : 주의
// badge     : 'NEW' | 'UPDATE' — 사이드바 메뉴 스티커 (새 기능 · 기능 추가)
// 개요(첫 문단)는 각 스토리의 desc, 옵션 표는 Controls 에서 자동으로 만듦

const STORY_DOCS = {
  // ─── 시작하기 ─────────────────────────────
  'quick-start': {
    whenToUse: ['새 목록 화면을 만들 때 출발점', '공통 컬럼 속성(정렬·필터·리사이즈)을 한 번에 지정할 때 — defaultColDef'],
    notes: ['그리드를 감싼 요소에 높이가 있어야 합니다. 높이가 0이면 행이 보이지 않습니다 (내용에 맞추려면 domLayout="autoHeight").'],
  },
  theme: {
    whenToUse: ['화면 전체의 강조색·글자 크기·행 높이를 바꿀 때', '다크 모드 전환'],
    notes: ['테마는 provideGlobalGridOptions({ theme }) 로 한 번 지정하면 모든 그리드에 적용됩니다.', 'rowHeight·headerHeight prop 은 테마 계산값보다 우선합니다.'],
  },
  locale: {
    whenToUse: ['특정 화면만 문구(빈 데이터 안내, 페이지 표시줄)를 바꿀 때'],
    notes: ['기본값이 한국어(R2_GRID_LOCALE_KR)라 따로 지정하지 않아도 됩니다. 준 키만 덮어씁니다.'],
  },

  // ─── 컬럼 ─────────────────────────────
  'column-defs': {
    whenToUse: ['컬럼 폭·고정·숨김·정렬 방향 등 컬럼마다 다른 속성을 줄 때', '숫자 컬럼 오른쪽 정렬 — type: "numericColumn"'],
    notes: ['field 가 없는 컬럼은 colId 를 직접 주세요. 상태 저장·쿠키가 colId 로 컬럼을 찾습니다.'],
  },
  'column-groups': {
    whenToUse: ['헤더를 2단 이상으로 묶을 때', '세부 컬럼을 평소엔 접어두고 필요할 때만 펼칠 때 — columnGroupShow'],
    notes: ['그룹을 접어도 컬럼 데이터·필터는 그대로입니다. 보이는 컬럼만 바뀝니다.'],
  },
  'column-sizing': {
    whenToUse: ['처음 열 때 내용에 맞춰 폭을 정할 때 — autoSizeStrategy', '그리드 폭에 컬럼을 꽉 채울 때 — fitGridWidth / flex'],
    notes: ['fitCellContents 는 현재 그려진 행 기준으로 잽니다. 스크롤 아래 긴 값은 반영되지 않을 수 있습니다.'],
  },
  'column-state': {
    whenToUse: ['사용자가 바꾼 컬럼 순서·폭·숨김을 다음 방문에도 유지할 때', '"컬럼 초기화" 버튼 — resetColumnState'],
    notes: ['쿠키 4KB 제한: 숨김 목록만 저장하면 수백 바이트, 폭·순서까지 넣으면 컬럼 40개 이상에서 넘을 수 있습니다. 크면 localStorage 를 쓰세요.'],
  },
  'aligned-grids': {
    whenToUse: ['본문 그리드 아래에 합계 그리드를 따로 둘 때', '두 그리드의 컬럼 폭·스크롤을 함께 움직여야 할 때'],
  },
  'row-numbers': {
    whenToUse: ['목록에 순번 컬럼이 필요할 때 (데이터에 번호 필드가 없어도 됨)', '번호를 눌러 행 전체를 복사 범위로 잡을 때'],
    notes: ['번호는 정렬·필터 후의 표시 순서입니다. 데이터의 원래 순번이 필요하면 일반 컬럼을 쓰세요.'],
  },
  'col-span': {
    whenToUse: ['특정 행에서 여러 컬럼을 하나로 합쳐 보여줄 때 (구분 행, 긴 설명)'],
  },
  'column-hover': {
    badge: 'NEW',
    whenToUse: ['컬럼이 많은 표에서 지금 보는 세로줄을 놓치지 않게 할 때'],
  },

  // ─── 행 ─────────────────────────────
  'row-height': {
    whenToUse: ['메모처럼 긴 글을 줄바꿈해 모두 보여줄 때 — wrapText + autoHeight', '행 종류마다 높이가 다를 때 — getRowHeight'],
    notes: ['autoHeight 는 행마다 높이를 재야 해서 행이 아주 많으면 느려질 수 있습니다.'],
  },
  'pinned-rows': {
    whenToUse: ['합계 행을 항상 아래에 보여줄 때', '편집용 기본값 행을 맨 위에 고정할 때'],
    notes: ['고정 행 값은 그리드가 계산하지 않습니다. 자동 합계는 grandTotalRow 를 쓰세요.', '렌더마다 행 객체를 새로 만들면([{ ... }]) 편집한 값이 사라집니다. useState 등으로 같은 객체를 유지하세요.'],
  },
  'row-pinning': {
    badge: 'NEW',
    whenToUse: ['사용자가 비교하려는 행을 직접 위·아래에 붙여둘 때', '오류 행처럼 눈에 띄어야 할 행을 처음부터 위에 고정할 때 — isRowPinned'],
    notes: ['getRowId 가 없으면 rowData 를 통째로 바꿀 때 고정이 풀립니다.', '그룹 행·합계 행·pinnedTopRowData 행은 고정할 수 없습니다.', '고정 행 수에 제한이 없어서 많이 고정하면 본문이 그만큼 좁아집니다.'],
  },
  'row-drag': {
    whenToUse: ['우선순위처럼 행 순서를 사용자가 직접 정할 때'],
    notes: ['rowDragManaged 는 정렬·필터·행 그룹이 걸려 있으면 동작하지 않습니다 (순서가 정해져 있으므로).'],
  },
  'row-drop-zone': {
    badge: 'NEW',
    whenToUse: ['왼쪽 목록에서 오른쪽 목록으로 행을 끌어 옮길 때 (배정·선택 화면)', '휴지통 같은 그리드 밖 영역으로 끌어 지울 때'],
    notes: ['데이터를 실제로 옮기는 건 콜백에서 직접 합니다. 그리드는 위치(overIndex)만 알려줍니다.'],
  },
  'row-span': {
    whenToUse: ['같은 그룹의 여러 행에 걸친 값을 한 칸으로 보여줄 때'],
    notes: ['suppressRowTransform 과 함께 써야 합니다. 정렬하면 병합 범위가 어긋날 수 있으니 정렬을 막거나 cell-span 을 쓰세요.'],
  },
  'cell-span': {
    whenToUse: ['위아래로 같은 값이 반복되는 컬럼을 한 칸으로 합칠 때 (정렬해도 자동으로 다시 계산)'],
  },
  'full-width-rows': {
    whenToUse: ['목록 중간에 안내 배너·구분선 행을 넣을 때'],
  },
  'master-detail': {
    whenToUse: ['행을 펼쳐 하위 목록(이력·상세)을 같은 화면에서 볼 때'],
  },

  // ─── 셀 ─────────────────────────────
  'cell-rendering': {
    whenToUse: ['값을 표시용으로 바꿀 때 — valueFormatter (정렬·필터는 원래 값 기준)', '셀에 버튼·배지·링크를 넣을 때 — cellRenderer', '조건에 따라 색을 칠할 때 — cellClassRules'],
    notes: ['valueFormatter 결과가 CSV·엑셀에도 그대로 나갑니다.'],
  },
  tooltips: {
    whenToUse: ['잘린 긴 값을 마우스를 올려 볼 때', '헤더 이름만으로 뜻이 부족할 때 — headerTooltip'],
  },
  'cell-flash': {
    whenToUse: ['실시간 갱신 화면에서 바뀐 값을 눈에 띄게 할 때'],
  },
  sparklines: {
    whenToUse: ['행마다 추이(최근 n회 값)를 작은 그래프로 보여줄 때'],
  },
  find: {
    whenToUse: ['행을 거르지 않고 일치하는 셀만 강조해 찾아갈 때 (필터와 달리 다른 행도 그대로 보임)'],
  },

  // ─── 편집 ─────────────────────────────
  editing: {
    badge: 'UPDATE',
    whenToUse: ['목록에서 바로 값을 고칠 때', '정해진 값 중 하나를 고를 때 — r2SelectCellEditor / r2RichSelectCellEditor'],
    notes: ['선택 목록은 셀 아래(공간이 없으면 위)에 붙고, 셀을 스크롤해 화면 밖으로 내보내면 함께 가려집니다.', '편집 중 필터·데이터 변경으로 행이 사라지면 편집이 취소됩니다.'],
  },
  'full-row-edit': {
    whenToUse: ['한 행의 여러 값을 같이 고친 뒤 한 번에 저장할 때 — onRowValueChanged', '실수로 고친 값을 Ctrl+Z 로 되돌릴 때'],
  },
  'batch-edit': {
    badge: 'NEW',
    whenToUse: ['여러 행을 고친 뒤 "저장" 버튼으로 한 번에 서버에 보낼 때', '"취소" 로 고친 내용을 전부 버려야 할 때'],
    notes: ['보류 중인 값은 화면에만 보이고 rowData 에는 commitBatchEdit 전까지 반영되지 않습니다.'],
  },

  // ─── 선택 ─────────────────────────────
  'row-selection': {
    whenToUse: ['여러 행을 골라 삭제·실행할 때 — multiRow', '하나를 골라 상세를 보여줄 때 — singleRow'],
    notes: ['isRowSelectable 로 막은 행은 헤더 체크박스 전체 선택에서도 빠집니다.'],
  },
  'selection-column': {
    whenToUse: ['체크박스 컬럼을 고정하거나 폭을 바꿀 때', '트리·그룹 컬럼 안에 체크박스를 넣을 때 — checkboxLocation'],
  },
  'range-clipboard': {
    whenToUse: ['엑셀처럼 셀 범위를 복사·붙여넣기 할 때', '여러 셀 값을 한 번에 지울 때 — Delete'],
    notes: ['붙여넣기는 편집 가능한 셀에만 들어갑니다.'],
  },
  'fill-handle': {
    whenToUse: ['같은 값이나 1, 2, 3… 같은 연속 값을 여러 행에 채울 때'],
  },

  // ─── 필터 · 정렬 ─────────────────────────────
  sorting: {
    whenToUse: ['여러 기준으로 정렬할 때 — Shift+클릭', '코드값을 정해진 순서로 정렬할 때 — comparator'],
  },
  'column-filters': {
    whenToUse: ['컬럼 값으로 행을 거를 때', '코드값처럼 종류가 정해진 컬럼 — r2SetColumnFilter (체크 목록)'],
  },
  'floating-filters': {
    whenToUse: ['필터를 자주 쓰는 목록에서 메뉴를 열지 않고 바로 입력할 때'],
  },
  'custom-filter': {
    whenToUse: ['내장 필터로 안 되는 조건 UI (범위 슬라이더, 여러 필드 조합)'],
  },
  'quick-filter': {
    whenToUse: ['목록 위 검색창 하나로 전체 컬럼을 찾을 때'],
  },
  'external-filter': {
    whenToUse: ['그리드 밖의 탭·버튼(상태별 보기)으로 행을 거를 때'],
    notes: ['외부 상태가 바뀌면 api.onFilterChanged() 를 불러야 다시 거릅니다.'],
  },
  'advanced-filter': {
    whenToUse: ['여러 컬럼 조건을 AND/OR·괄호로 조합할 때'],
    notes: ['켜면 컬럼별 필터는 쓸 수 없습니다.'],
  },

  // ─── 그룹 · 피벗 ─────────────────────────────
  'row-grouping': {
    whenToUse: ['같은 값끼리 묶어 소계를 보여줄 때'],
  },
  'group-display': {
    whenToUse: ['그룹 단계마다 컬럼을 따로 둘 때 — multipleColumns', '그룹을 제목 행처럼 보여줄 때 — groupRows'],
  },
  'total-rows': {
    whenToUse: ['그룹마다 소계 행, 맨 아래 총합계 행이 필요할 때'],
  },
  'row-group-panel': {
    whenToUse: ['사용자가 직접 그룹 기준을 바꿔가며 볼 때'],
  },
  'tree-data': {
    whenToUse: ['메뉴·조직도처럼 부모-자식 경로가 있는 데이터'],
  },
  pivot: {
    whenToUse: ['연도·분기 같은 값을 컬럼으로 펼쳐 교차 집계할 때'],
  },
  'columns-tool-panel': {
    badge: 'NEW',
    whenToUse: ['사용자가 그룹·집계·피벗 기준을 끌어다 놓으며 분석할 때', '컬럼 표시와 순서를 목록에서 바꿀 때'],
  },

  // ─── 데이터 ─────────────────────────────
  'big-data': {
    whenToUse: ['수만~수십만 건을 한 번에 받아 화면에서 정렬·필터할 때'],
    notes: ['데이터가 서버에서 계속 늘어나면 SSRM 이 맞습니다.'],
  },
  transactions: {
    whenToUse: ['몇 행만 추가·수정·삭제됐을 때 전체를 다시 그리지 않고 반영', '스크롤·선택·펼침 상태를 유지한 채 갱신'],
    notes: ['update·remove 는 getRowId 로 행을 찾습니다. 없으면 같은 객체 참조여야 합니다.'],
  },
  'server-side': {
    badge: 'UPDATE',
    whenToUse: ['전체를 한 번에 받기엔 너무 많은 데이터 (서버가 정렬·필터·페이지 처리)', '저장 후 목록을 다시 요청하지 않고 바뀐 행만 반영할 때 — applyServerSideTransaction'],
    notes: [
      '트랜잭션은 이미 불러온 행에만 적용됩니다. 서버 데이터를 먼저 바꾼 뒤 그리드에 알려야 다음 로드와 어긋나지 않습니다.',
      '불러오는 중이면 applyServerSideTransaction 은 적용하지 않고 StoreLoading 을 돌려줍니다 — Async 판을 쓰세요.',
    ],
  },
  'server-side-group': {
    badge: 'NEW',
    whenToUse: ['그룹·소계를 서버(DB GROUP BY)가 계산해야 할 만큼 데이터가 많을 때', '그룹을 펼칠 때만 하위 행을 불러와 첫 화면을 가볍게 할 때'],
    notes: [
      '서버는 groupKeys 길이로 단계를 판단해 그룹 행(그룹 필드 + 집계값) 또는 리프 행을 돌려줘야 합니다.',
      '그룹 행 id 를 getRowId 로 직접 정할 땐 params.parentKeys 를 포함해 단계 사이에 겹치지 않게 하세요.',
      "groupSelects: 'descendants' 의 선택 상태는 행 목록이 아니라 그룹 트리입니다. 실제 대상 행은 서버가 이 트리와 같은 조건으로 계산해야 합니다 (getSelectedRows 는 불러온 행만).",
    ],
  },
  infinite: {
    whenToUse: ['전체 건수를 모르는 목록을 스크롤로 계속 불러올 때'],
  },
  pagination: {
    whenToUse: ['스크롤 대신 페이지 단위로 볼 때', '그리드 높이에 맞춰 페이지 크기를 정할 때 — paginationAutoPageSize'],
  },
  'grid-state': {
    badge: 'NEW',
    whenToUse: ['화면을 나갔다 와도 정렬·필터·컬럼·그룹 상태를 유지할 때', '"보기 저장" 처럼 상태를 이름 붙여 저장·불러올 때'],
    notes: ['전체 상태는 컬럼 24개 기준 약 2.7KB 입니다. 쿠키(4KB, 요청마다 전송)보다 localStorage·서버 저장이 맞습니다.'],
  },

  // ─── UI 구성 ─────────────────────────────
  'side-bar': {
    whenToUse: ['컬럼 표시·필터를 오른쪽 패널에서 관리할 때', '선택한 행의 상세를 옆 패널에 보여줄 때 — 커스텀 툴패널'],
  },
  'status-bar': {
    whenToUse: ['전체·선택 건수, 선택 범위 합계를 아래에 보여줄 때'],
  },
  'context-menu': {
    whenToUse: ['우클릭으로 행 단위 동작(상세·삭제·복사)을 제공할 때'],
  },
  'column-menu': {
    whenToUse: ['헤더 메뉴 항목을 화면에 맞게 줄이거나 추가할 때'],
  },
  overlays: {
    whenToUse: ['조회 중 로딩 표시, 결과 없음 안내 문구를 바꿀 때'],
  },
  'popup-parent': {
    whenToUse: ['작은 모달 안 그리드에서 메뉴·필터가 잘릴 때 — popupParent={document.body}'],
  },
  rtl: {
    whenToUse: ['아랍어·히브리어처럼 오른쪽에서 왼쪽으로 읽는 화면'],
  },

  // ─── 내보내기 · 차트 ─────────────────────────────
  'csv-export': {
    whenToUse: ['보이는 목록을 그대로 파일로 받을 때 (필터·정렬 반영)'],
  },
  'excel-export': {
    whenToUse: ['제목·합계·서식이 있는 엑셀 보고서', '여러 그리드를 시트별로 한 파일에 — exportMultipleSheetsAsExcel'],
  },
  'pivot-chart': {
    badge: 'NEW',
    whenToUse: ['피벗 결과(지역 × 연도 매출 등)를 표와 함께 그래프로 볼 때'],
    notes: ['피벗 모드가 켜져 있어야 만들어집니다 (아니면 undefined).', '항목은 현재 표시된 그룹 행 기준이라, 그룹을 펼치면 하위 그룹도 항목으로 추가됩니다.'],
  },
  'cross-filter-chart': {
    badge: 'NEW',
    whenToUse: ['대시보드처럼 차트를 눌러 목록을 거르고, 다른 차트도 같이 바뀌게 할 때'],
    notes: ['필터는 카테고리 컬럼의 Set 필터 모델로 걸립니다 (filterType: "set"). 컬럼 메뉴의 필터와 같은 상태입니다.', '전체 값(옅은 막대)은 필터와 무관한 모든 행 기준입니다.'],
  },
  'integrated-charts': {
    badge: 'UPDATE',
    whenToUse: ['선택한 범위를 바로 막대·선·원 그래프로 볼 때', '사용자가 차트 종류·계열·색을 직접 바꿔 보고 PNG 로 저장할 때 — 설정 패널(⚙)'],
    notes: ['설정 패널 버튼을 숨기려면 suppressChartToolPanelsButton. 꾸미기 값은 getChartModels()[i].chartOptions 로 읽을 수 있습니다.'],
  },

  // ─── CLM 화면 ─────────────────────────────
  'clm-all-in-one': { whenToUse: ['CLM 공통 Table 래퍼에서 기능이 함께 동작하는지 한 화면에서 확인할 때'] },
  'clm-workgroup-list': { whenToUse: ['컬럼 그룹 접기를 쓰는 CLM 목록 화면의 기준 예'] },
  'clm-user-group-role': { whenToUse: ['트리 + 체크 권한 화면의 기준 예'] },
  'clm-message-address': { whenToUse: ['그룹 체크로 하위 전체를 고르는 화면의 기준 예'] },
  'clm-workgroup-plan': { whenToUse: ['onGridReady 에서 SSRM 데이터소스를 지정하는 CLM 패턴'] },
  'clm-priority-condition': { whenToUse: ['행 드래그 정렬 + 상단 고정 편집 행 화면의 기준 예'] },
  'clm-destruction-control': { whenToUse: ['행 단위 편집과 되돌리기를 쓰는 설정 화면의 기준 예'] },
};

export default STORY_DOCS;
