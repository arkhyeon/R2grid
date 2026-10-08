import start from './start.jsx';
import data from './data.jsx';
import columns from './columns.jsx';
import rows from './rows.jsx';
import cells from './cells.jsx';
import filters from './filters.jsx';
import grouping from './grouping.jsx';
import server from './server.jsx';
import ui from './ui.jsx';
import exporting from './export.jsx';
import clm from './clm.jsx';
import advanced from './advanced.jsx';

// 메뉴 분류 — 대메뉴 › 중메뉴 › 소메뉴(스토리). 기능 문서 일반 분류(컬럼/행/셀/편집/선택/필터/그룹/데이터/UI/내보내기)를 따름.
// 순서 = 이 표의 순서. 이름은 메뉴용으로 짧게 (상세 제목·설명은 각 스토리).
const MENU = [
  ['시작하기', '기본', 'quick-start', '기본 그리드'],
  ['시작하기', '테마 · 로케일', 'theme', '테마 · 다크'],
  ['시작하기', '테마 · 로케일', 'locale', '로케일'],

  ['컬럼', '정의', 'column-defs', '컬럼 정의'],
  ['컬럼', '헤더 · 그룹', 'column-groups', '그룹 · 접기'],
  ['컬럼', '크기 · 위치', 'column-sizing', '크기 조절'],
  ['컬럼', '크기 · 위치', 'column-state', '이동 · 숨김'],
  ['컬럼', '크기 · 위치', 'aligned-grids', '그리드 정렬 연동'],
  ['컬럼', '특수 컬럼', 'row-numbers', '행 번호'],
  ['컬럼', '표시', 'col-span', '컬럼 병합'],
  ['컬럼', '표시', 'column-hover', '호버 강조'],

  ['행', '높이 · 고정', 'row-height', '행 높이'],
  ['행', '높이 · 고정', 'pinned-rows', '고정 행'],
  ['행', '높이 · 고정', 'row-pinning', '수동 고정'],
  ['행', '드래그', 'row-drag', '행 드래그'],
  ['행', '드래그', 'row-drop-zone', '그리드 간 이동'],
  ['행', '병합 · 전체 폭', 'row-span', '행 병합'],
  ['행', '병합 · 전체 폭', 'cell-span', '같은 값 병합'],
  ['행', '병합 · 전체 폭', 'full-width-rows', '전체 폭 행'],
  ['행', '마스터 / 디테일', 'master-detail', '마스터 / 디테일'],

  ['셀', '표시', 'cell-rendering', '렌더러 · 스타일'],
  ['셀', '표시', 'tooltips', '툴팁'],
  ['셀', '표시', 'cell-flash', '변경 강조'],
  ['셀', '표시', 'sparklines', '스파크라인'],
  ['셀', '찾기', 'find', '찾기'],

  ['편집', '셀 편집', 'editing', '내장 에디터'],
  ['편집', '행 편집', 'full-row-edit', '행 편집 · 되돌리기'],
  ['편집', '행 편집', 'batch-edit', '일괄 편집'],

  ['선택', '행 선택', 'row-selection', '행 선택'],
  ['선택', '행 선택', 'selection-column', '체크박스 컬럼'],
  ['선택', '셀 범위', 'range-clipboard', '범위 · 클립보드'],
  ['선택', '셀 범위', 'fill-handle', '채우기 핸들'],

  ['필터 · 정렬', '정렬', 'sorting', '정렬'],
  ['필터 · 정렬', '컬럼 필터', 'column-filters', '필터 종류'],
  ['필터 · 정렬', '컬럼 필터', 'floating-filters', '플로팅 필터'],
  ['필터 · 정렬', '컬럼 필터', 'custom-filter', '커스텀 필터'],
  ['필터 · 정렬', '그리드 필터', 'quick-filter', '빠른 검색'],
  ['필터 · 정렬', '그리드 필터', 'external-filter', '외부 필터'],
  ['필터 · 정렬', '그리드 필터', 'advanced-filter', '고급 필터'],

  ['그룹 · 피벗', '행 그룹', 'row-grouping', '그룹 · 집계'],
  ['그룹 · 피벗', '행 그룹', 'group-display', '표시 방식'],
  ['그룹 · 피벗', '행 그룹', 'total-rows', '합계 행'],
  ['그룹 · 피벗', '행 그룹', 'row-group-panel', '그룹 패널'],
  ['그룹 · 피벗', '트리', 'tree-data', '트리 데이터'],
  ['그룹 · 피벗', '피벗', 'pivot', '피벗'],
  ['그룹 · 피벗', '피벗', 'columns-tool-panel', '툴패널 · 드롭 영역'],

  ['데이터', '클라이언트', 'big-data', '대용량'],
  ['데이터', '클라이언트', 'transactions', '트랜잭션'],
  ['데이터', '서버', 'server-side', '서버 사이드'],
  ['데이터', '서버', 'infinite', '무한 스크롤'],
  ['데이터', '페이지 · 상태', 'pagination', '페이지네이션'],
  ['데이터', '페이지 · 상태', 'grid-state', '상태 저장 · 복원'],

  ['UI 구성', '패널', 'side-bar', '사이드바'],
  ['UI 구성', '패널', 'status-bar', '상태 표시줄'],
  ['UI 구성', '메뉴', 'context-menu', '컨텍스트 메뉴'],
  ['UI 구성', '메뉴', 'column-menu', '컬럼 메뉴'],
  ['UI 구성', '레이아웃', 'overlays', '오버레이'],
  ['UI 구성', '레이아웃', 'popup-parent', '팝업 위치'],
  ['UI 구성', '레이아웃', 'rtl', 'RTL'],

  ['내보내기 · 차트', '내보내기', 'csv-export', 'CSV'],
  ['내보내기 · 차트', '내보내기', 'excel-export', 'Excel'],
  ['내보내기 · 차트', '차트', 'integrated-charts', '범위 차트'],

  ['CLM 화면', '화면 재현', 'clm-all-in-one', '종합 데모'],
  ['CLM 화면', '화면 재현', 'clm-workgroup-list', '업무 그룹 목록'],
  ['CLM 화면', '화면 재현', 'clm-user-group-role', '그룹 권한 트리'],
  ['CLM 화면', '화면 재현', 'clm-message-address', '메시지 주소록'],
  ['CLM 화면', '화면 재현', 'clm-workgroup-plan', '실행 계획'],
  ['CLM 화면', '화면 재현', 'clm-priority-condition', '우선순위 · 조건'],
  ['CLM 화면', '화면 재현', 'clm-destruction-control', '파기 임계 설정'],
];

const ALL = [...start, ...data, ...columns, ...rows, ...cells, ...filters, ...grouping, ...server, ...ui, ...exporting, ...clm, ...advanced];
const byId = new Map(ALL.map(s => [s.id, s]));

// title = 원래(상세) 이름, name = 메뉴용 짧은 이름
export const STORIES = MENU.map(([category, group, id, name]) => {
  const s = byId.get(id);
  if (!s) throw new Error(`스토리 없음: ${id}`);
  return { ...s, category, group, name, title: s.name };
});
const missing = ALL.filter(s => !MENU.some(m => m[2] === s.id)).map(s => s.id);
if (missing.length) console.warn('[playground] 메뉴에 없는 스토리:', missing);

export const CATEGORIES = [...new Set(STORIES.map(s => s.category))];
