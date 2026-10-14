import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const rows = [
  { g: 'A', v: 1 },
  { g: 'A', v: 2 },
  { g: 'B', v: 3 },
];
let g = new GridCore({
  columnDefs: [
    { field: 'g', rowGroup: true, hide: true },
    { field: 'v', editable: true, aggFunc: 'sum' },
  ],
  rowData: rows,
  groupDefaultExpanded: -1,
  grandTotalRow: 'bottom',
});
g.setViewportSize(800, 400);
const grp = g.displayedNodes.find(n => n.group);
const leaf = g.displayedNodes.find(n => !n.group && !n.footer);
const foot = g.displayedNodes.find(n => n.footer);
const v = g.getColumn('v');
check('그룹 행 기본 편집 불가, 리프 가능, 합계 불가', [g.isCellEditable(v, grp), g.isCellEditable(v, leaf), g.isCellEditable(v, foot)], [false, true, false]);
let stopped;
g = new GridCore({
  enableGroupEdit: true,
  onCellEditingStopped: e => (stopped = [e.node.group, e.newValue]),
  columnDefs: [
    { field: 'g', rowGroup: true, hide: true },
    { field: 'v', editable: true, aggFunc: 'sum' },
  ],
  rowData: rows,
  groupDefaultExpanded: -1,
});
g.setViewportSize(800, 400);
const grp2 = g.displayedNodes.find(n => n.group);
check('enableGroupEdit: 그룹 행 편집 가능', g.isCellEditable(g.getColumn('v'), grp2), true);
g.startEdit(grp2, g.getColumn('v'));
g.editing.primary.setValue(100);
g.stopEditing(false);
check('데이터 없는 그룹 편집 → 오류 없이 이벤트로 새 값', stopped, [true, 100]);
// 트리: 데이터 있는 부모는 편집 가능, 채움용 부모는 불가
const tree = new GridCore({
  treeData: true,
  getDataPath: d => d.path,
  columnDefs: [{ field: 'n', editable: true }],
  rowData: [
    { path: ['a'], n: 1 },
    { path: ['a', 'b'], n: 2 },
    { path: ['x', 'y'], n: 3 },
  ],
  groupDefaultExpanded: -1,
});
tree.setViewportSize(800, 400);
const pa = tree.displayedNodes.find(n => n.key === 'a');
const px = tree.displayedNodes.find(n => n.key === 'x');
check('트리 부모 편집', [tree.isCellEditable(tree.getColumn('n'), pa), tree.isCellEditable(tree.getColumn('n'), px)], [true, false]);
check('treeData 자동 그룹 컬럼', !!tree.allColumns.find(c => c.autoType === 'group'), true);
tree.api.setGridOption('treeDataDisplayType', 'custom');
check("treeDataDisplayType 'custom' → 자동 그룹 컬럼 없음", !!tree.allColumns.find(c => c.autoType === 'group'), false);
