// 기본 한국어 로케일. 화면에서 localeText(AG_GRID_LOCALE_KR 등)를 넘기면 그 값이 우선한다.
export const AG_GRID_LOCALE_KR = {
  // 오버레이
  loadingOoo: '로딩 중...',
  noRowsToShow: '표시할 행이 없습니다',
  loadingError: '오류',

  // Set 필터
  selectAll: '(모두 선택)',
  selectAllSearchResults: '(모든 검색 결과 선택)',
  searchOoo: '검색...',
  blanks: '(빈 값)',
  noMatches: '일치하는 항목 없음',

  // 공통 필터
  filterOoo: '필터...',
  equals: '같음',
  notEqual: '같지 않음',
  blank: '비어 있음',
  notBlank: '비어 있지 않음',
  empty: '선택...',
  lessThan: '미만',
  greaterThan: '초과',
  lessThanOrEqual: '이하',
  greaterThanOrEqual: '이상',
  inRange: '범위',
  inRangeStart: '부터',
  inRangeEnd: '까지',
  contains: '포함',
  notContains: '포함하지 않음',
  startsWith: '시작 값',
  endsWith: '끝 값',
  before: '이전',
  after: '이후',
  andCondition: '그리고',
  orCondition: '또는',
  applyFilter: '적용',
  resetFilter: '재설정',
  clearFilter: '지우기',
  cancelFilter: '취소',
  textFilter: '텍스트 필터',
  numberFilter: '숫자 필터',
  dateFilter: '날짜 필터',
  setFilter: '세트 필터',

  // 그룹
  group: '그룹',
  rowGroupColumnsEmptyMessage: '여기로 끌어서 그룹 설정',

  // 컬럼 메뉴
  pinColumn: '열 고정',
  pinLeft: '왼쪽 고정',
  pinRight: '오른쪽 고정',
  noPin: '고정 해제',
  autosizeThiscolumn: '이 열 크기 자동 맞춤',
  autosizeAllColumns: '모든 열 크기 자동 맞춤',
  resetColumns: '열 초기화',
  columnFilter: '열 필터',
  columnChooser: '열 선택',
  sortAscending: '오름차순 정렬',
  sortDescending: '내림차순 정렬',
  sortUnSort: '정렬 해제',
  columns: '열',
  filters: '필터',
  searchColumns: '열 검색...',

  // 컨텍스트 메뉴
  copy: '복사',
  copyWithHeaders: '헤더 포함 복사',
  copyWithGroupHeaders: '그룹 헤더 포함 복사',
  cut: '잘라내기',
  paste: '붙여넣기',
  ctrlC: 'Ctrl+C',
  ctrlX: 'Ctrl+X',
  ctrlV: 'Ctrl+V',
  export: '내보내기',
  csvExport: 'CSV 내보내기',
  excelExport: 'Excel 내보내기',
  expandAll: '모두 펼치기',
  collapseAll: '모두 접기',

  // 페이지네이션
  page: '페이지',
  more: '더 보기',
  to: '~',
  of: '/',
  next: '다음',
  last: '마지막',
  first: '처음',
  previous: '이전',
  pageSizeSelectorLabel: '페이지 크기:',
  pageLastRowUnknown: '?',

  // 상태 표시줄
  totalAndFilteredRows: '행',
  totalRows: '총 행',
  filteredRows: '필터링됨',
  selectedRows: '선택됨',
  sum: '합계',
  min: '최소',
  max: '최대',
  count: '개수',
  avg: '평균',
};

export function localeText(core, key, defaultValue) {
  const custom = core.get('localeText');
  if (custom && custom[key] != null) return custom[key];
  const fn = core.get('getLocaleText');
  if (typeof fn === 'function') {
    const r = fn({ key, defaultValue: AG_GRID_LOCALE_KR[key] ?? defaultValue, api: core.api });
    if (r != null) return r;
  }
  return AG_GRID_LOCALE_KR[key] ?? defaultValue ?? key;
}
