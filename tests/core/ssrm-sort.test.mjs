// SSRM 서버 그룹 / 서버 트리 검증 (헤드리스)
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

const ROWS = [];
['KR', 'US', 'JP'].forEach((country, ci) => ['A', 'B'].forEach(dept => {
  for (let i = 0; i < 5; i++) ROWS.push({ id: `${country}-${dept}-${i}`, country, dept, amt: (ci + 1) * 10 + i });
}));
const reqs = [];
// 가짜 서버: groupKeys 단계에 맞춰 그룹 행(집계 포함) 또는 리프 반환
const server = {
  getRows(p) {
    const r = p.request;
    reqs.push(`${JSON.stringify(r.groupKeys)} ${r.startRow}-${r.endRow} g=${r.rowGroupCols.map(c => c.id).join(',')} v=${r.valueCols.map(c => c.id + ':' + c.aggFunc).join(',')}`);
    let rows = ROWS.filter(x => r.groupKeys.every((k, i) => x[r.rowGroupCols[i].field] === k));
    const lvl = r.groupKeys.length;
    let out;
    if (lvl < r.rowGroupCols.length) {
      const f = r.rowGroupCols[lvl].field;
      const map = new Map();
      rows.forEach(x => {
        const g = map.get(x[f]) || { [f]: x[f], amt: 0, count: 0 };
        g.amt += x.amt;
        g.count++;
        map.set(x[f], g);
      });
      out = [...map.values()];
    } else out = rows;
    if (r.sortModel[0]?.colId === 'amt') out.sort((a, b) => (a.amt - b.amt) * (r.sortModel[0].sort === 'asc' ? 1 : -1));
    setTimeout(() => p.success({ rowData: out.slice(r.startRow, r.endRow), rowCount: out.length }), 0);
  },
};
const mk = extra => {
  const c = new GridCore({
    columnDefs: [{ field: 'country', rowGroup: true, hide: true }, { field: 'dept', rowGroup: true, hide: true }, { field: 'id' }, { field: 'amt', aggFunc: 'sum' }],
    rowModelType: 'serverSide',
    serverSideDatasource: server,
    getChildCount: d => d.count,
    ...extra,
  });
  c.setViewportSize(800, 600);
  return c;
};
const show = c => c.displayedNodes.map(n => (n.stub ? 'S' : n.group ? `${'  '.repeat(n.level)}G:${n.key}` : `${'  '.repeat(n.level)}${n.data.id}`));
const load = async c => {
  for (let k = 0; k < 6; k++) {
    c.ssrmEnsureRows(0, c.displayedNodes.length - 1);
    await tick();
  }
};


const open2 = async c => {
  await load(c);
  c.displayedNodes[0].setExpanded(true);
  await load(c);
  c.displayedNodes[1].setExpanded(true);
  await load(c);
};
// 기본: 리프에만 영향 주는 정렬(id) → 리프 스토어만 다시 요청, 펼침 유지
let g = mk();
await open2(g);
reqs.length = 0;
g.api.applyColumnState({ state: [{ colId: 'id', sort: 'desc' }] });
await load(g);
check('id 정렬: 리프만 재요청', reqs.map(r => r.split(' ')[0]), ['["KR","A"]']);
check('펼침 유지', show(g).slice(0, 3), ['G:KR', '  G:A', '    KR-A-0']);
// 집계 컬럼(amt) 정렬: 그룹 단계도 영향 → 전부
reqs.length = 0;
g.api.applyColumnState({ state: [{ colId: 'amt', sort: 'desc' }], defaultState: { sort: null } });
await load(g);
check('amt 정렬: 전부 재요청', reqs.map(r => r.split(' ')[0]).sort(), ['["KR","A"]', '["KR"]', '[]']);
check('amt 내림차순 그룹', show(g).filter(x => x.startsWith('G:')), ['G:JP', 'G:US', 'G:KR']);
// serverSideSortAllLevels: id 정렬도 전부
g = mk({ serverSideSortAllLevels: true });
await open2(g);
reqs.length = 0;
g.api.applyColumnState({ state: [{ colId: 'id', sort: 'desc' }] });
await load(g);
check('serverSideSortAllLevels', reqs.length >= 3, true);
// serverSideEnableClientSideSort: 다 불러왔으면 요청 없이 정렬
g = mk({ serverSideEnableClientSideSort: true });
await open2(g);
reqs.length = 0;
g.api.applyColumnState({ state: [{ colId: 'id', sort: 'desc' }] });
await load(g);
check('클라이언트 정렬: 요청 없음', reqs.length, 0);
check('클라이언트 정렬 결과', show(g).slice(0, 4), ['G:KR', '  G:A', '    KR-A-4', '    KR-A-3']);
g.api.applyColumnState({ state: [{ colId: 'amt', sort: 'desc' }], defaultState: { sort: null } });
await load(g);
check('클라이언트 정렬: 그룹도 집계값으로', show(g).filter(x => x.startsWith('G:')), ['G:JP', 'G:US', 'G:KR', '  G:B', '  G:A'].slice(0, 3).concat([]), );
g.api.applyColumnState({ defaultState: { sort: null } });
await load(g);
check('정렬 해제 → 서버 순서', show(g).slice(0, 3), ['G:KR', '  G:A', '    KR-A-0']);
// serverSideOnlyRefreshFilteredGroups: 2단계 그룹 컬럼(dept) 필터 → 2단계 스토어만
g = mk({ serverSideOnlyRefreshFilteredGroups: true });
await open2(g);
reqs.length = 0;
g.api.setColumnFilterModel('dept', { filterType: 'text', type: 'equals', filter: 'B' });
g.api.onFilterChanged?.();
await load(g);
check('그룹 컬럼 필터: 그 단계(+펼쳐 둔 하위)만, 최상위 재요청 없음', reqs.map(r => r.split(' ')[0]), ['["KR"]', '["KR","A"]']);
check('최상위 유지', show(g).filter(x => x.startsWith('G:')).length, 3);
reqs.length = 0;
g.api.setColumnFilterModel('id', { filterType: 'text', type: 'contains', filter: '1' });
g.api.onFilterChanged();
await load(g);
check('리프 컬럼 필터: 전부', reqs.some(r => r.startsWith('[] ')), true);
