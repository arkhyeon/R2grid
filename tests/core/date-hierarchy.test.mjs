import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const rows = [
  { d: '2025-11-03', v: 1 },
  { d: '2026-01-15', v: 2 },
  { d: '2026-01-20', v: 3 },
  { d: '2026-04-02', v: 4 },
  { d: new Date(2025, 10, 30), v: 5 },
];
const show = g => g.displayedNodes.map(n => (n.group ? `${'  '.repeat(n.level)}${n.key}(${n.aggData?.v ?? ''})` : `${'  '.repeat(n.level)}${n.data.v}`));
let g = new GridCore({
  columnDefs: [
    { field: 'd', rowGroup: true, hide: true, groupHierarchy: ['year', 'month'] },
    { field: 'v', aggFunc: 'sum' },
  ],
  rowData: rows,
  groupDefaultExpanded: -1,
});
g.setViewportSize(800, 600);
check('연 → 월', show(g), ['2025(6)', '  11(6)', '    1', '    5', '2026(9)', '  1(5)', '    2', '    3', '  4(4)', '    4']);
check(
  '그룹 컬럼 목록은 원본 그대로',
  g.api.getRowGroupColumns().map(c => c.colId),
  ['d'],
);
check('상태 저장도 원본', g.api.getState().rowGroup, { groupColIds: ['d'] });
g.api.applyColumnState({ state: [{ colId: 'd', sort: 'desc' }] });
check(
  '원본 컬럼 정렬 → 계층 그룹 내림차순',
  show(g)
    .filter(x => !x.trim().match(/^\d$/))
    .slice(0, 3),
  ['2026(9)', '  4(4)', '  1(5)'],
);
// 분기·formattedMonth·사용자 정의
g = new GridCore({
  groupHierarchyConfig: { half: { headerName: '반기', valueGetter: p => (new Date(p.data.d).getMonth() < 6 ? '상반기' : '하반기') } },
  columnDefs: [
    { field: 'd', rowGroup: true, hide: true, groupHierarchy: ['year', 'half', 'quarter', 'formattedMonth'] },
    { field: 'v', aggFunc: 'sum' },
  ],
  rowData: rows,
  groupDefaultExpanded: -1,
});
g.setViewportSize(800, 600);
check(
  '사용자 단계 + 분기 + 월 이름',
  show(g)
    .filter(x => x.includes('('))
    .slice(0, 4),
  ['2025(6)', '  하반기(6)', '    4(6)', '      11월(6)'],
);
const top = g.displayedNodes[0];
check('그룹 노드 컬럼 이름', g.getDisplayName(top.rowGroupColumn), 'D (연)');
const many = Array.from({ length: 12 }, (_, i) => ({ d: `2026-${String(12 - i).padStart(2, '0')}-01`, v: 1 }));
g = new GridCore({ columnDefs: [{ field: 'd', rowGroup: true, hide: true, sort: 'asc', groupHierarchy: ['formattedMonth'] }, { field: 'v' }], rowData: many });
g.setViewportSize(800, 600);
check('월 이름도 월 순서로 정렬', g.displayedNodes.map(n => n.key).slice(8, 12), ['9월', '10월', '11월', '12월']);
