import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const rows = [
  { region: 'KR', year: 2024, q: 'Q1', amt: 10 },
  { region: 'KR', year: 2025, q: 'Q1', amt: 20 },
  { region: 'US', year: 2024, q: 'Q2', amt: 5 },
  { region: 'US', year: 2025, q: 'Q1', amt: 7 },
  { region: 'JP', year: 2024, q: 'Q1', amt: 3 },
];
// 크로스 필터
const c = new GridCore({ enableCharts: true, columnDefs: [{ field: 'region' }, { field: 'year' }, { field: 'amt' }], rowData: rows.map(r => ({ ...r })) });
c.setViewportSize(800, 400);
const ref = c.api.createCrossFilterChart({ chartType: 'stackedColumn', cellRange: { columns: ['region', 'amt'] } });
const m = c.charts.get(ref.chartId);
check('지원 안 하는 종류 → 기본', m.chartType, 'groupedColumn');
let d = c.getChartData(m);
check(
  '카테고리·합계',
  [d.categories, d.series[0].values, d.series[0].totals],
  [
    ['KR', 'US', 'JP'],
    [30, 12, 3],
    [30, 12, 3],
  ],
);
d.cross.onClick(1, {});
check('클릭 → Set 필터', c.api.getFilterModel(), { region: { filterType: 'set', values: ['US'] } });
d = c.getChartData(m);
check('걸러진 값 / 전체', [d.series[0].values, d.series[0].totals, [...d.cross.selected]], [[0, 12, 0], [30, 12, 3], [1]]);
check(
  '그리드 행',
  c.displayedNodes.map(n => n.data.region),
  ['US', 'US'],
);
d.cross.onClick(0, { ctrlKey: true });
check('Ctrl 추가', c.api.getFilterModel().region.values, ['US', 'KR']);
c.getChartData(m).cross.onClick(0, { ctrlKey: true });
check('Ctrl 제외', c.api.getFilterModel().region.values, ['US']);
c.getChartData(m).cross.onClick(1, {});
check('같은 것 다시 → 해제', c.api.getFilterModel(), {});
// 다른 필터 영향 (year)
c.api.setFilterModel({ year: { filterType: 'number', type: 'equals', filter: 2024 } });
check('다른 필터', c.getChartData(m).series[0].values, [10, 5, 3]);
const cnt = c.api.createCrossFilterChart({ cellRange: { columns: ['region'] }, aggFunc: 'count', chartType: 'pie' });
check('개수 · 원형', [c.charts.get(cnt.chartId).chartType, c.getChartData(c.charts.get(cnt.chartId)).series[0].totals], ['pie', [2, 2, 1]]);
check(
  '모델',
  c.api.getChartModels().map(x => [x.modelType, x.aggFunc]),
  [
    ['crossFilter', 'sum'],
    ['crossFilter', 'count'],
  ],
);
// 피벗 차트
const p = new GridCore({
  enableCharts: true,
  pivotMode: true,
  columnDefs: [
    { field: 'region', rowGroup: true },
    { field: 'year', pivot: true },
    { field: 'amt', aggFunc: 'sum' },
  ],
  rowData: rows.map(r => ({ ...r })),
});
p.setViewportSize(800, 400);
const pr = p.api.createPivotChart({ chartType: 'groupedColumn' });
const pd = p.getChartData(p.charts.get(pr.chartId));
check('피벗 카테고리', pd.categories, ['KR', 'US', 'JP']);
check(
  '피벗 시리즈',
  pd.series.map(s => [s.name, s.values]),
  [
    ['2024 · Amt', [10, 5, 3]],
    ['2025 · Amt', [20, 7, 0]],
  ],
);
const np = new GridCore({ enableCharts: true, columnDefs: [{ field: 'amt' }], rowData: [] });
check('피벗 아니면 없음', np.api.createPivotChart({}), undefined);

// 설정 패널 · 꾸미기
const g = new GridCore({ enableCharts: true, columnDefs: [{ field: 'region' }, { field: 'year' }, { field: 'amt' }], rowData: rows.map(r => ({ ...r })) });
g.setViewportSize(800, 400);
const gr = g.api.createRangeChart({ cellRange: { rowStartIndex: 0, rowEndIndex: 4, columns: ['region', 'year', 'amt'] } });
const gm = g.charts.get(gr.chartId);
check('기본 카테고리 / 계열', [g.getChartData(gm).categoryColId, g.getChartData(gm).series.map(s => s.colId)], ['region', ['year', 'amt']]);
g.api.updateChart({ chartId: gr.chartId, hiddenSeries: ['year'] });
check(
  '계열 숨김',
  g.getChartData(gm).series.map(s => s.colId),
  ['amt'],
);
check(
  '패널 옵션 (숨긴 계열 포함)',
  g.getChartDataOptions(gm).series.map(s => [s.colId, s.hidden]),
  [
    ['year', true],
    ['amt', false],
  ],
);
g.api.updateChart({ chartId: gr.chartId, categoryColId: '__rowIndex' });
check('행 번호 카테고리', g.getChartData(gm).categories, ['1', '2', '3', '4', '5']);
g.api.updateChart({ chartId: gr.chartId, categoryColId: 'year' });
check('숫자 컬럼을 카테고리로', [g.getChartData(gm).categories[0], g.getChartData(gm).series.map(s => s.colId)], ['2024', ['amt']]);
let ev = null;
g.api.addEventListener('chartOptionsChanged', e => (ev = e.chartOptions));
g.api.updateChart({
  chartId: gr.chartId,
  chartThemeOverrides: { common: { title: { text: 'T' }, legend: { enabled: false } } },
  chartOptions: { palette: 'ocean', labels: true },
});
check('꾸미기', [g.api.getChartModels()[0].chartOptions.title, ev.legend, ev.palette, ev.labels], ['T', false, 'ocean', true]);
g.api.openChartToolPanel({ chartId: gr.chartId, panel: 'format' });
check('패널 열기', gm.panelOpen, 'format');
g.api.closeChartToolPanel({ chartId: gr.chartId });
check('패널 닫기', gm.panelOpen, null);
const cf = g.api.createCrossFilterChart({ cellRange: { columns: ['region', 'amt'] } });
g.api.updateChart({ chartId: cf.chartId, chartType: 'stackedColumn', aggFunc: 'count' });
check('크로스 필터: 누적 거부 · 집계 변경', [g.charts.get(cf.chartId).chartType, g.charts.get(cf.chartId).aggFunc], ['groupedColumn', 'count']);
