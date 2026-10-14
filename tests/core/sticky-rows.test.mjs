import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const rows = [];
['A', 'B'].forEach(g =>
  ['x', 'y'].forEach(s => {
    for (let i = 0; i < 5; i++) rows.push({ g, s, v: 1 });
  }),
);
const mk = o => {
  const c = new GridCore({
    columnDefs: [
      { field: 'g', rowGroup: true, hide: true },
      { field: 's', rowGroup: true, hide: true },
      { field: 'v', aggFunc: 'sum' },
    ],
    rowData: rows,
    groupDefaultExpanded: -1,
    rowHeight: 10,
    ...o,
  });
  c.setViewportSize(800, 100);
  return c;
};
const c = mk();
const lbl = l => l.map(x => `${x.node.footer ? 'F' : ''}${x.node.key ?? 'ROOT'}@${x.top}`);
// 0:A 1:x 2-6 leaves 7:y ...
check('맨 위', lbl(c.getStickyGroupRows(0, c.displayedNodes.length, false)), []);
check('A·x 붙음', lbl(c.getStickyGroupRows(35, c.displayedNodes.length, false)), ['A@35', 'x@45']);
check('x 가 y 에 밀림', lbl(c.getStickyGroupRows(62, c.displayedNodes.length, false)), ['A@62', 'x@60']);
check('suppressGroupRowsSticky', mk({ suppressGroupRowsSticky: true }).getStickyGroupRows(35, 30, false).length, 0);
const t = mk({ groupTotalRow: 'bottom', grandTotalRow: 'bottom' });
check('합계 아래 고정 순서 (위→아래: 안쪽 그룹, 바깥 그룹, 총합계)', lbl(t.getStickyTotalRows(0, 100, t.displayedNodes.length, false)).reverse(), [
  'Fy@70',
  'FA@80',
  'FROOT@90',
]);
check(
  "suppressStickyTotalRow: 'grand'",
  lbl(
    t.getStickyTotalRows(0, 100, t.displayedNodes.length, false).length
      ? mk({ groupTotalRow: 'bottom', grandTotalRow: 'bottom', suppressStickyTotalRow: 'grand' }).getStickyTotalRows(0, 100, 30, false)
      : [],
  ).length,
  2,
);
