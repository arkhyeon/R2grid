import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const mk = o => {
  const c = new GridCore(o);
  c.setViewportSize(800, 600);
  return c;
};
const auto = c => c.allColumns.find(x => x.autoType === 'group');
const show = c =>
  c.displayedNodes.map(n => (n.footer ? `F:${n.key}` : n.group ? `${'  '.repeat(n.level)}G:${n.key}` : `${'  '.repeat(Math.max(0, n.level))}${n.data.name}`));

// treeDataChildrenField
const nested = [
  {
    id: 'a',
    name: 'A',
    kids: [
      { id: 'a1', name: 'A1' },
      { id: 'a2', name: 'A2', kids: [{ id: 'a2x', name: 'A2X' }] },
    ],
  },
  { id: 'b', name: 'B' },
];
const t1 = mk({
  treeData: true,
  treeDataChildrenField: 'kids',
  getRowId: p => p.data.id,
  autoGroupColumnDef: { field: 'name' },
  groupDefaultExpanded: -1,
  columnDefs: [{ field: 'id' }],
  rowData: nested,
});
check(
  'treeDataChildrenField',
  t1.displayedNodes.map(n => `${n.level}:${t1.getCellValue(n, auto(t1))}`),
  ['0:A', '1:A1', '1:A2', '2:A2X', '0:B'],
);
// treeDataParentIdField
const flat = [
  { id: '1', name: 'Root' },
  { id: '2', name: 'Child', parent: '1' },
  { id: '3', name: 'Grand', parent: '2' },
  { id: '4', name: 'Other' },
];
const t2 = mk({
  treeData: true,
  treeDataParentIdField: 'parent',
  getRowId: p => p.data.id,
  autoGroupColumnDef: { field: 'name' },
  groupDefaultExpanded: -1,
  columnDefs: [{ field: 'id' }],
  rowData: flat,
});
check(
  'treeDataParentIdField',
  t2.displayedNodes.map(n => `${n.level}:${t2.getCellValue(n, auto(t2))}`),
  ['0:Root', '1:Child', '2:Grand', '0:Other'],
);
// excludeChildrenWhenTreeDataFiltering
const t3 = mk({
  treeData: true,
  treeDataParentIdField: 'parent',
  getRowId: p => p.data.id,
  groupDefaultExpanded: -1,
  excludeChildrenWhenTreeDataFiltering: true,
  columnDefs: [{ field: 'name', filter: true }],
  rowData: flat,
});
t3.api.setFilterModel({ name: { filterType: 'text', type: 'equals', filter: 'Root' } });
check(
  'excludeChildren',
  t3.displayedNodes.map(n => n.data.name),
  ['Root'],
);

const rows = [
  { g: 'X', s: 'a', name: 'x1', v: 1 },
  { g: 'X', s: 'b', name: 'x2', v: 2 },
  { g: 'Y', s: 'a', name: 'y1', v: 10 },
  { g: null, s: 'a', name: 'n1', v: 5 },
];
// groupHideParentOfSingleChild
const h = mk({
  columnDefs: [{ field: 'g', rowGroup: true, hide: true }, { field: 'name' }, { field: 'v', aggFunc: 'sum' }],
  rowData: rows.filter(r => r.g),
  groupDefaultExpanded: -1,
  groupHideParentOfSingleChild: true,
});
check('groupHideParentOfSingleChild', show(h), ['G:X', '  x1', '  x2', '  y1']);
// groupAllowUnbalanced
const u = mk({
  columnDefs: [{ field: 'g', rowGroup: true, hide: true }, { field: 'name' }],
  rowData: rows,
  groupDefaultExpanded: -1,
  groupAllowUnbalanced: true,
});
check('groupAllowUnbalanced', show(u), ['G:X', '  x1', '  x2', 'G:Y', '  y1', 'n1']);
// initialGroupOrderComparator
const io = mk({
  columnDefs: [{ field: 'g', rowGroup: true, hide: true }, { field: 'name' }],
  rowData: rows.filter(r => r.g),
  initialGroupOrderComparator: p => (p.nodeA.key < p.nodeB.key ? 1 : -1),
});
check('initialGroupOrderComparator', show(io), ['G:Y', 'G:X']);
// groupMaintainOrder
const mo = mk({
  columnDefs: [{ field: 'g', rowGroup: true, hide: true }, { field: 'name' }, { field: 'v', aggFunc: 'sum' }],
  rowData: rows.filter(r => r.g),
  groupMaintainOrder: true,
});
mo.api.applyColumnState({ state: [{ colId: 'v', sort: 'desc' }] });
check('groupMaintainOrder', show(mo), ['G:X', 'G:Y']);
// getGroupRowAgg
const ga = mk({
  columnDefs: [{ field: 'g', rowGroup: true, hide: true }, { field: 'v' }],
  rowData: rows.filter(r => r.g),
  getGroupRowAgg: p => ({ v: p.nodes.length * 100 }),
});
check(
  'getGroupRowAgg',
  ga.displayedNodes.map(n => ga.getCellValue(n, ga.getColumn('v'))),
  [200, 100],
);
// suppressAggFilteredOnly
const sa = mk({
  columnDefs: [
    { field: 'g', rowGroup: true, hide: true },
    { field: 'name', filter: true },
    { field: 'v', aggFunc: 'sum' },
  ],
  rowData: rows.filter(r => r.g),
  suppressAggFilteredOnly: true,
});
sa.api.setFilterModel({ name: { filterType: 'text', type: 'equals', filter: 'x1' } });
check(
  'suppressAggFilteredOnly',
  sa.displayedNodes.map(n => sa.getCellValue(n, sa.getColumn('v'))),
  [3],
);
// groupAggFiltering
const af = mk({
  columnDefs: [{ field: 'g', rowGroup: true, hide: true }, { field: 'name' }, { field: 'v', aggFunc: 'sum', filter: 'r2NumberColumnFilter' }],
  rowData: rows.filter(r => r.g),
  groupAggFiltering: true,
  groupDefaultExpanded: -1,
});
af.api.setFilterModel({ v: { filterType: 'number', type: 'greaterThan', filter: 5 } });
check('groupAggFiltering (Y 합계 10 통과 → 자식 포함)', show(af), ['G:Y', '  y1']);
// groupSuppressBlankHeader
const bh = mk({
  columnDefs: [
    { field: 'g', rowGroup: true, hide: true },
    { field: 'v', aggFunc: 'sum' },
  ],
  rowData: rows.filter(r => r.g),
  groupTotalRow: 'bottom',
  groupDefaultExpanded: -1,
  groupSuppressBlankHeader: true,
});
check('groupSuppressBlankHeader', bh.getCellValue(bh.displayedNodes[0], bh.getColumn('v')), 3);
