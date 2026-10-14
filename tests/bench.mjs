// 성능 측정 (브라우저 없이 코어만): node tests/bench.mjs [행 수...]   기본 100000 500000
//  npm run bench -- 200000
const { GridCore } = await import('../src/grid/core/GridCore.js');

const sizes = process.argv.slice(2).map(Number).filter(Boolean);
if (!sizes.length) sizes.push(100_000, 500_000);

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const REGIONS = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원'];
const makeRows = n =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    region: REGIONS[i % 10],
    dept: `D${Math.floor(rnd() * 50)}`,
    name: `user_${Math.floor(rnd() * n)}`,
    amount: Math.round(rnd() * 1e6),
    month: `2026-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}`,
  }));

const cols = extra => [
  { field: 'id' },
  { field: 'region', filter: true },
  { field: 'dept' },
  { field: 'name' },
  { field: 'amount', aggFunc: 'sum', filter: 'r2NumberColumnFilter' },
  { field: 'month' },
  ...(extra || []),
];

const time = (label, fn, out) => {
  const t = performance.now();
  const r = fn();
  const ms = performance.now() - t;
  out.push([label, ms]);
  return r;
};

for (const n of sizes) {
  const rows = makeRows(n);
  const out = [];
  const mk = o => {
    const c = new GridCore({ rowData: rows, getRowId: p => String(p.data.id), columnDefs: cols(), ...o });
    c.setViewportSize(1200, 800);
    return c;
  };
  const c = time('생성 + rowData', () => mk({}), out);
  time('정렬: 숫자', () => c.api.applyColumnState({ state: [{ colId: 'amount', sort: 'desc' }], defaultState: { sort: null } }), out);
  time('정렬: 문자열', () => c.api.applyColumnState({ state: [{ colId: 'name', sort: 'asc' }], defaultState: { sort: null } }), out);
  time(
    '정렬 2개',
    () =>
      c.api.applyColumnState({
        state: [
          { colId: 'region', sort: 'asc' },
          { colId: 'amount', sort: 'desc' },
        ],
        defaultState: { sort: null },
      }),
    out,
  );
  c.api.applyColumnState({ defaultState: { sort: null } });
  time('숫자 필터', () => c.api.setFilterModel({ amount: { filterType: 'number', type: 'greaterThan', filter: 500000 } }), out);
  time('Set 필터', () => c.api.setFilterModel({ region: { filterType: 'set', values: ['서울', '부산'] } }), out);
  c.api.setFilterModel(null);
  time('빠른 검색 (처음)', () => c.api.setGridOption('quickFilterText', 'user_1'), out);
  time('빠른 검색 (다음 글자)', () => c.api.setGridOption('quickFilterText', 'user_12'), out);
  c.api.setGridOption('quickFilterText', '');
  time('트랜잭션: 1,000행 수정', () => c.api.applyTransaction({ update: rows.slice(0, 1000).map(r => ({ ...r, amount: r.amount + 1 })) }), out);
  time(
    'rowData 교체 (getRowId 갱신)',
    () =>
      c.api.setGridOption(
        'rowData',
        rows.map(r => ({ ...r })),
      ),
    out,
  );

  const g = time(
    '그룹 2단계 + 합계 (생성)',
    () => mk({ columnDefs: cols().map(x => (x.field === 'region' || x.field === 'dept' ? { ...x, rowGroup: true, hide: true } : x)) }),
    out,
  );
  time('그룹: 숫자 정렬', () => g.api.applyColumnState({ state: [{ colId: 'amount', sort: 'desc' }] }), out);
  time('그룹: 전체 펼치기', () => g.api.expandAll(), out);
  time('그룹: 필터', () => g.api.setFilterModel({ amount: { filterType: 'number', type: 'greaterThan', filter: 500000 } }), out);
  time('그룹: 값 1개 편집 (재집계)', () => g.api.getRowNode('5').setDataValue('amount', 1), out);

  time(
    '피벗 지역 × 월 (생성)',
    () =>
      mk({ pivotMode: true, columnDefs: cols().map(x => (x.field === 'dept' ? { ...x, rowGroup: true } : x.field === 'month' ? { ...x, pivot: true } : x)) }),
    out,
  );

  const vg = [{ colId: 'calc', valueGetter: p => p.data.amount * 1.1 + p.data.id }];
  const v0 = mk({ columnDefs: cols(vg) });
  time('valueGetter 정렬 (캐시 없음)', () => v0.api.applyColumnState({ state: [{ colId: 'calc', sort: 'asc' }] }), out);
  const v1 = mk({ columnDefs: cols(vg), valueCache: true });
  v1.api.applyColumnState({ state: [{ colId: 'calc', sort: 'asc' }] });
  time('valueGetter 정렬 (valueCache, 두 번째)', () => v1.api.applyColumnState({ state: [{ colId: 'calc', sort: 'desc' }] }), out);

  console.log(`\n── ${n.toLocaleString()}행 ──`);
  for (const [label, ms] of out) console.log(`${label.padEnd(34)} ${ms.toFixed(0).padStart(7)} ms`);
}
