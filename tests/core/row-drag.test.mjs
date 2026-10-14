import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const rows = () => ['a', 'b', 'c', 'd'].map(n => ({ n, v: 1 }));
const mk = o => {
  const c = new GridCore({
    columnDefs: [
      { field: 'n', rowDrag: true },
      { field: 'v', filter: true },
    ],
    rowData: rows(),
    rowDragManaged: true,
    ...o,
  });
  c.setViewportSize(800, 400);
  return c;
};
const order = c => c.displayedNodes.map(n => n.data.n);
const h = c => c.rowHeightAt(0);
// suppressMoveWhenRowDragging: 끄는 동안 순서 그대로, 놓으면 이동
const s = mk({ suppressMoveWhenRowDragging: true });
const a = s.displayedNodes[0];
s.rowDragStart(a, { clientY: 0 });
s.rowDragMove(2, h(s) * 2 + h(s) * 0.8, { clientY: 10 });
check('끄는 중 순서 유지', order(s), ['a', 'b', 'c', 'd']);
check('표시줄', [s.getRowDropPositionIndicator().row?.data.n, s.getRowDropPositionIndicator().dropIndicatorPosition], ['c', 'below']);
s.rowDragEnd({}, 2, 0);
check('놓으면 이동', [order(s), s.getRowDropPositionIndicator().dropIndicatorPosition], [['b', 'c', 'a', 'd'], 'none']);
// isRowValidDropPosition
const v = mk({ isRowValidDropPosition: p => p.target.data.n !== 'd' });
const va = v.displayedNodes[0];
v.rowDragStart(va, { clientY: 0 });
v.rowDragMove(3, h(v) * 3 + 2, { clientY: 10 });
check('isRowValidDropPosition 거부', order(v), ['a', 'b', 'c', 'd']);
v.rowDragMove(2, h(v) * 2 + 2, { clientY: 20 });
check('허용 위치는 이동', order(v), ['b', 'c', 'a', 'd']);
v.rowDragEnd({}, 2, 0);
// suppressSetFilterByDefault
const f = mk({ suppressSetFilterByDefault: true });
f.api.setFilterModel({ v: { filterType: 'number', type: 'equals', filter: 1 } });
check('suppressSetFilterByDefault → number', [f.resolveFilterKindOf?.(f.getColumn('v')) ?? null, f.displayedNodes.length], [null, 4]);
