// 사용자 필터 컴포넌트 (colDef.filter = 컴포넌트 | components 등록명)
//  - reactive (기본, reactiveCustomComponents !== false): props.model / props.onModelChange + useGridFilter({ doesFilterPass })
//  - imperative (reactiveCustomComponents: false): ref 로 isFilterActive / doesFilterPass / getModel / setModel,
//    props.filterChangedCallback() 호출 시 필터 적용
// 인스턴스는 고정 DOM(entry.el)에 portal 로 렌더 → 팝업을 닫았다 열어도 상태 유지
import { createFilterPredicate, isModelActive, resolveFilterKind } from './filterService.js';
import { getFieldValue } from './utils.js';

export const customFilterMethods = {
  filterKindOf(col) {
    return resolveFilterKind(col.colDef, this.gos.components);
  },

  isCustomFilter(col) {
    return !!col && this.filterKindOf(col) === 'custom';
  },

  isReactiveFilters() {
    return this.gos.reactiveCustomComponents !== false;
  },

  getCustomFilterEntry(col, create) {
    if (!this.customFilters) this.customFilters = new Map();
    let e = this.customFilters.get(col.colId);
    if (!e && create) {
      const el = document.createElement('div');
      el.className = 'r2-filter-custom-host';
      e = { colId: col.colId, el, callbacks: null, inst: null, pendingModel: undefined };
      this.customFilters.set(col.colId, e);
      this.notify();
    }
    return e ?? null;
  },

  // 모델 활성 판정: 빌트인은 모델 내용, reactive 커스텀은 model != null, imperative 는 isFilterActive()
  isFilterModelActive(col, model) {
    if (!this.isCustomFilter(col)) return isModelActive(model);
    const e = this.customFilters?.get(col.colId);
    if (e?.inst && typeof e.inst.isFilterActive === 'function') return !!e.inst.isFilterActive();
    return model != null;
  },

  makeColumnFilterPredicate(col, model) {
    if (!this.isCustomFilter(col)) return createFilterPredicate(this, col, model);
    const e = this.customFilters?.get(col.colId);
    if (e?.inst && typeof e.inst.doesFilterPass === 'function') {
      return node => e.inst.doesFilterPass({ node, data: node.data });
    }
    const dfp = e?.callbacks?.doesFilterPass;
    if (typeof dfp === 'function') return node => dfp({ node, data: node.data, model });
    return null; // 컴포넌트 마운트 전 → 마운트 후 scheduleFilterChanged 로 재적용
  },

  // props.getValue(node, column?) — filterValueGetter 우선
  getFilterValue(node, colKey) {
    const col = this.getColumn(colKey);
    if (!col || !node) return undefined;
    const fvg = col.colDef.filterValueGetter;
    if (fvg) return typeof fvg === 'function' ? fvg(this.makeValueParams(node, col)) : getFieldValue(node.data, fvg);
    return this.getCellValue(node, col);
  },

  // props.doesRowPassOtherFilter(node) — 이 컬럼을 뺀 나머지 컬럼 필터 통과 여부
  doesRowPassOtherFilters(node, col) {
    for (const [colId, model] of this.filterModels) {
      if (colId === col.colId) continue;
      const c = this.columnById.get(colId);
      if (!c || !this.isFilterModelActive(c, model)) continue;
      const p = this.makeColumnFilterPredicate(c, model);
      if (p && !p(node)) return false;
    }
    return true;
  },

  // reactive 필터 UI 에서 onModelChange
  onCustomFilterModelChange(col, model) {
    if (model == null) this.filterModels.delete(col.colId);
    else this.filterModels.set(col.colId, model);
    this.notify(); // 새 model 로 리렌더 → useGridFilter 콜백 갱신 후 필터 적용
    this.scheduleFilterChanged('columnFilter', [col]);
  },

  // imperative 필터의 filterChangedCallback
  onImperativeFilterChanged(col) {
    const e = this.customFilters?.get(col.colId);
    const inst = e?.inst;
    let m = typeof inst?.getModel === 'function' ? inst.getModel() : undefined;
    if (m == null && inst?.isFilterActive?.()) m = {};
    if (m == null) this.filterModels.delete(col.colId);
    else this.filterModels.set(col.colId, m);
    this.onFilterChanged('columnFilter', [col]);
  },

  // api(setFilterModel 등) 로 커스텀 컬럼 모델 지정
  applyCustomFilterModel(col, model) {
    const e = this.getCustomFilterEntry(col, true);
    if (e.inst && typeof e.inst.setModel === 'function') e.inst.setModel(model);
    else if (!this.isReactiveFilters()) e.pendingModel = model;
  },

  registerCustomFilterCallbacks(colId, callbacks) {
    const e = this.customFilters?.get(colId);
    if (e) e.callbacks = callbacks || null;
  },

  attachCustomFilterInstance(colId, inst) {
    const e = this.customFilters?.get(colId);
    if (!e) return;
    e.inst = inst || null;
    if (inst && e.pendingModel !== undefined) {
      const m = e.pendingModel;
      e.pendingModel = undefined;
      if (typeof inst.setModel === 'function') inst.setModel(m);
      this.scheduleFilterChanged('api', []);
    }
  },

  // 컴포넌트가 새 모델로 렌더된 뒤(React 커밋 후) 필터 적용
  scheduleFilterChanged(source, cols) {
    if (this.pendingFilterChange) {
      cols.forEach(c => {
        if (!this.pendingFilterChange.cols.includes(c)) this.pendingFilterChange.cols.push(c);
      });
      return;
    }
    this.pendingFilterChange = { source, cols: [...cols] };
    const t = setTimeout(() => {
      this.timers.delete(t);
      const p = this.pendingFilterChange;
      this.pendingFilterChange = null;
      if (p && !this.destroyed) this.onFilterChanged(p.source, p.cols);
    }, 0);
    this.timers.add(t);
  },

  getCustomFilterInstance(col) {
    const e = this.getCustomFilterEntry(col, true);
    if (e.inst) return e.inst;
    return {
      getModel: () => this.filterModels.get(col.colId) ?? null,
      setModel: model => {
        this.setColumnFilterModel(col, model, true);
        return Promise.resolve();
      },
      isFilterActive: () => this.isFilterModelActive(col, this.filterModels.get(col.colId)),
      doesFilterPass: params => {
        const p = this.makeColumnFilterPredicate(col, this.filterModels.get(col.colId));
        return p ? p(params.node) : true;
      },
    };
  },
};
