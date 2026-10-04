// 플레이그라운드 공용 샘플 데이터 (결정적 생성 — 새로고침해도 같은 값)
const DBMS = ['Oracle', 'MySQL', 'PostgreSQL', 'Tibero', 'MSSQL'];
const STATUS = ['대기', '진행', '완료', '오류'];
const DEPT = ['개발1팀', '개발2팀', '운영팀', '보안팀'];
const REGION = ['서울', '부산', '대구', '광주', '대전'];

let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

export function makeRows(n, start = 0) {
  seed = 7 + start;
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const id = start + i + 1;
    rows[i] = {
      id,
      taskName: `작업_${String(id).padStart(6, '0')}`,
      dbms: DBMS[i % DBMS.length],
      owner: `USER_${(i * 7) % 120}`,
      dept: DEPT[(i * 3) % DEPT.length],
      region: REGION[(i * 5) % REGION.length],
      rowCnt: Math.round(rnd() * 5_000_000),
      progress: Math.round(rnd() * 100),
      status: STATUS[i % STATUS.length],
      useYn: i % 3 !== 0,
      amount: Math.round(rnd() * 100000) / 100,
      updatedAt: new Date(2026, 0, 1 + (i % 270)).toISOString().slice(0, 10),
      history: Array.from({ length: 12 }, () => Math.round(rnd() * 100)),
    };
  }
  return rows;
}

export const SAMPLE = makeRows(200);

// 트리 데이터 (조직 → 팀 → 사람)
export const TREE = [
  { path: ['본사'], headcount: null, budget: null },
  { path: ['본사', '개발본부'], headcount: null, budget: null },
  { path: ['본사', '개발본부', '개발1팀'], headcount: 12, budget: 820 },
  { path: ['본사', '개발본부', '개발2팀'], headcount: 9, budget: 610 },
  { path: ['본사', '운영본부'], headcount: null, budget: null },
  { path: ['본사', '운영본부', '운영팀'], headcount: 7, budget: 400 },
  { path: ['본사', '운영본부', '보안팀'], headcount: 4, budget: 380 },
  { path: ['지사'], headcount: null, budget: null },
  { path: ['지사', '부산지사'], headcount: 6, budget: 300 },
  { path: ['지사', '대구지사'], headcount: 5, budget: 250 },
];

// 피벗/그룹용 판매 데이터
export const SALES = (() => {
  seed = 99;
  const out = [];
  const products = ['노트북', '모니터', '키보드'];
  for (const region of REGION.slice(0, 3)) {
    for (const year of [2024, 2025]) {
      for (const product of products) {
        for (let q = 1; q <= 2; q++) {
          out.push({ region, year, product, quarter: `Q${q}`, qty: Math.round(rnd() * 90) + 10, sales: Math.round(rnd() * 9000) + 1000 });
        }
      }
    }
  }
  return out;
})();

export const BASE_COLUMNS = [
  { field: 'id', headerName: 'ID', width: 80 },
  { field: 'taskName', headerName: '작업명', width: 150 },
  { field: 'dbms', headerName: 'DBMS', width: 110 },
  { field: 'owner', headerName: '소유자', width: 110 },
  { field: 'rowCnt', headerName: '행 수', width: 120, type: 'numericColumn', valueFormatter: p => (p.value == null ? '' : p.value.toLocaleString()) },
  { field: 'status', headerName: '상태', width: 90 },
  { field: 'updatedAt', headerName: '수정일', width: 120 },
];
