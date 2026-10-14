// 사용자 필터 컴포넌트 (colDef.filter = 컴포넌트 | components 등록명)
//  - reactive (기본, reactiveCustomComponents !== false): props.model / props.onModelChange + useGridFilter({ doesFilterPass })
//  - imperative (reactiveCustomComponents: false): ref 로 isFilterActive / doesFilterPass / getModel / setModel,
//    props.filterChangedCallback() 호출 시 필터 적용
// 인스턴스는 고정 DOM(entry.el)에 portal 로 렌더 → 팝업을 닫았다 열어도 상태 유지
import { createFilterPredicate, isModelActive, resolveFilterKind } from './filterService.js';
import { getFieldValue } from './utils.js';

// 핸들러 방식 필터: colDef.filter = { component, doesFilterPass? , handler? }
//  - 모델은 그리드가 보관. component 는 model/state 를 받아 그리기만, 바꾸면 onModelChange / onStateChange / onAction
//  - 거르기는 doesFilterPass({ model, node, data, ... }) 또는 handler(키 → gridOptions.filterHandlers, 또는 함수)가 만든 객체의 doesFilterPass
export function isHandlerFilterDef(f) {
  return !!f && typeof f === 'object' && !f.$$typeof && ('component' in f || 'handler' in f || 'doesFilterPass' in f);
}

export const customFilterMethods = {
  isHandlerFilter(col) {
    return !!col && isHandlerFilterDef(col.colDef.filter);
  },

  // 컬럼의 필터 핸들러 (한 번 만들고 재사용). doesFilterPass 만 있으면 그걸 감싼 객체
  getFilterHandler(col) {
    if (!this.isHandlerFilter(col)) return null;
    const def = col.colDef.filter;
    const cache = (this.filterHandlerCache ||= new Map());
    const hit = cache.get(col.colId);
    if (hit && hit.def === def) return hit.handler;
    hit?.handler?.destroy?.();
    let handler;
    const h = def.handler;
    const make = typeof h === 'string' ? this.gos.filterHandlers?.[h] : h;
    if (!def.doesFilterPass && typeof make === 'function') {
      handler = make({ colDef: col.colDef, column: col, api: this.api, context: this.gos.context }) || {};
      handler.init?.(this.filterHandlerParams(col, 'init'));
    } else handler = { doesFilterPass: def.doesFilterPass };
    cache.set(col.colId, { def, handler });
    return handler;
  },

  filterHandlerParams(col, source) {
    return {
      model: this.filterModels.get(col.colId) ?? null,
      source,
      column: col,
      colDef: col.colDef,
      filterParams: col.colDef.filterParams || {},
      getValue: (node, c) => this.getFilterValue(node, c ?? col),
      onModelChange: m => this.setHandlerFilterModel(col, m),
      api: this.api,
      context: this.gos.context,
    };
  },

  // 핸들러 필터 모델 적용 (onModelChange · apply 버튼 · api)
  setHandlerFilterModel(col, model, source = 'columnFilter') {
    const h = this.getFilterHandler(col);
    let m = model ?? null;
    if (typeof h?.processModelToApply === 'function') m = h.processModelToApply(m) ?? null;
    if (m == null) this.filterModels.delete(col.colId);
    else this.filterModels.set(col.colId, m);
    const e = this.customFilters?.get(col.colId);
    if (e) e.pending = undefined;
    h?.refresh?.({ ...this.filterHandlerParams(col, source), model: m });
    this.onFilterChanged(source, [col]);
  },

  // 화면에서 아직 적용 안 한 값 (apply 버튼이 있을 때)
  getHandlerFilterState(col) {
    const e = this.customFilters?.get(col.colId);
    return e && e.pending !== undefined ? e.pending : { model: this.filterModels.get(col.colId) ?? null };
  },

  setHandlerFilterState(col, state) {
    const e = this.getCustomFilterEntry(col, true);
    e.pending = state;
    this.dispatch('filterModified', { column: col, filterInstance: null });
    this.notify();
  },

  // 필터 버튼 동작: apply(적용) · clear(입력만 비움) · reset(비우고 해제) · cancel(적용된 값으로 되돌림)
  doFilterAction({ colId, action } = {}) {
    const cols = colId ? [this.getColumn(colId)].filter(Boolean) : this.allColumns.filter(c => this.isHandlerFilter(c));
    for (const col of cols) {
      if (!this.isHandlerFilter(col)) continue;
      const e = this.customFilters?.get(col.colId);
      if (action === 'apply') this.setHandlerFilterModel(col, e && e.pending !== undefined ? e.pending.model : (this.filterModels.get(col.colId) ?? null));
      else if (action === 'clear') this.setHandlerFilterState(col, { model: null });
      else if (action === 'reset') this.setHandlerFilterModel(col, null);
      else if (action === 'cancel' && e) {
        e.pending = undefined;
        this.notify();
      }
    }
  },

  filterKindOf(col) {
    return resolveFilterKind(col.colDef, this.gos.components, this.gos, col);
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
      const el = typeof document !== 'undefined' ? document.createElement('div') : null;
      if (el) el.className = 'r2-filter-custom-host';
      e = { colId: col.colId, el, callbacks: null, inst: null, pendingModel: undefined };
      this.customFilters.set(col.colId, e);
      this.notify();
    }
    return e ?? null;
  },

  // 모델 활성 판정: 빌트인은 모델 내용, reactive 커스텀은 model != null, imperative 는 isFilterActive()
  isFilterModelActive(col, model) {
    if (this.isHandlerFilter(col)) return model != null;
    if (!this.isCustomFilter(col)) return isModelActive(model);
    const e = this.customFilters?.get(col.colId);
    if (e?.inst && typeof e.inst.isFilterActive === 'function') return !!e.inst.isFilterActive();
    return model != null;
  },

  makeColumnFilterPredicate(col, model) {
    if (this.isHandlerFilter(col)) {
      const h = this.getFilterHandler(col);
      if (typeof h?.doesFilterPass !== 'function') return null;
      const base = this.filterHandlerParams(col, 'filter');
      return node => h.doesFilterPass({ ...base, model, node, data: node.data, handlerParams: base });
    }
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
    if (this.isHandlerFilter(col)) {
      const e = this.customFilters?.get(col.colId);
      if (e) e.pending = undefined;
      this.getFilterHandler(col)?.refresh?.({ ...this.filterHandlerParams(col, 'api'), model: model ?? null });
      return;
    }
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
    if (this.isHandlerFilter(col)) return null;
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
