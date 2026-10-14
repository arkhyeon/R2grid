// 집계값 깜빡임 · allowShowChangeAfterFilter · suppressMaintainUnsortedOrder
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const rows = () => [{ id: 1, g: 'A', v: 1 }, { id: 2, g: 'A', v: 2 }, { id: 3, g: 'B', v: 10 }];
const mk = o => {
  const c = new GridCore({ rowData: rows(), getRowId: p => String(p.data.id), columnDefs: [{ field: 'g', rowGroup: true, hide: true }, { field: 'v', aggFunc: 'sum', enableCellChangeFlash: true, editable: true }], groupDefaultExpanded: -1, ...o });
  c.setViewportSize(800, 400);
  return c;
};
const flashed = c => [...c.flashes.keys()].sort();
const a = mk({});
check('처음엔 깜빡임 없음', flashed(a), []);
a.api.applyTransaction({ update: [{ id: 1, g: 'A', v: 5 }] });
check('트랜잭션 → 리프 + 그룹 A 집계 깜빡임', flashed(a), ['1|v', 'row-group-g-A|v'].sort());
const b = mk({ groupTotalRow: 'bottom', grandTotalRow: 'bottom' });
b.api.getRowNode('3').setDataValue('v', 11);
check('편집 → 그룹·그룹 합계 행·총합계 깜빡임', flashed(b).length, 4);
const c = mk({});
c.api.setFilterModel({ v: { filterType: 'number', type: 'greaterThan', filter: 1 } });
check('필터로 바뀐 집계 → 깜빡임 없음', flashed(c), []);
const d = mk({ allowShowChangeAfterFilter: true });
d.api.setFilterModel({ v: { filterType: 'number', type: 'greaterThan', filter: 1 } });
check('allowShowChangeAfterFilter → 필터로 바뀐 집계 깜빡임', flashed(d), ['row-group-g-A|v']);
const q = mk({});
q.api.setGridOption('quickFilterText', 'zzz');
q.api.setGridOption('quickFilterText', '');
check('빠른 검색도 필터 취급', flashed(q), []);
// 피벗
const p = mk({ pivotMode: true, columnDefs: [{ field: 'g', pivot: true }, { field: 'v', aggFunc: 'sum', enableCellChangeFlash: true }] });
p.api.applyTransaction({ update: [{ id: 3, g: 'B', v: 20 }] });
check('피벗 결과 컬럼 깜빡임', flashed(p).filter(k => k.startsWith('ROOT')), ['ROOT_NODE_ID|pivot_B_v']);
// suppressMaintainUnsortedOrder
const ids = c => c.rootNodes.map(n => n.id);
const flat = s => {
  const g = new GridCore({ rowData: rows(), getRowId: p => String(p.data.id), columnDefs: [{ field: 'v' }], suppressMaintainUnsortedOrder: s });
  g.setViewportSize(800, 400);
  g.api.setGridOption('rowData', [{ id: 4, v: 0 }, { id: 3, v: 10 }, { id: 1, v: 1 }]);
  return [ids(g), g.api.getDisplayedRowAtIndex(0).id];
};
check('기본: 새 rowData 순서', flat(false), [['4', '3', '1'], '4']);
check('suppressMaintainUnsortedOrder: 기존 순서 + 새 행 끝', flat(true), [['1', '3', '4'], '1']);
