// 클라이언트 행 모델 파이프라인(필터 → 정렬 → 표시 → 페이지 → 행 위치)과 필터·정렬 api
//  GridCore.prototype 에 합쳐짐 (this = GridCore)
import { setFilterKey } from './filterService.js';
import { DEFAULT_DETAIL_ROW_HEIGHT, DEFAULT_ROW_HEIGHT } from './gridConstants.js';
import { localeText } from './locale.js';
import { clamp, defaultComparator, getFieldValue, toText } from './utils.js';

export const rowModelMethods = {
  // ── 모델 파이프라인: 필터 → 정렬 → 표시 → 페이지 → 행 위치 ──────────
  refreshModel({
    newData = false,
    keepRenderedRows = false,
    skipFilter = false,
    newPageSize = false,
    resetPage = false,
    silent = false,
    byFilter = false,
  } = {}) {
    this.spanEpoch = (this.spanEpoch || 0) + 1;
    // 필터 때문에 바뀐 집계값은 깜빡이지 않음 (allowShowChangeAfterFilter 면 깜빡임)
    this.aggChangeByFilter = byFilter;
    if (this.isViewportModel()) {
      this.vpRefreshView();
      return;
    }
    if (this.isSsrm()) {
      // 행 그룹·값 컬럼이 바뀌면 서버에 다시 요청 (setRowGroupColumns·드롭 영역 등 어느 경로든)
      if (this.ssrm && this.ssrmModelSig() !== this.ssrm.modelSig) this.ssrmReset('columns');
      else this.ssrmRefreshView();
      return;
    }
    // 피벗: 데이터 변화로 피벗 키가 바뀌면 결과 컬럼 재구성
    if ((this.isPivotActive() || this.pivotResultColumns?.length) && this.applyPivotResultColumns()) {
      this.columnsVersion++;
      this.layoutColumns();
      if (!this.initializing) this.dispatch('displayedColumnsChanged', { source: 'api' });
    }
    if (this.groupMode) {
      if (!skipFilter || !this.filterPreds) this.applyFilters();
      this.runGroupPipeline(this.filterPreds, this.makeSortComparator());
      // setState/initialState 의 그룹 펼침 (그룹 노드가 생긴 뒤에만 가능)
      if (this.pendingExpansion && this.applyExpansionIds()) this.runGroupPipeline(this.filterPreds, this.makeSortComparator());
    } else if (this.isPivotActive()) {
      if (!skipFilter || !this.filterPreds) this.applyFilters();
      this.runPivotTotalsOnly(this.filterPreds);
    } else {
      if (!skipFilter) this.applyFilters();
      this.applySort();
      this.buildDisplayed();
      if (this.grandTotalPinned) {
        this.grandTotalPinned = null;
        this.mergePinnedRows();
      }
    }
    // 루트 노드 집계 (alwaysAggregateAtRootLevel · 총합계 행 · 피벗)
    this.aggregateRoot();
    // 수동 고정 행: 원본이 지워졌으면 빠지고, data 가 바뀌었으면 복제도 따라감
    if (this.manualPins && (this.manualPins.top.length || this.manualPins.bottom.length || this.manualCloneCache?.size)) this.mergePinnedRows();
    if (resetPage) this.currentPage = 0;
    this.updatePagination();
    this.computeRowTops();
    this.clampFocusAndRanges();
    // 필터·정렬·데이터 변경으로 편집 중인 행이 사라지면 편집 취소 (에디터·선택 목록이 허공에 남지 않게).
    // 포커스는 그대로 (플로팅 필터에 입력 중일 수 있음)
    const en = this.editing?.node;
    if (en && !en.rowPinned && !en.displayed && !this.initializing) this.stopEditing(true, { noFocus: true });
    this.notify();
    if (silent || this.initializing) return;
    this.dispatch('modelUpdated', { newData, newPage: false, keepRenderedRows, animate: false });
    if (this.gos.pagination) {
      this.dispatch('paginationChanged', {
        newData,
        newPage: false,
        newPageSize,
        keepRenderedRows,
        animate: false,
      });
    }
  },

  applyFilters() {
    let preds = [];
    this.postPivotQuick = null;
    // 고급 필터가 켜지면 컬럼 필터 대신 고급 필터 모델만 적용
    const advanced = this.isAdvancedFilterEnabled();
    if (advanced && this.advancedFilterModel) {
      const m = this.advancedFilterModel;
      preds.push(node => this.advancedPasses(m, node));
    }
    for (const [colId, model] of advanced ? [] : this.filterModels) {
      const col = this.columnById.get(colId);
      if (!col || !this.isFilterModelActive(col, model)) continue;
      const pred = this.makeColumnFilterPredicate(col, model);
      if (pred) preds.push(pred);
    }
    const qt = this.gos.quickFilterText;
    if (qt && String(qt).trim()) {
      const parser = this.gos.quickFilterParser;
      const matcher = this.gos.quickFilterMatcher;
      const parts = parser ? parser(String(qt)) : String(qt).trim().toLowerCase().split(/\s+/);
      // 피벗: 기본은 집계가 끝난 그룹 행(피벗 결과)에 적용. applyQuickFilterBeforePivotOrAgg 면 원본 행에 먼저
      if (this.isPivotActive() && !this.gos.applyQuickFilterBeforePivotOrAgg) this.postPivotQuick = { parts, matcher };
      else
        preds.push(node => {
          const text = this.getQuickFilterText(node);
          return matcher ? matcher(parts, text) : parts.every(p => text.includes(p));
        });
    }
    const extPresent = this.gos.isExternalFilterPresent;
    if (typeof extPresent === 'function' && extPresent({ api: this.api, context: this.gos.context })) {
      const pass = this.gos.doesExternalFilterPass;
      if (typeof pass === 'function') preds.push(node => pass(node));
    }
    // alwaysPassFilter: true 인 행은 어떤 필터에도 남음
    const always = this.gos.alwaysPassFilter;
    if (typeof always === 'function' && preds.length) {
      const all = preds.slice();
      preds = [node => !!always(node) || all.every(p => p(node))];
    }
    this.filterPreds = preds;
    if (!this.groupMode) {
      this.filteredNodes = preds.length ? this.rootNodes.filter(n => preds.every(p => p(n))) : this.rootNodes;
    }
    this.updateFilterActiveFlags();
  },

  updateFilterActiveFlags() {
    this.allColumns.forEach(c => {
      c.filterActive = this.isFilterModelActive(c, this.filterModels.get(c.colId));
    });
  },

  // 그룹 모드 형제 정렬용 비교자 (기본 비교자 + colDef.comparator)
  makeSortComparator() {
    const sortCols = this.allColumns.filter(c => c.sort).sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    if (!sortCols.length) return null;
    const accented = !!this.gos.accentedSort;
    return (a, b) => {
      for (const c of sortCols) {
        const desc = c.sort === 'desc';
        // 행 그룹 컬럼 정렬: 그 컬럼으로 묶인 그룹 행끼리는 그룹 값(key) 으로
        const own = n => n.rowGroupColumn === c || n.rowGroupColumn?.hierarchySource === c;
        const grp = a.group && b.group && a.rowGroupColumn === b.rowGroupColumn && own(a);
        const va = grp ? (a.groupSortValue ?? a.groupValue ?? a.key) : this.getCellValue(a, c);
        const vb = grp ? (b.groupSortValue ?? b.groupValue ?? b.key) : this.getCellValue(b, c);
        const cmp = c.colDef.comparator;
        const r = cmp ? cmp(va, vb, a, b, desc) : defaultComparator(va, vb, accented);
        if (r !== 0) return desc ? -r : r;
      }
      return 0;
    };
  },

  getQuickFilterText(node) {
    // 피벗 모드에서 원본 행에 먼저 적용할 때(applyQuickFilterBeforePivotOrAgg)는 화면 컬럼이 피벗 결과라 원본 컬럼 기준
    const pivot = this.isPivotActive();
    if (node.__quickFilterText != null && node.__qfVer === this.quickFilterVersion && node.__qfPivot === pivot) {
      return node.__quickFilterText;
    }
    const cols = pivot
      ? this.allColumns.filter(c => !c.isPivotResult && !c.autoType)
      : this.gos.includeHiddenColumnsInQuickFilter
        ? this.allColumns
        : this.displayedColumns;
    const parts = [];
    for (const c of cols) {
      if (c.isAuto) continue;
      let v = this.getCellValue(node, c);
      const qf = c.colDef.getQuickFilterText;
      if (qf) v = qf({ ...this.makeValueParams(node, c), value: v });
      if (v != null && v !== '') parts.push(String(v).toLowerCase());
    }
    node.__quickFilterText = parts.join('\n');
    node.__qfVer = this.quickFilterVersion;
    node.__qfPivot = pivot;
    return node.__quickFilterText;
  },

  applySort() {
    const sortCols = this.allColumns.filter(c => c.sort).sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    if (!sortCols.length) {
      this.sortedNodes = this.filteredNodes;
      return;
    }
    this.sortedNodes = this.keyedSort(this.filteredNodes, sortCols);
    const post = this.gos.postSortRows;
    if (typeof post === 'function') post({ nodes: this.sortedNodes, api: this.api, context: this.gos.context });
  },

  // 기본 비교자와 같은 결과(null 은 오름차순 앞, 동률은 원래 순서 유지)를 내는 키 정렬.
  // 컬럼마다 값을 한 번만 읽어 타입별 키 배열로 만든다: 숫자 → Float64Array, 문자열 → 직접 비교,
  // 그 외/colDef.comparator → 일반 비교자. 단일·다중 정렬 공통.
  keyedSort(nodes, sortCols) {
    const n = nodes.length;
    const accented = !!this.gos.accentedSort;
    const NUM = 0;
    const STR = 1;
    const GEN = 2;
    const specs = sortCols.map(col => {
      const desc = col.sort === 'desc';
      const cmp = col.colDef.comparator;
      const vals = new Array(n);
      let allNum = true;
      let allStr = true;
      for (let i = 0; i < n; i++) {
        const v = this.getCellValue(nodes[i], col);
        vals[i] = v;
        if (v == null) continue;
        if (typeof v !== 'number') allNum = false;
        if (typeof v !== 'string') allStr = false;
      }
      const spec = { desc, dir: desc ? -1 : 1, cmp, vals, kind: GEN };
      if (!cmp && allNum) {
        spec.kind = NUM;
        spec.keys = new Float64Array(n);
        spec.nul = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          if (vals[i] == null) spec.nul[i] = 1;
          else spec.keys[i] = vals[i];
        }
      } else if (!cmp && allStr && !accented) {
        // 문자열 → 고유값 순위(정수)로 치환해 숫자 비교 (고유값이 행 수보다 충분히 적을 때 이득)
        const uniq = new Map();
        for (let i = 0; i < n; i++) if (vals[i] != null && !uniq.has(vals[i])) uniq.set(vals[i], 0);
        if (uniq.size < n * 0.5) {
          const sorted = [...uniq.keys()].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
          sorted.forEach((v, r) => uniq.set(v, r));
          spec.kind = NUM;
          spec.keys = new Float64Array(n);
          spec.nul = new Uint8Array(n);
          for (let i = 0; i < n; i++) {
            if (vals[i] == null) spec.nul[i] = 1;
            else spec.keys[i] = uniq.get(vals[i]);
          }
        } else spec.kind = STR;
      }
      return spec;
    });
    const k = specs.length;
    const idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort((a, b) => {
      for (let j = 0; j < k; j++) {
        const s = specs[j];
        if (s.kind === NUM) {
          const na = s.nul[a];
          const nb = s.nul[b];
          if (na || nb) {
            if (na && nb) continue;
            return (na ? -1 : 1) * s.dir;
          }
          const d = s.keys[a] - s.keys[b];
          if (d) return d > 0 ? s.dir : -s.dir;
        } else if (s.kind === STR) {
          const x = s.vals[a];
          const y = s.vals[b];
          if (x === y) continue;
          if (x == null || y == null) return (x == null ? -1 : 1) * s.dir;
          return (x < y ? -1 : 1) * s.dir;
        } else {
          const r = s.cmp ? s.cmp(s.vals[a], s.vals[b], nodes[a], nodes[b], s.desc) : defaultComparator(s.vals[a], s.vals[b], accented);
          if (r) return s.desc ? -r : r;
        }
      }
      return a - b;
    });
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = nodes[idx[i]];
    return out;
  },

  buildDisplayed() {
    for (const n of this.rootNodes) {
      n.rowIndex = null;
      n.displayed = false;
    }
    const md = !!this.gos.masterDetail;
    let out;
    if (md) {
      out = [];
      for (const n of this.sortedNodes) {
        out.push(n);
        if (n.master && n.expanded) out.push(this.getDetailNode(n));
      }
    } else {
      out = this.sortedNodes === this.rootNodes ? this.rootNodes.slice() : this.sortedNodes;
    }
    for (let i = 0; i < out.length; i++) {
      out[i].rowIndex = i;
      out[i].displayed = true;
    }
    this.displayedNodes = out;
  },

  getPageSize() {
    if (this.gos.paginationAutoPageSize) {
      const h = this.getDefaultRowHeight();
      return Math.max(1, Math.floor((this.bodyHeight || h * 10) / h));
    }
    return this.pageSizeOverride ?? this.gos.paginationPageSize ?? 100;
  },

  // 페이지 단위(행) 시작 rowIndex 목록. null 이면 표시 행 하나하나가 단위.
  // paginateChildRows=false(기본) 면 그룹은 최상위 행, 마스터/디테일은 마스터 행 기준으로 자르고
  // 펼친 자식·상세 행은 부모와 같은 페이지에 둔다.
  getPageUnitStarts() {
    if (this.gos.paginateChildRows) return null;
    if (this.groupMode) {
      const top = this.groupSortedTop || [];
      if (top.length === this.displayedNodes.length) return null;
      const out = [];
      for (const n of top) if (n.displayed) out.push(n.rowIndex);
      return out;
    }
    if (this.gos.masterDetail && this.sortedNodes.length !== this.displayedNodes.length) {
      return this.sortedNodes.map(n => n.rowIndex);
    }
    return null;
  },

  updatePagination() {
    const total = this.displayedNodes.length;
    const units = this.getPageUnitStarts();
    const unitCount = units ? units.length : total;
    this.paginationRowCount = unitCount;
    if (!this.gos.pagination) {
      this.pageFirstRow = 0;
      this.pageLastRow = total;
      this.totalPages = total ? 1 : 0;
      this.currentPage = 0;
      return;
    }
    const size = this.getPageSize();
    this.totalPages = Math.ceil(unitCount / size);
    this.currentPage = clamp(this.currentPage, 0, Math.max(0, this.totalPages - 1));
    if (!unitCount) {
      this.pageFirstRow = 0;
      this.pageLastRow = 0;
      return;
    }
    const firstUnit = this.currentPage * size;
    const nextUnit = (this.currentPage + 1) * size;
    if (!units) {
      this.pageFirstRow = firstUnit;
      this.pageLastRow = Math.min(total, nextUnit);
    } else {
      this.pageFirstRow = units[firstUnit];
      this.pageLastRow = nextUnit < units.length ? units[nextUnit] : total;
    }
  },

  getDefaultRowHeight() {
    return this.gos.rowHeight ?? DEFAULT_ROW_HEIGHT;
  },

  computeRowTops() {
    const def = this.getDefaultRowHeight();
    const getRowHeight = this.gos.getRowHeight;
    const detailH = this.gos.detailRowHeight ?? DEFAULT_DETAIL_ROW_HEIGHT;
    const start = this.pageFirstRow;
    const end = this.pageLastRow;
    const count = end - start;
    let uniform = typeof getRowHeight !== 'function';
    if (uniform) {
      for (let i = start; i < end; i++) {
        const n = this.displayedNodes[i];
        if (n.detail || n.__explicitHeight != null || n.__autoHeight != null) {
          uniform = false;
          break;
        }
      }
    }
    if (uniform) {
      this.uniformRowHeight = def;
      this.rowTops = null;
      this.pageHeight = count * def;
      for (let i = 0; i < count; i++) {
        const n = this.displayedNodes[start + i];
        n.rowTop = i * def;
        n.rowHeight = def;
      }
      return;
    }
    const tops = new Float64Array(count + 1);
    for (let i = 0; i < count; i++) {
      const n = this.displayedNodes[start + i];
      let h;
      if (n.__explicitHeight != null) h = n.__explicitHeight;
      else if (n.detail) h = n.__autoHeight ?? detailH;
      else if (n.__autoHeight != null) h = n.__autoHeight;
      else if (typeof getRowHeight === 'function') {
        h = getRowHeight({ node: n, data: n.data, api: this.api, context: this.gos.context }) ?? def;
      } else h = def;
      n.rowHeight = h;
      n.rowTop = tops[i];
      tops[i + 1] = tops[i] + h;
    }
    this.rowTops = tops;
    this.pageHeight = tops[count];
  },

  onRowHeightChanged() {
    this.computeRowTops();
    this.notify();
  },

  setAutoRowHeight(node, h) {
    if (node.__autoHeight === h) return false;
    node.__autoHeight = h;
    return true;
  },

  getRowCountInPage() {
    return this.pageLastRow - this.pageFirstRow;
  },

  getPageNode(i) {
    return this.displayedNodes[this.pageFirstRow + i];
  },

  rowTopAt(i) {
    return this.rowTops ? this.rowTops[i] : i * this.uniformRowHeight;
  },

  rowHeightAt(i) {
    return this.rowTops ? this.rowTops[i + 1] - this.rowTops[i] : this.uniformRowHeight;
  },

  // 페이지 내 픽셀 → 페이지 내 인덱스
  indexAtPixel(y) {
    const count = this.getRowCountInPage();
    if (!count) return 0;
    if (!this.rowTops) return clamp(Math.floor(y / this.uniformRowHeight), 0, count - 1);
    let lo = 0;
    let hi = count - 1;
    const t = this.rowTops;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (t[mid] <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  },

  clampFocusAndRanges() {
    const total = this.displayedNodes.length;
    if (this.focus && !this.focus.rowPinned && this.focus.rowIndex >= total) {
      this.focus = total ? { ...this.focus, rowIndex: total - 1 } : null;
    }
    if (this.ranges.length) {
      this.ranges = this.ranges.filter(r => r.startRowIndex < total && r.endRowIndex < total);
    }
  },

  // ── 필터 api ─────────────────────────────────────────────
  getFilterModel() {
    const out = {};
    for (const [k, v] of this.filterModels) {
      if (this.isFilterModelActive(this.columnById.get(k), v)) out[k] = v;
    }
    return out;
  },

  setFilterModel(model) {
    const prevCustom = [...this.filterModels.keys()].map(k => this.columnById.get(k)).filter(c => this.isCustomFilter(c));
    this.filterModels.clear();
    let custom = false;
    if (model) {
      Object.keys(model).forEach(k => {
        const col = this.getColumn(k);
        if (!col || model[k] == null) return;
        this.filterModels.set(col.colId, model[k]);
        if (this.isCustomFilter(col)) {
          custom = true;
          this.applyCustomFilterModel(col, model[k]);
        }
      });
    }
    // 빠진 커스텀 필터는 null 로 초기화
    prevCustom.forEach(c => {
      if (this.filterModels.has(c.colId)) return;
      custom = true;
      this.applyCustomFilterModel(c, null);
    });
    // 커스텀 필터는 컴포넌트가 새 모델로 렌더된 뒤 적용
    if (custom) {
      this.notify();
      this.scheduleFilterChanged('api', []);
    } else this.onFilterChanged('api');
  },

  setColumnFilterModel(key, model, apply = true) {
    const col = this.getColumn(key);
    if (!col) return;
    if (model == null) this.filterModels.delete(col.colId);
    else this.filterModels.set(col.colId, model);
    if (this.isCustomFilter(col)) {
      this.applyCustomFilterModel(col, model ?? null);
      this.notify();
      if (apply) this.scheduleFilterChanged('columnFilter', [col]);
      return;
    }
    if (apply) this.onFilterChanged('columnFilter', [col]);
  },

  getColumnFilterModel(key) {
    const col = this.getColumn(key);
    if (!col) return null;
    return this.filterModels.get(col.colId) ?? null;
  },

  onFilterChanged(source = 'api', columns) {
    this.quickFilterVersion++;
    if (this.isSsrm()) {
      this.updateFilterActiveFlags();
      this.ssrmOnFilterChanged();
    } else this.refreshModel({ resetPage: true, byFilter: true });
    this.dispatch('filterChanged', {
      source,
      columns: columns ?? [],
      afterFloatingFilter: false,
      afterDataChange: false,
    });
  },

  isAnyFilterPresent() {
    if (this.isAdvancedFilterEnabled() && this.advancedFilterModel) return true;
    for (const [k, v] of this.filterModels) if (this.isFilterModelActive(this.columnById.get(k), v)) return true;
    if (this.gos.quickFilterText && String(this.gos.quickFilterText).trim()) return true;
    const ext = this.gos.isExternalFilterPresent;
    return typeof ext === 'function' && !!ext({ api: this.api, context: this.gos.context });
  },

  // Set 필터 목록 (전체 행 기준 고유값)
  getSetFilterValues(column) {
    const cd = column.colDef;
    const fp = cd.filterParams || {};
    if (Array.isArray(fp.values)) {
      return fp.values.map(v => ({ key: setFilterKey(v, fp, { colDef: cd, column }), value: v }));
    }
    const map = new Map();
    for (const node of this.rootNodes) {
      const v = cd.filterValueGetter
        ? typeof cd.filterValueGetter === 'function'
          ? cd.filterValueGetter(this.makeValueParams(node, column))
          : getFieldValue(node.data, cd.filterValueGetter)
        : this.getCellValue(node, column);
      const add = x => {
        const key = setFilterKey(x, fp, { node, data: node.data, colDef: cd, column });
        if (!map.has(key)) map.set(key, x);
      };
      if (Array.isArray(v)) {
        if (!v.length) add(null);
        else v.forEach(add);
      } else add(v);
    }
    const entries = [...map.entries()].map(([key, value]) => ({ key, value }));
    const cmp = fp.comparator;
    entries.sort((a, b) => {
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      if (cmp) return cmp(a.value, b.value);
      if (typeof a.value === 'number' && typeof b.value === 'number') return a.value - b.value;
      return defaultComparator(a.key, b.key, false);
    });
    return entries;
  },

  formatSetFilterLabel(column, entry) {
    if (entry.key === null) return localeText(this, 'blanks');
    const fp = column.colDef.filterParams || {};
    const p = {
      value: entry.value,
      colDef: column.colDef,
      column,
      api: this.api,
      context: this.gos.context,
      node: null,
      data: null,
    };
    if (typeof fp.valueFormatter === 'function') {
      const r = fp.valueFormatter(p);
      if (r != null) return String(r);
    }
    return toText(entry.value);
  },

  // ── 정렬 api ─────────────────────────────────────────────
  toggleColumnSort(column, multi, source = 'uiColumnSorted') {
    const order = column.colDef.sortingOrder ?? this.gos.sortingOrder ?? ['asc', 'desc', null];
    const cur = column.sort ?? null;
    const idx = order.indexOf(cur);
    const next = order[(idx + 1) % order.length] ?? null;
    this.setColumnSort(column, next, multi || !!this.gos.alwaysMultiSort, source);
  },

  setColumnSort(column, sort, multi, source = 'api') {
    if (!multi) {
      this.allColumns.forEach(c => {
        if (c !== column) {
          c.sort = null;
          c.sortIndex = null;
        }
      });
    }
    const wasSorted = !!column.sort;
    column.sort = sort || null;
    if (column.sort && (!wasSorted || !multi)) column.sortIndex = multi ? 1e9 : 0;
    const sorted = this.allColumns.filter(c => c.sort).sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    sorted.forEach((c, i) => {
      c.sortIndex = i;
    });
    if (!column.sort) column.sortIndex = null;
    if (this.isSsrm()) this.ssrmOnSortChanged();
    else this.refreshModel({ skipFilter: true });
    this.dispatch('sortChanged', { source, columns: [column] });
  },
};
