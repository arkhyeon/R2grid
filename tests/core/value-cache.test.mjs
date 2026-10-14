// 값 캐시 · getBestCostNodeSelection
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
let calls = 0;
const rows = () => Array.from({ length: 50 }, (_, i) => ({ id: i, a: (i * 37) % 50 }));
const mk = o => {
  calls = 0;
  const c = new GridCore({ getRowId: p => String(p.data.id), rowData: rows(), columnDefs: [{ field: 'id' }, { colId: 'twice', valueGetter: p => (calls++, p.data.a * 2), editable: true, valueSetter: p => ((p.data.a = p.newValue / 2), true) }], ...o });
  c.setViewportSize(800, 400);
  return c;
};
const col = c => c.getColumn('twice');
const run = c => {
  c.api.applyColumnState({ state: [{ colId: 'twice', sort: 'asc' }] });
  c.api.applyColumnState({ state: [{ colId: 'twice', sort: 'desc' }] });
  c.api.setFilterModel({ twice: { filterType: 'number', type: 'greaterThan', filter: 10 } });
};
const a = mk({});
calls = 0; run(a); const noCache = calls;
const b = mk({ valueCache: true });
calls = 0; run(b); const cached = calls;
check('valueCache: 정렬·필터 반복 계산 줄어듦', [cached <= 50, noCache > cached], [true, true]);
check('같은 결과', [a.api.getDisplayedRowCount(), a.api.getDisplayedRowAtIndex(0).id], [b.api.getDisplayedRowCount(), b.api.getDisplayedRowAtIndex(0).id]);
const n = b.api.getRowNode('7');
n.setDataValue('twice', 200);
check('편집하면 만료 → 새 값', b.getCellValue(n, col(b)), 200);
b.api.applyTransaction({ update: [{ id: 8, a: 1000 }] });
check('트랜잭션도 만료', b.getCellValue(b.api.getRowNode('8'), col(b)), 2000);
// never expires
const c = mk({ valueCache: true, valueCacheNeverExpires: true });
const n9 = c.api.getRowNode('9');
c.getCellValue(n9, col(c));
n9.data.a = 500;
c.api.applyTransaction({ update: [{ ...n9.data }] });
const stale = c.getCellValue(c.api.getRowNode('9'), col(c));
c.api.expireValueCache();
check('valueCacheNeverExpires: expireValueCache 전엔 옛 값', [stale !== 1000, c.getCellValue(c.api.getRowNode('9'), col(c))], [true, 1000]);
c.api.applyTransaction({ update: [{ id: 9, a: 1 }] });
c.api.refreshCells({ force: true });
check('refreshCells({ force }) 로 만료', c.getCellValue(c.api.getRowNode('9'), col(c)), 2);
// getBestCostNodeSelection
const g = new GridCore({
  rowData: [{ id: 1, g: 'A' }, { id: 2, g: 'A' }, { id: 3, g: 'B' }, { id: 4, g: 'B' }],
  getRowId: p => String(p.data.id),
  columnDefs: [{ field: 'g', rowGroup: true, hide: true }, { field: 'id' }],
  rowSelection: { mode: 'multiRow', groupSelects: 'descendants' },
  groupDefaultExpanded: -1,
});
g.setViewportSize(800, 400);
['1', '2', '3'].forEach(id => g.api.getRowNode(id).setSelected(true));
check('getBestCostNodeSelection: A 그룹 하나 + B 의 3', g.api.getBestCostNodeSelection().map(n => (n.group ? `G:${n.key}` : n.id)), ['G:A', '3']);
const f = mk({ rowSelection: { mode: 'multiRow' } });
f.api.getRowNode('1').setSelected(true);
check('묶지 않으면 선택 행 그대로', f.api.getBestCostNodeSelection().map(n => n.id), ['1']);
