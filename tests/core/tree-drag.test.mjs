import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const tick = ms => new Promise(r => setTimeout(r, ms));
const ev = { clientX: 0, clientY: 0 };
const show = g => g.displayedNodes.map(n => `${'  '.repeat(n.level)}${n.data.name}`);
const drag = async (g, from, to, where) => {
  const a = g.displayedNodes.find(n => n.data.name === from);
  const b = g.displayedNodes.find(n => n.data.name === to);
  const pi = b.rowIndex - g.pageFirstRow;
  const top = g.rowTopAt(pi),
    h = g.rowHeightAt(pi);
  const y = where === 'above' ? top + 2 : where === 'below' ? top + h - 2 : top + h / 2;
  let end;
  g.gos.onRowDragEnd = e => (end = e);
  g.rowDragStart(a, ev);
  g.rowDragMove(b.rowIndex, y, { clientY: 1 });
  const ind = g.getRowDropPositionIndicator().dropIndicatorPosition;
  g.rowDragEnd(ev, b.rowIndex, y);
  return [ind, end];
};
const mk = extra => {
  const g = new GridCore({
    treeData: true,
    rowDragManaged: true,
    groupDefaultExpanded: -1,
    getRowId: p => String(p.data.id),
    columnDefs: [{ field: 'name', rowDrag: true }],
    ...extra,
  });
  g.setViewportSize(800, 600);
  return g;
};
// treeDataParentIdField
let rows = [
  { id: 1, name: 'A' },
  { id: 2, name: 'A1', pid: 1 },
  { id: 3, name: 'A2', pid: 1 },
  { id: 4, name: 'B' },
  { id: 5, name: 'B1', pid: 4 },
];
let g = mk({ treeDataParentIdField: 'pid', rowData: rows });
check('초기', show(g), ['A', '  A1', '  A2', 'B', '  B1']);
let [ind, end] = await drag(g, 'A2', 'B1', 'inside');
check('안쪽 표시', ind, 'inside');
check('B1 의 자식으로', show(g), ['A', '  A1', 'B', '  B1', '    A2']);
check('부모 필드 갱신 + 이벤트', [rows[2].pid, end.newParent?.data.name, end.dropPosition], [5, 'B1', 'inside']);
[ind, end] = await drag(g, 'A2', 'A1', 'above');
check('A1 위로 (A 의 자식, 첫 번째)', show(g), ['A', '  A2', '  A1', 'B', '  B1']);
[ind] = await drag(g, 'B', 'A', 'above');
check('최상위 순서 바꾸기', [show(g)[0], rows[3].pid ?? null], ['B', null]);
// 자기 자손 안으로는 안 됨
[ind] = await drag(g, 'B', 'B1', 'inside');
check('자손 안으로 금지', [ind, show(g).slice(0, 2)], ['none', ['B', '  B1']]);
// treeDataChildrenField
const nested = [
  { id: 1, name: 'X', kids: [{ id: 2, name: 'X1' }] },
  { id: 3, name: 'Y' },
];
g = mk({ treeDataChildrenField: 'kids', rowData: nested });
check('children 초기', show(g), ['X', '  X1', 'Y']);
await drag(g, 'X1', 'Y', 'inside');
check('children: Y 의 자식으로', show(g), ['X', 'Y', '  X1']);
// rowDragInsertDelay: 접힌 그룹 안쪽에 머무르면 펼침
g = mk({
  treeDataParentIdField: 'pid',
  rowData: [
    { id: 1, name: 'A' },
    { id: 2, name: 'A1', pid: 1 },
    { id: 3, name: 'C' },
  ],
  groupDefaultExpanded: 0,
  rowDragInsertDelay: 30,
});
const a = g.displayedNodes.find(n => n.data.name === 'A');
const c = g.displayedNodes.find(n => n.data.name === 'C');
g.rowDragStart(c, ev);
g.rowDragMove(a.rowIndex, g.rowTopAt(a.rowIndex) + g.rowHeightAt(a.rowIndex) / 2, { clientY: 1 });
check('머무르기 전 접힘', a.expanded, false);
await tick(60);
check('rowDragInsertDelay 후 펼침', a.expanded, true);
g.rowDragEnd(ev, a.rowIndex, 0, true);
// getDataPath 트리는 managed 이동 안 함
g = mk({
  getDataPath: d => d.path,
  rowData: [
    { id: 1, name: 'P', path: ['P'] },
    { id: 2, name: 'Q', path: ['Q'] },
  ],
});
check('getDataPath 는 자동 이동 없음', g.isManagedMoveAllowed(), false);
