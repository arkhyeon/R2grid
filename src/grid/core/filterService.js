// 필터 모델/평가. 모델 형태는 AG-Grid 와 동일:
//  text   : { filterType:'text', type:'contains', filter:'abc' } | { filterType:'text', operator:'AND', conditions:[...] }
//  number : { filterType:'number', type:'equals', filter: 5, filterTo?: 10 }
//  date   : { filterType:'date', type:'equals', dateFrom:'2024-01-01 00:00:00', dateTo? }
//  set    : { filterType:'set', values:['a', null] }
import { canonName, getFieldValue, toText } from './utils.js';

export const TEXT_FILTER_TYPES = [
  'contains',
  'notContains',
  'equals',
  'notEqual',
  'startsWith',
  'endsWith',
  'blank',
  'notBlank',
];
export const NUMBER_FILTER_TYPES = [
  'equals',
  'notEqual',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'inRange',
  'blank',
  'notBlank',
];
export const DATE_FILTER_TYPES = ['equals', 'notEqual', 'lessThan', 'greaterThan', 'inRange', 'blank', 'notBlank'];

// colDef.filter → 내부 필터 종류. 사용자 컴포넌트(함수/클래스/components 등록명)는 'custom'
export function resolveFilterKind(colDef, components) {
  const f = canonName(colDef.filter);
  if (!f) return null;
  if (f === true) return 'set'; // 엔터프라이즈 기본: Set 필터
  if (typeof f === 'string') {
    if (f === 'r2TextColumnFilter') return 'text';
    if (f === 'r2NumberColumnFilter') return 'number';
    if (f === 'r2DateColumnFilter') return 'date';
    if (f === 'r2SetColumnFilter') return 'set';
    if (f === 'r2MultiColumnFilter') return 'set';
    if (components && components[f]) return 'custom';
    return 'text';
  }
  if (typeof f === 'function' || typeof f === 'object') return 'custom';
  return 'text';
}

export function resolveCustomFilterImpl(colDef, components) {
  const f = colDef.filter;
  return typeof f === 'string' ? components?.[f] : f;
}

export function defaultFilterType(kind) {
  if (kind === 'number' || kind === 'date') return 'equals';
  return 'contains';
}

const isBlankValue = v => v == null || (typeof v === 'string' && v.trim() === '');

export function textConditionPasses(cond, raw, filterParams) {
  const type = cond.type || 'contains';
  if (type === 'blank') return isBlankValue(raw);
  if (type === 'notBlank') return !isBlankValue(raw);
  const filterText = cond.filter;
  if (filterText == null || filterText === '') return true;
  if (raw == null) return type === 'notEqual' || type === 'notContains';
  const fmt =
    filterParams?.textFormatter ||
    (filterParams?.caseSensitive ? s => s : s => s.toLocaleLowerCase());
  const v = fmt(toText(raw));
  const f = fmt(String(filterText));
  if (filterParams?.textMatcher) {
    return filterParams.textMatcher({ filterOption: type, value: v, filterText: f });
  }
  switch (type) {
    case 'contains':
      return v.includes(f);
    case 'notContains':
      return !v.includes(f);
    case 'equals':
      return v === f;
    case 'notEqual':
      return v !== f;
    case 'startsWith':
      return v.startsWith(f);
    case 'endsWith':
      return v.endsWith(f);
    default:
      return true;
  }
}

const toNum = v => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? null : n;
};

export function numberConditionPasses(cond, raw, filterParams) {
  const type = cond.type || 'equals';
  if (type === 'blank') return raw == null || raw === '';
  if (type === 'notBlank') return !(raw == null || raw === '');
  const f = toNum(cond.filter);
  if (f == null) return true;
  const v = toNum(raw);
  if (v == null) {
    if (type === 'notEqual') return filterParams?.includeBlanksInNotEqual !== false;
    if (type === 'equals') return !!filterParams?.includeBlanksInEquals;
    if (type === 'lessThan' || type === 'lessThanOrEqual') return !!filterParams?.includeBlanksInLessThan;
    if (type === 'greaterThan' || type === 'greaterThanOrEqual')
      return !!filterParams?.includeBlanksInGreaterThan;
    if (type === 'inRange') return !!filterParams?.includeBlanksInRange;
    return false;
  }
  switch (type) {
    case 'equals':
      return v === f;
    case 'notEqual':
      return v !== f;
    case 'greaterThan':
      return v > f;
    case 'greaterThanOrEqual':
      return v >= f;
    case 'lessThan':
      return v < f;
    case 'lessThanOrEqual':
      return v <= f;
    case 'inRange': {
      const to = toNum(cond.filterTo);
      if (to == null) return true;
      const inclusive = filterParams?.inRangeInclusive;
      return inclusive ? v >= f && v <= to : v > f && v < to;
    }
    default:
      return true;
  }
}

const toDate = v => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const s = String(v).slice(0, 10);
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function dateConditionPasses(cond, raw, filterParams) {
  const type = cond.type || 'equals';
  if (type === 'blank') return raw == null || raw === '';
  if (type === 'notBlank') return !(raw == null || raw === '');
  const from = toDate(cond.dateFrom);
  if (!from) return true;
  const cmp = filterParams?.comparator;
  const cellDate = cmp ? raw : toDate(raw);
  if (cellDate == null) return false;
  const compare = d => (cmp ? cmp(d, raw) * -1 : cellDate.getTime() - d.getTime());
  const c = compare(from);
  switch (type) {
    case 'equals':
      return c === 0;
    case 'notEqual':
      return c !== 0;
    case 'lessThan':
      return c < 0;
    case 'greaterThan':
      return c > 0;
    case 'inRange': {
      const to = toDate(cond.dateTo);
      if (!to) return true;
      return c > 0 && compare(to) < 0;
    }
    default:
      return true;
  }
}

// Set 필터 키: null / '' → null(빈 값)
export function setFilterKey(value, filterParams, params) {
  if (filterParams?.keyCreator) return filterParams.keyCreator({ ...params, value });
  if (value == null || value === '') return null;
  return toText(value);
}

function evaluateCombined(model, single) {
  if (Array.isArray(model.conditions)) {
    if (!model.conditions.length) return true;
    return model.operator === 'OR'
      ? model.conditions.some(single)
      : model.conditions.every(single);
  }
  return single(model);
}

// 필터 1개를 RowNode 하나에 대해 평가하는 함수 생성 (반복 비용 최소화)
export function createFilterPredicate(core, column, model) {
  const colDef = column.colDef;
  const kind = model.filterType || resolveFilterKind(colDef, core.gos.components) || 'text';
  const filterParams = colDef.filterParams || {};
  const valueOf = node => {
    if (colDef.filterValueGetter) {
      const fvg = colDef.filterValueGetter;
      const params = core.makeValueParams(node, column);
      return typeof fvg === 'function' ? fvg(params) : getFieldValue(node.data, fvg);
    }
    return core.getCellValue(node, column);
  };

  if (kind === 'set') {
    if (model.values == null) return () => true;
    const allowed = new Set(model.values);
    return node => {
      const v = valueOf(node);
      if (Array.isArray(v)) {
        if (!v.length) return allowed.has(null);
        return v.some(x => allowed.has(setFilterKey(x, filterParams, { node, data: node.data, colDef, column })));
      }
      return allowed.has(setFilterKey(v, filterParams, { node, data: node.data, colDef, column }));
    };
  }
  if (kind === 'number') {
    return node => {
      const v = valueOf(node);
      return evaluateCombined(model, c => numberConditionPasses(c, v, filterParams));
    };
  }
  if (kind === 'date') {
    return node => {
      const v = valueOf(node);
      return evaluateCombined(model, c => dateConditionPasses(c, v, filterParams));
    };
  }
  return node => {
    const v = valueOf(node);
    return evaluateCombined(model, c => textConditionPasses(c, v, filterParams));
  };
}

// 모델이 실제로 걸러내는 조건을 가지는지 (빈 텍스트 등은 비활성)
export function isModelActive(model) {
  if (!model) return false;
  if (model.filterType === 'set') return Array.isArray(model.values);
  const condActive = c =>
    c &&
    (c.type === 'blank' ||
      c.type === 'notBlank' ||
      (c.filter != null && c.filter !== '') ||
      (c.dateFrom != null && c.dateFrom !== ''));
  if (Array.isArray(model.conditions)) return model.conditions.some(condActive);
  return condActive(model);
}
