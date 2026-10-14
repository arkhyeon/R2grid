import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const rows = [
  { r: 'KR', y: 2024, q: 'Q1', v: 1 }, { r: 'KR', y: 2024, q: 'Q2', v: 2 }, { r: 'KR', y: 2025, q: 'Q1', v: 4 },
  { r: 'US', y: 2024, q: 'Q1', v: 10 }, { r: 'US', y: 2025, q: 'Q2', v: 20 },
];
const mk = o => {
  const c = new GridCore({ pivotMode: true, rowData: rows, columnDefs: [{ field: 'r', rowGroup: true }, { field: 'y', pivot: true }, { field: 'v', aggFunc: 'sum' }], ...o });
  c.setViewportSize(1200, 600);
  return c;
};
const vals = (c, ids) => c.displayedNodes.map(n => ids.map(id => c.getCellValue(n, c.getColumn(id))));
// 행 합계
const a = mk({ pivotRowTotals: 'after' });
check('pivotRowTotals 컬럼', a.displayedColumns.filter(c => c.isPivotResult).map(c => c.colId), ['pivot_2024_v', 'pivot_2025_v', 'PivotRowTotal_v']);
check('pivotRowTotals 값', vals(a, ['PivotRowTotal_v']), [[7], [30]]);
const b = mk({ pivotRowTotals: 'before' });
check('before', b.displayedColumns.filter(c => c.isPivotResult)[0].colId, 'PivotRowTotal_v');
// 그룹 합계 (2단계 피벗)
const twoLevel = { columnDefs: [{ field: 'r', rowGroup: true }, { field: 'y', pivot: true }, { field: 'q', pivot: true }, { field: 'v', aggFunc: 'sum' }] };
const gt = mk({ ...twoLevel, pivotColumnGroupTotals: 'after' });
check('그룹 합계: 접힘 → 합계만', gt.displayedColumns.filter(c => c.isPivotResult).map(c => c.colId), ['PivotGroupTotal_["2024"]_v', 'PivotGroupTotal_["2025"]_v']);
check('그룹 합계 값', vals(gt, ['PivotGroupTotal_["2024"]_v', 'PivotGroupTotal_["2025"]_v']), [[3, 4], [10, 20]]);
const ge = mk({ ...twoLevel, pivotColumnGroupTotals: 'after', pivotDefaultExpanded: -1 });
check('pivotDefaultExpanded -1 → 자식 표시', ge.displayedColumns.filter(c => c.isPivotResult).length, 4);
// 값 컬럼 하나 → 헤더 줄 제거
const rm = mk({ removePivotHeaderRowWhenSingleValueColumn: true });
check('removePivotHeaderRow', [rm.headerGroupDepth, rm.displayedColumns.filter(c => c.isPivotResult).map(c => rm.getDisplayName(c, true))], [0, ['2024', '2025']]);
// processPivotResultColDef
const pr = mk({ processPivotResultColDef: d => (d.headerName = `★${d.pivotKeys.join()}`) });
check('processPivotResultColDef', pr.displayedColumns.filter(c => c.isPivotResult).map(c => c.colDef.headerName), ['★2024', '★2025']);
// pivotMaxGeneratedColumns
let ex = null;
const mx = mk({ pivotMaxGeneratedColumns: 1, onPivotMaxColumnsExceeded: e => (ex = e.message) });
check('pivotMaxGeneratedColumns', [mx.displayedColumns.filter(c => c.isPivotResult).length, !!ex], [0, true]);
// pivotSuppressAutoColumn
const sa = mk({ pivotSuppressAutoColumn: true });
check('pivotSuppressAutoColumn', sa.displayedColumns.some(c => c.autoType === 'group'), false);
