// 통합 차트 (enableCharts) — 렌더는 react/chart.jsx (SVG). 데이터가 바뀌면 차트도 갱신(linked)
//  - 범위 차트 createRangeChart: 범위의 비숫자 첫 컬럼 = 카테고리, 숫자 컬럼 = 시리즈
//  - 피벗 차트 createPivotChart: 피벗 모드의 표시 행(행 그룹) = 카테고리, 피벗 결과 컬럼 = 시리즈
//  - 크로스 필터 차트 createCrossFilterChart: 카테고리 컬럼별 집계. 막대/조각을 누르면 그 값으로 그리드를 거름(Set 필터),
//    Ctrl/⌘+클릭은 추가·제외, 선택된 하나를 다시 누르면 해제. 전체 값은 옅게, 걸러진 값은 진하게
import { setFilterKey } from './filterService.js';

// 크로스 필터 차트가 지원하는 종류 (누적형 제외 — AG 동일)
export const CROSS_FILTER_TYPES = ['groupedColumn', 'groupedBar', 'line', 'area', 'pie', 'donut'];
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

  newChartModel(modelType, params, extra) {
    if (!this.gos.enableCharts) return undefined;
    const chartId = `id-${Math.random().toString(36).slice(2, 10)}`;
    const model = {
      chartId,
      modelType,
      chartType: params.chartType || 'groupedColumn',
      chartThemeName: params.chartThemeName,
      title: params.chartThemeOverrides?.common?.title?.text,
      container: params.chartContainer || null,
      ...extra,
    };
    if (!this.charts) this.charts = new Map();
    this.charts.set(chartId, model);
    this.notify();
    model.ref = { chartId, chartElement: null, destroyChart: () => this.destroyChart(chartId), focusChart: () => {} };
    this.dispatch('chartCreated', { chartId });
    return model.ref;
  },

  // 피벗 차트: 피벗 모드가 켜져 있어야 함 (AG 동일)
  createPivotChart(params = {}) {
    if (!this.isPivotActive?.()) return undefined;
    return this.newChartModel('pivot', params, {});
  },

  // 크로스 필터 차트: cellRange.columns = [카테고리 컬럼, 값 컬럼...], aggFunc = 'sum'(기본) | 'count' | 'avg' | 'min' | 'max'
  createCrossFilterChart(params = {}) {
    const cols = this.getColumnsFromKeys(params.cellRange?.columns || []);
    if (!cols.length) return undefined;
    const chartType = CROSS_FILTER_TYPES.includes(params.chartType) ? params.chartType : 'groupedColumn';
    return this.newChartModel('crossFilter', { ...params, chartType }, {
      catCol: cols[0],
      valueCols: cols.slice(1),
      aggFunc: params.aggFunc || 'sum',
      cellRange: { columns: cols },
    });
  },

  // 크로스 필터: 카테고리 클릭 → 카테고리 컬럼에 Set 필터
  crossFilterClick(model, ci, event) {
    const data = this.getChartData(model);
    const key = data.keys?.[ci];
    if (key === undefined) return;
    const col = model.catCol;
    const cur = this.filterModels.get(col.colId);
    let values = cur?.filterType === 'set' && Array.isArray(cur.values) ? [...cur.values] : [];
    const multi = event?.ctrlKey || event?.metaKey;
    if (multi) values = values.includes(key) ? values.filter(v => v !== key) : [...values, key];
    else values = values.length === 1 && values[0] === key ? [] : [key];
    this.setColumnFilterModel(col, values.length ? { filterType: 'set', values } : null);
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

  // 차트 데이터: { categories: string[], series: [{ name, colId, values: number[], totals? }], cross? }
  getChartData(model) {
    if (model.modelType === 'pivot') return this.getPivotChartData();
    if (model.modelType === 'crossFilter') return this.getCrossFilterChartData(model);
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

  // 피벗: 표시 중인 그룹 행(합계 행 제외) × 표시 중인 피벗 결과 컬럼
  getPivotChartData() {
    const cols = this.displayedColumns.filter(c => c.isPivotResult);
    let nodes = this.displayedNodes.filter(n => n && !n.footer && !n.detail && n.group);
    if (!nodes.length && this.pivotRootNode) nodes = [this.pivotRootNode];
    const label = n => {
      const parts = [];
      for (let p = n; p && p.level >= 0 && p.key !== undefined; p = p.parent) parts.unshift(p.key == null ? '(공백)' : String(p.key));
      return parts.join(' - ') || '합계';
    };
    const series = cols.map(c => ({
      name: `${(c.colDef.pivotKeys || []).join(' - ')}${c.pivotValueColumn ? ` · ${this.getDisplayName(c.pivotValueColumn, true)}` : ''}`,
      colId: c.colId,
      values: nodes.map(n => {
        const v = this.getCellValue(n, c);
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
      }),
    }));
    return { categories: nodes.map(label), series, categoryName: this.rowGroupColumns().map(c => this.getDisplayName(c)).join(' - ') || '피벗' };
  },

  getCrossFilterChartData(model) {
    const { catCol, valueCols, aggFunc } = model;
    const fp = catCol.colDef.filterParams || {};
    const preds = this.filterPreds || [];
    const leaves = this.rootNodes.filter(n => n.data !== undefined && !n.group);
    const keys = [];
    const labels = [];
    const index = new Map();
    const vcs = valueCols.length ? valueCols : [null]; // 값 컬럼이 없으면 개수
    const acc = vcs.map(() => ({ tot: [], fil: [], nTot: [], nFil: [], minT: [], maxT: [], minF: [], maxF: [] }));
    for (const n of leaves) {
      const raw = this.getCellValue(n, catCol);
      const key = setFilterKey(raw, fp, { node: n, data: n.data, colDef: catCol.colDef, column: catCol });
      let ci = index.get(key);
      if (ci === undefined) {
        ci = keys.length;
        index.set(key, ci);
        keys.push(key);
        labels.push(key == null ? '(공백)' : this.getCellText(n, catCol));
        acc.forEach(a => {
          a.tot.push(0);
          a.fil.push(0);
          a.nTot.push(0);
          a.nFil.push(0);
          a.minT.push(Infinity);
          a.maxT.push(-Infinity);
          a.minF.push(Infinity);
          a.maxF.push(-Infinity);
        });
      }
      const pass = preds.every(p => p(n));
      vcs.forEach((vc, si) => {
        const a = acc[si];
        const v = vc ? this.getCellValue(n, vc) : 1;
        const num = typeof v === 'number' && Number.isFinite(v) ? v : 0;
        a.tot[ci] += num;
        a.nTot[ci]++;
        a.minT[ci] = Math.min(a.minT[ci], num);
        a.maxT[ci] = Math.max(a.maxT[ci], num);
        if (pass) {
          a.fil[ci] += num;
          a.nFil[ci]++;
          a.minF[ci] = Math.min(a.minF[ci], num);
          a.maxF[ci] = Math.max(a.maxF[ci], num);
        }
      });
    }
    const fin = v => (Number.isFinite(v) ? v : 0);
    const pick = (a, which) => {
      const n = which === 'tot' ? a.nTot : a.nFil;
      if (aggFunc === 'count') return n.slice();
      if (aggFunc === 'avg') return (which === 'tot' ? a.tot : a.fil).map((s, i) => (n[i] ? s / n[i] : 0));
      if (aggFunc === 'min') return (which === 'tot' ? a.minT : a.minF).map(fin);
      if (aggFunc === 'max') return (which === 'tot' ? a.maxT : a.maxF).map(fin);
      return (which === 'tot' ? a.tot : a.fil).slice();
    };
    const series = vcs.map((vc, si) => ({
      name: vc ? this.getDisplayName(vc) : '개수',
      colId: vc?.colId,
      values: pick(acc[si], 'fil'),
      totals: pick(acc[si], 'tot'),
    }));
    const cur = this.filterModels.get(catCol.colId);
    const sel = new Set(cur?.filterType === 'set' && Array.isArray(cur.values) ? cur.values : []);
    const selected = new Set(keys.map((k, i) => (sel.has(k) ? i : -1)).filter(i => i >= 0));
    return {
      categories: labels,
      keys,
      series,
      categoryName: this.getDisplayName(catCol),
      cross: { selected, onClick: (ci, e) => this.crossFilterClick(model, ci, e) },
    };
  },

  getChartModels() {
    return [...(this.charts?.values() || [])].map(m => ({
      chartId: m.chartId,
      modelType: m.modelType,
      chartType: m.chartType,
      ...(m.cellRange ? { cellRange: { ...m.cellRange, columns: m.cellRange.columns.map(c => c.colId) } } : {}),
      ...(m.modelType === 'crossFilter' ? { aggFunc: m.aggFunc } : {}),
      suppressChartRanges: m.suppressChartRanges,
    }));
  },

  getChartRef(chartId) {
    return this.charts?.get(chartId)?.ref;
  },
};
