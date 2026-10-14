// 루트 집계 · 피벗 빠른 검색 순서
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const rows = [
  { r: 'KR', y: 2024, v: 1 }, { r: 'KR', y: 2024, v: 2 }, { r: 'KR', y: 2025, v: 4 },
  { r: 'US', y: 2024, v: 10 }, { r: 'US', y: 2025, v: 20 },
];
const mk = o => {
  const c = new GridCore({ rowData: rows.map(x => ({ ...x })), ...o });
  c.setViewportSize(1200, 600);
  return c;
};
// 묶지 않은 그리드
const flatCols = [{ field: 'r' }, { field: 'y' }, { field: 'v', aggFunc: 'sum' }];
const f0 = mk({ columnDefs: flatCols });
check('옵션 없으면 루트 aggData 없음', f0.api.getRootNode().aggData, null);
const f = mk({ columnDefs: flatCols, alwaysAggregateAtRootLevel: true });
check('평면: 루트 합계', [f.api.getRootNode().aggData, f.api.getRootNode().allChildrenCount, f.api.getRootNode().id], [{ v: 37 }, 5, 'ROOT_NODE_ID']);
f.api.setFilterModel({ r: { filterType: 'text', type: 'equals', filter: 'KR' } });
check('필터 후 루트 합계', f.api.getRootNode().aggData, { v: 7 });
f0.api.setGridOption('alwaysAggregateAtRootLevel', true);
check('옵션 켜기 → 즉시 집계', f0.api.getRootNode().aggData, { v: 37 });
check('최상위 행 parent 는 그대로 null', f.api.getDisplayedRowAtIndex(0).parent, null);
// 그룹
const g = mk({ columnDefs: [{ field: 'r', rowGroup: true, hide: true }, { field: 'v', aggFunc: 'sum' }], alwaysAggregateAtRootLevel: true });
check('그룹: 루트 합계', [g.api.getRootNode().aggData, g.api.getRootNode().childrenAfterFilter.map(n => n.key)], [{ v: 37 }, ['KR', 'US']]);
const gt = mk({ columnDefs: [{ field: 'r', rowGroup: true, hide: true }, { field: 'v', aggFunc: 'sum' }], grandTotalRow: 'bottom' });
check('총합계 행 있으면 옵션 없이도 루트 집계', gt.api.getRootNode().aggData, { v: 37 });
// 피벗 빠른 검색
const pcols = [{ field: 'r', rowGroup: true }, { field: 'y', pivot: true }, { field: 'v', aggFunc: 'sum' }];
const keys = c => c.displayedNodes.map(n => n.key);
const p = mk({ pivotMode: true, columnDefs: pcols });
check('피벗 기본', keys(p), ['KR', 'US']);
p.api.setGridOption('quickFilterText', '20');
check('피벗: 결과 값으로 검색 (US 2025 = 20)', keys(p), ['US']);
p.api.setGridOption('quickFilterText', 'kr');
check('피벗: 그룹 키로 검색', keys(p), ['KR']);
p.api.setGridOption('quickFilterText', '3');
check('피벗: KR 2024 합 3', keys(p), ['KR']);
const pb = mk({ pivotMode: true, columnDefs: pcols, applyQuickFilterBeforePivotOrAgg: true, quickFilterText: '10' });
check('원본 먼저: 원본 v=10 행만 남아 US 2024=10, 2025 비움', [keys(pb), pb.getCellValue(pb.displayedNodes[0], pb.getColumn('pivot_2024_v')), pb.getCellValue(pb.displayedNodes[0], pb.getColumn('pivot_2025_v'))], [['US'], 10, null]);
pb.api.setGridOption('quickFilterText', '3');
check('원본 먼저: 원본에 3 없음 → 0행', keys(pb), []);
// 행 그룹 없는 피벗 (합계 1행)
const pt = mk({ pivotMode: true, columnDefs: [{ field: 'y', pivot: true }, { field: 'v', aggFunc: 'sum' }], quickFilterText: '24' });
check('합계만 피벗: 2025 합 24 맞음', pt.displayedNodes.length, 1);
pt.api.setGridOption('quickFilterText', '999');
check('합계만 피벗: 안 맞으면 비움', pt.displayedNodes.length, 0);
// 피벗 끄면 평소대로
const off = mk({ columnDefs: pcols.map(c => ({ ...c, rowGroup: false, pivot: false })), quickFilterText: 'us' });
check('피벗 아님: 행 검색', off.api.getDisplayedRowCount(), 2);
// 편집 후 다시 집계
const e = mk({ columnDefs: [{ field: 'r', rowGroup: true, hide: true }, { field: 'y', rowGroup: true, hide: true }, { field: 'v', aggFunc: 'sum', editable: true }], groupDefaultExpanded: -1, groupTotalRow: 'bottom', grandTotalRow: 'bottom', alwaysAggregateAtRootLevel: true });
const krLeaf = e.api.getRowNode(e.rootNodes[0].id);
krLeaf.setDataValue('v', 101);
const kr = e.groupTop.find(n => n.key === 'KR');
const kr24 = kr.childrenAll.find(n => n.key === 2024 || n.key === '2024');
check('편집 → 하위 그룹·상위 그룹·루트', [kr24.aggData.v, kr.aggData.v, e.api.getRootNode().aggData.v], [103, 107, 137]);
const foot = e.displayedNodes.filter(n => n.footer).map(n => n.aggData.v);
check('편집 → 그룹 합계 행·총합계 행', foot, [103, 4, 107, 10, 20, 30, 137]);
// 묶음 편집은 끝날 때 한 번
let calls = 0;
const orig = e.aggregateRoot.bind(e);
e.aggregateRoot = () => (calls++, orig());
e.beginUndoBatch();
e.rootNodes.forEach(n => n.setDataValue('v', 1));
const mid = e.api.getRootNode().aggData.v;
e.endUndoBatch();
check('묶음 편집: 끝날 때 한 번 집계', [mid, calls, e.api.getRootNode().aggData.v], [137, 1, 5]);
// 평면 + 루트 합계 편집
const fe = mk({ columnDefs: flatCols, alwaysAggregateAtRootLevel: true });
fe.api.getDisplayedRowAtIndex(0).setDataValue('v', 11);
check('평면 편집 → 루트 합계', fe.api.getRootNode().aggData, { v: 47 });
// 피벗 편집
const pe = mk({ pivotMode: true, columnDefs: pcols });
pe.rootNodes[3].setDataValue('v', 15);
check('피벗 편집 → 결과 값', pe.getCellValue(pe.displayedNodes[1], pe.getColumn('pivot_2024_v')), 15);
