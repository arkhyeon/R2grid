import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const mk = o => {
  const c = new GridCore(o);
  c.setViewportSize(800, 400);
  return c;
};
// enableCellExpressions
const e = mk({ enableCellExpressions: true, columnDefs: [{ field: 'a' }, { field: 'f' }], rowData: [{ a: 2, f: '=data.a * 10' }] });
check('enableCellExpressions', e.getCellValue(e.displayedNodes[0], e.getColumn('f')), 20);
// dataTypeDefinitions
const d = mk({
  dataTypeDefinitions: {
    percent: {
      baseDataType: 'number',
      extendsDataType: 'number',
      valueFormatter: p => (p.value == null ? '' : `${Math.round(p.value * 100)}%`),
      valueParser: p => Number(String(p.newValue).replace('%', '')) / 100,
      dataTypeMatcher: v => typeof v === 'number' && v > 0 && v < 1,
    },
  },
  columnDefs: [{ field: 'p' }, { field: 'q', cellDataType: 'percent', filter: true }],
  rowData: [{ p: 0.25, q: 0.5 }],
  suppressSetFilterByDefault: true,
});
const n = d.displayedNodes[0];
check('dataType 추론 (matcher)', [d.getColumn('p').dataType, d.formatValue(n, d.getColumn('p'), 0.25)], ['number', '25%']);
check('cellDataType 지정', d.formatValue(n, d.getColumn('q'), 0.5), '50%');
const { resolveFilterKind } = await import('../../src/grid/core/filterService.js');
check('baseDataType → number 필터', resolveFilterKind(d.getColumn('q').colDef, {}, d.gos, d.getColumn('q')), 'number');
// 차트: chartThemes / customChartThemes / chartToolPanelsDef / chartMenuItems / restoreChart
const c = mk({
  enableCharts: true,
  chartThemes: ['bright', 'mine'],
  customChartThemes: { mine: { palette: { fills: ['#111', '#222'] } } },
  chartToolPanelsDef: { panels: ['data', 'format'], defaultToolPanel: 'format' },
  chartMenuItems: ['chartData', 'chartDownload'],
  columnDefs: [{ field: 'k' }, { field: 'v' }],
  rowData: [
    { k: 'a', v: 1 },
    { k: 'b', v: 2 },
  ],
});
const r = c.api.createRangeChart({ cellRange: { rowStartIndex: 0, rowEndIndex: 1, columns: ['k', 'v'] }, chartThemeName: 'mine' });
const m = c.charts.get(r.chartId);
check('팔레트 목록', Object.keys(c.chartPalettes()), ['bright', 'mine']);
check('chartThemeName → 팔레트', c.chartOptionsOf(m).palette, 'mine');
c.api.openChartToolPanel({ chartId: r.chartId });
check('chartToolPanelsDef', [c.chartPanelTabs(), m.panelOpen], [['data', 'format'], 'format']);
check('chartMenuItems', c.chartToolbarItems(m), ['chartData', 'chartDownload']);
c.api.updateChart({ chartId: r.chartId, chartOptions: { title: 'T' } });
const model = c.api.getChartModels()[0];
c.api.destroyChart?.(r.chartId);
c.destroyChart(r.chartId);
const r2 = c.api.restoreChart(model);
check('restoreChart', [c.charts.get(r2.chartId).chartType, c.chartOptionsOf(c.charts.get(r2.chartId)).title], ['groupedColumn', 'T']);
