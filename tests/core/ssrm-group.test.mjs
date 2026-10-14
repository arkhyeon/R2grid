// SSRM 서버 그룹 / 서버 트리 검증 (헤드리스)
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

const ROWS = [];
['KR', 'US', 'JP'].forEach((country, ci) =>
  ['A', 'B'].forEach(dept => {
    for (let i = 0; i < 5; i++) ROWS.push({ id: `${country}-${dept}-${i}`, country, dept, amt: (ci + 1) * 10 + i });
  }),
);
const reqs = [];
// 가짜 서버: groupKeys 단계에 맞춰 그룹 행(집계 포함) 또는 리프 반환
const server = {
  getRows(p) {
    const r = p.request;
    reqs.push(
      `${JSON.stringify(r.groupKeys)} ${r.startRow}-${r.endRow} g=${r.rowGroupCols.map(c => c.id).join(',')} v=${r.valueCols.map(c => c.id + ':' + c.aggFunc).join(',')}`,
    );
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
    columnDefs: [
      { field: 'country', rowGroup: true, hide: true },
      { field: 'dept', rowGroup: true, hide: true },
      { field: 'id' },
      { field: 'amt', aggFunc: 'sum' },
    ],
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

const c = mk();
await load(c);
check('최상위 그룹', show(c), ['G:KR', 'G:US', 'G:JP']);
check('요청 모양', reqs[0], '[] 0-100 g=country,dept v=amt:sum');
check('자동 그룹 컬럼', !!c.allColumns.find(x => x.autoType === 'group'), true);
const kr = c.displayedNodes[0];
check(
  '그룹 노드',
  [
    kr.group,
    kr.isExpandable(),
    kr.level,
    kr.allChildrenCount,
    c.getCellValue(kr, c.getColumn('amt')),
    c.getCellValue(
      kr,
      c.allColumns.find(x => x.autoType === 'group'),
    ),
  ],
  [true, true, 0, 10, 120, 'KR'],
);
kr.setExpanded(true);
check('펼치면 로딩 행', show(c), ['G:KR', 'S', 'G:US', 'G:JP']);
await load(c);
check('2단계 그룹', show(c), ['G:KR', '  G:A', '  G:B', 'G:US', 'G:JP']);
check('2단계 요청', reqs.at(-1), '["KR"] 0-100 g=country,dept v=amt:sum');
c.displayedNodes[1].setExpanded(true);
await load(c);
check('리프', show(c).slice(0, 4), ['G:KR', '  G:A', '    KR-A-0', '    KR-A-1']);
check('리프 부모', c.displayedNodes[2].parent?.key, 'A');
check(
  '스토어 목록',
  c.getServerSideGroupLevelState().map(s => [s.route, s.rowCount]),
  [
    [[], 3],
    [['KR'], 2],
    [['KR', 'A'], 5],
  ],
);
// 접기 / 다시 펼치기 (캐시 유지 — 재요청 없음)
const n0 = reqs.length;
kr.setExpanded(false);
check('접기', show(c), ['G:KR', 'G:US', 'G:JP']);
kr.setExpanded(true);
await load(c);
check('다시 펼침 캐시', [show(c).length, reqs.length - n0], [10, 0]);
// 정렬 → 전체 다시 요청, 펼침 유지
c.api.applyColumnState({ state: [{ colId: 'amt', sort: 'desc' }] });
await load(c);
check('정렬 후 펼침 유지', show(c).slice(0, 4), ['G:JP', 'G:US', 'G:KR', '  G:A']);
// route 트랜잭션
{
  const res = c.api.applyServerSideTransaction({ route: ['KR', 'A'], add: [{ id: 'KR-A-new', country: 'KR', dept: 'A', amt: 1 }], addIndex: 0 });
  check('route 트랜잭션', [res.status, show(c).includes('    KR-A-new')], ['Applied', true]);
  const miss = c.api.applyServerSideTransaction({ route: ['JP', 'A'], add: [{ id: 'x' }] });
  check('안 펼친 route', miss.status, 'StoreNotFound');
}
// route refresh (purge) → 그 스토어만 다시 요청
const n1 = reqs.length;
c.api.refreshServerSide({ route: ['KR'], purge: true });
await load(c);
check(
  'route purge 요청',
  reqs.slice(n1).map(x => x.split(' ')[0]),
  ['["KR"]', '["KR","A"]'],
);
// 그룹 컬럼 바꾸면 펼침 초기화
c.api.setRowGroupColumns(['dept']);
await load(c);
check('그룹 변경', show(c), ['G:A', 'G:B']);
// groupDefaultExpanded
const d = mk({ groupDefaultExpanded: 1 });
await load(d);
check('groupDefaultExpanded=1', show(d).slice(0, 4), ['G:KR', '  G:A', '  G:B', 'G:US']);

// 서버 트리
const TREE = {
  '': [
    { id: 'a', name: 'A', kids: true },
    { id: 'b', name: 'B', kids: false },
  ],
  a: [
    { id: 'a1', name: 'A1', kids: false },
    { id: 'a2', name: 'A2', kids: true },
  ],
  a2: [{ id: 'a2x', name: 'A2X', kids: false }],
};
const t = new GridCore({
  columnDefs: [{ field: 'name' }],
  rowModelType: 'serverSide',
  treeData: true,
  isServerSideGroup: d => d.kids,
  getServerSideGroupKey: d => d.id,
  getRowId: p => p.data.id,
  serverSideDatasource: {
    getRows: p =>
      setTimeout(
        () => p.success({ rowData: TREE[p.request.groupKeys.at(-1) ?? ''] || [], rowCount: (TREE[p.request.groupKeys.at(-1) ?? ''] || []).length }),
        0,
      ),
  },
});
t.setViewportSize(800, 600);
await load(t);
const auto = t.allColumns.find(x => x.autoType === 'group');
check('트리 자동 컬럼 + 키', [!!auto, t.displayedNodes.map(n => t.getCellValue(n, auto))], [true, ['a', 'b']]);
t.api.getRowNode('a').setExpanded(true);
await load(t);
t.api.getRowNode('a2').setExpanded(true);
await load(t);
check(
  '트리 펼침',
  t.displayedNodes.map(n => `${n.level}:${n.data.name}${n.group ? '+' : ''}`),
  ['0:A+', '1:A1', '1:A2+', '2:A2X', '0:B'],
);

// ── 그룹 선택 (groupSelects: 'descendants') ──
const s = mk({
  rowSelection: { mode: 'multiRow', groupSelects: 'descendants' },
  getRowId: p => p.data.id ?? [...p.parentKeys, p.data.dept ?? p.data.country].join('/'),
});
await load(s);
const KR = s.api.getRowNode('KR');
KR.setExpanded(true);
await load(s);
// 그룹 체크 → 안 불러온 하위까지 선택
s.handleCheckboxClick(KR);
check('그룹 체크', [s.getGroupSelectionState(KR), s.api.getRowNode('KR/A').selected], [true, true]);
check('선택 상태 모양', s.api.getServerSideSelectionState(), {
  selectAllChildren: false,
  toggledNodes: [{ nodeId: 'KR', selectAllChildren: true, toggledNodes: [] }],
});
s.api.getRowNode('KR/A').setExpanded(true);
await load(s);
check('나중에 불러온 리프도 선택', s.api.getRowNode('KR-A-3').selected, true);
// 리프 하나 해제 → 부모 그룹들 일부(null)
s.handleCheckboxClick(s.api.getRowNode('KR-A-3'));
check(
  '리프 해제 → 부모 일부',
  [s.getGroupSelectionState(s.api.getRowNode('KR/A')), s.getGroupSelectionState(KR), s.getHeaderCheckboxState()],
  [null, null, null],
);
check('트리 상태', s.api.getServerSideSelectionState().toggledNodes[0].toggledNodes[0], {
  nodeId: 'KR/A',
  selectAllChildren: true,
  toggledNodes: [{ nodeId: 'KR-A-3', selectAllChildren: false, toggledNodes: [] }],
});
// 다시 체크 → 정리되어 원래 모양
s.handleCheckboxClick(s.api.getRowNode('KR-A-3'));
check('정리', s.api.getServerSideSelectionState(), { selectAllChildren: false, toggledNodes: [{ nodeId: 'KR', selectAllChildren: true, toggledNodes: [] }] });
// 전체 선택 → 헤더 true, JP(안 펼침)도 선택
s.api.selectAll();
check('전체 선택', [s.getHeaderCheckboxState(), s.getGroupSelectionState(s.api.getRowNode('JP'))], [true, true]);
// 상태 저장 → 복원
s.handleCheckboxClick(s.api.getRowNode('US'));
const saved = s.api.getState().rowSelection;
check('getState', saved, { selectAllChildren: true, toggledNodes: [{ nodeId: 'US', selectAllChildren: false, toggledNodes: [] }] });
const s2 = mk({
  rowSelection: { mode: 'multiRow', groupSelects: 'descendants' },
  getRowId: p => p.data.id ?? [...p.parentKeys, p.data.dept ?? p.data.country].join('/'),
  initialState: { rowSelection: saved },
});
await load(s2);
check(
  '복원',
  ['KR', 'US', 'JP'].map(k => s2.getGroupSelectionState(s2.api.getRowNode(k))),
  [true, false, true],
);
