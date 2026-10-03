// 통합 차트 (enableCharts + createRangeChart) — 셀 범위를 차트로. 렌더는 react/chart.jsx (SVG)
//  범위의 비숫자 첫 컬럼 = 카테고리, 숫자 컬럼 = 시리즈. 데이터 변경 시 차트도 갱신(linked).
export const CHART_TYPES = [
  ['groupedColumn', '묶은 세로 막대'],
  ['stackedColumn', '누적 세로 막대'],
  ['normalizedColumn', '100% 누적 세로 막대'],
  ['groupedBar', '묶은 가로 막대'],
  ['stackedBar', '누적 가로 막대'],
  ['line', '꺾은선'],
  ['area', '영역'],
  ['stackedArea', '누적 영역'],
  ['pie', '원형'],
  ['donut', '도넛'],
];

export const chartMethods = {
  createRangeChart(params = {}) {
    if (!this.gos.enableCharts) return undefined;
    const cr = params.cellRange || {};
    let r0;
    let r1;
    let cols;
    if (cr.rowStartIndex != null || cr.columns || cr.columnStart) {
      r0 = cr.rowStartIndex ?? this.pageFirstRow;
      r1 = cr.rowEndIndex ?? this.pageLastRow - 1;
      cols = cr.columns
        ? this.getColumnsFromKeys(cr.columns)
        : (() => {
            const a = this.displayedIndex.get(this.getColumn(cr.columnStart)?.colId);
            const b = this.displayedIndex.get(this.getColumn(cr.columnEnd)?.colId);
            return a == null || b == null ? [] : this.displayedColumns.slice(Math.min(a, b), Math.max(a, b) + 1);
          })();
    } else {
      const r = this.ranges[this.ranges.length - 1];
      const b = r && this.rangeBounds(r);
      if (!b) return undefined;
      r0 = b.r0;
      r1 = b.r1;
      cols = this.displayedColumns.slice(b.c0, b.c1 + 1);
    }
    cols = cols.filter(c => !c.autoType || c.autoType === 'group');
    if (!cols.length) return undefined;
    const chartId = `id-${Math.random().toString(36).slice(2, 10)}`;
    const model = {
      chartId,
      modelType: 'range',
      chartType: params.chartType || 'groupedColumn',
      cellRange: { rowStartIndex: Math.min(r0, r1), rowEndIndex: Math.max(r0, r1), columns: cols },
      chartThemeName: params.chartThemeName,
      title: params.chartThemeOverrides?.common?.title?.text,
      container: params.chartContainer || null,
      suppressChartRanges: !!params.suppressChartRanges,
    };
    if (!this.charts) this.charts = new Map();
    this.charts.set(chartId, model);
    this.notify();
    const ref = {
      chartId,
      chartElement: null,
      destroyChart: () => this.destroyChart(chartId),
      focusChart: () => {},
    };
    model.ref = ref;
    this.dispatch('chartCreated', { chartId });
    return ref;
  },

  destroyChart(chartId) {
    if (!this.charts?.has(chartId)) return;
    this.charts.delete(chartId);
    this.notify();
    this.dispatch('chartDestroyed', { chartId });
  },

  updateChart(params) {
    const m = this.charts?.get(params.chartId);
    if (!m) return;
    if (params.chartType) m.chartType = params.chartType;
    if (params.cellRange) {
      const cr = params.cellRange;
      if (cr.rowStartIndex != null) m.cellRange.rowStartIndex = cr.rowStartIndex;
      if (cr.rowEndIndex != null) m.cellRange.rowEndIndex = cr.rowEndIndex;
      if (cr.columns) m.cellRange.columns = this.getColumnsFromKeys(cr.columns);
    }
    this.notify();
    this.dispatch('chartOptionsChanged', { chartId: m.chartId, chartType: m.chartType });
  },

  // 차트 데이터: { categories: string[], series: [{ name, colId, values: number[] }] }
  getChartData(model) {
    const { rowStartIndex, rowEndIndex, columns } = model.cellRange;
    const numCols = [];
    let catCol = null;
    const sample = this.displayedNodes.slice(rowStartIndex, rowEndIndex + 1).filter(n => n && !n.detail);
    for (const c of columns) {
      const numeric = sample.some(n => typeof this.getCellValue(n, c) === 'number') || c.dataType === 'number';
      if (numeric && c.autoType !== 'group') numCols.push(c);
      else if (!catCol) catCol = c;
    }
    const categories = sample.map((n, i) => (catCol ? this.getCellText(n, catCol) : String(n.rowIndex + 1 ?? i + 1)));
    const series = numCols.map(c => ({
      name: this.getDisplayName(c),
      colId: c.colId,
      values: sample.map(n => {
        const v = this.getCellValue(n, c);
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
      }),
    }));
    return { categories, series, categoryName: catCol ? this.getDisplayName(catCol) : '' };
  },

  getChartModels() {
    return [...(this.charts?.values() || [])].map(m => ({
      chartId: m.chartId,
      modelType: 'range',
      chartType: m.chartType,
      cellRange: { ...m.cellRange, columns: m.cellRange.columns.map(c => c.colId) },
      suppressChartRanges: m.suppressChartRanges,
    }));
  },

  getChartRef(chartId) {
    return this.charts?.get(chartId)?.ref;
  },
};
