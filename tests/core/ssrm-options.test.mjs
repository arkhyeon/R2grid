import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));
const ROWS = [];
['KR', 'US', 'JP'].forEach(c => {
  for (let i = 0; i < 4; i++) ROWS.push({ id: `${c}-${i}`, c, v: i });
});
let active = 0,
  maxActive = 0;
const reqs = [];
const ds = {
  getRows(p) {
    active++;
    maxActive = Math.max(maxActive, active);
    const r = p.request;
    reqs.push(JSON.stringify(r.groupKeys) + ' ' + r.startRow + '-' + r.endRow);
    let rows = r.groupKeys.length ? ROWS.filter(x => x.c === r.groupKeys[0]) : [...new Set(ROWS.map(x => x.c))].map(c => ({ c }));
    setTimeout(() => {
      active--;
      p.success({ rowData: rows.slice(r.startRow, r.endRow), rowCount: rows.length });
    }, 5);
  },
};
const mk = o => {
  const c = new GridCore({
    rowModelType: 'serverSide',
    serverSideDatasource: ds,
    getRowId: p => p.data.id ?? p.data.c,
    columnDefs: [{ field: 'c', rowGroup: true, hide: true }, { field: 'v' }],
    ...o,
  });
  c.setViewportSize(800, 600);
  return c;
};
const load = async c => {
  for (let k = 0; k < 8; k++) {
    c.ssrmEnsureRows(0, c.displayedNodes.length - 1);
    await tick(15);
  }
};
// isServerSideGroupOpenByDefault
const a = mk({ isServerSideGroupOpenByDefault: p => p.data.c === 'US' });
await load(a);
check('isServerSideGroupOpenByDefault', a.displayedNodes.map(n => (n.group ? 'G:' + n.key : n.data.id)).slice(0, 7), [
  'G:KR',
  'G:US',
  'US-0',
  'US-1',
  'US-2',
  'US-3',
  'G:JP',
]);
// getServerSideGroupLevelParams: 하위 블록 크기 2
reqs.length = 0;
const b = mk({ getServerSideGroupLevelParams: p => (p.level === 1 ? { cacheBlockSize: 2 } : {}) });
await load(b);
b.api.getRowNode('KR').setExpanded(true);
await load(b);
check(
  '단계별 블록 크기',
  reqs.filter(r => r.startsWith('["KR"]')),
  ['["KR"] 0-2', '["KR"] 2-4'],
);
// purgeClosedRowNodes
const c = mk({ purgeClosedRowNodes: true });
await load(c);
c.api.getRowNode('KR').setExpanded(true);
await load(c);
c.api.getRowNode('KR').setExpanded(false);
check('purgeClosedRowNodes', c.getServerSideGroupLevelState().length, 1);
// maxConcurrentDatasourceRequests
maxActive = 0;
const d = mk({ maxConcurrentDatasourceRequests: 1, groupDefaultExpanded: 1 });
await load(d);
check('maxConcurrentDatasourceRequests', maxActive, 1);
// expandAll (ssrmExpandAllAffectsAllRows)
const e = mk({ ssrmExpandAllAffectsAllRows: true });
await load(e);
e.api.expandAll();
await load(e);
check('expandAll', e.displayedNodes.filter(n => !n.group).length, 12);
e.api.collapseAll();
check('collapseAll', e.displayedNodes.length, 3);
// isApplyServerSideTransaction
const f = mk({ isApplyServerSideTransaction: () => false });
await load(f);
check('isApplyServerSideTransaction', f.api.applyServerSideTransaction({ add: [{ c: 'CN' }] }).status, 'Cancelled');
// storeRefreshed
let refreshed = null;
const g = mk({ onStoreRefreshed: ev => (refreshed = ev.route) });
await load(g);
g.api.refreshServerSide();
await load(g);
check('storeRefreshed', refreshed, []);
