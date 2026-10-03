// 고급 필터 (enableAdvancedFilter) — AG AdvancedFilterModel 호환
//  model: { filterType: 'join', type: 'AND'|'OR', conditions: [...] }
//       | { filterType: 'text'|'number'|'date'|'dateString'|'boolean'|'object', colId, type, filter? }
//  식: [컬럼명] contains "abc" AND ([나이] > 20 OR [사용] is true)
import { dateConditionPasses, numberConditionPasses, textConditionPasses } from './filterService.js';

// 연산자: 식 표기 ↔ 모델 type (컬럼 데이터 타입별)
const TEXT_OPS = [
  ['contains', 'contains'],
  ['does not contain', 'notContains'],
  ['=', 'equals'],
  ['!=', 'notEqual'],
  ['begins with', 'startsWith'],
  ['ends with', 'endsWith'],
  ['is blank', 'blank'],
  ['is not blank', 'notBlank'],
];
const NUMBER_OPS = [
  ['=', 'equals'],
  ['!=', 'notEqual'],
  ['>=', 'greaterThanOrEqual'],
  ['<=', 'lessThanOrEqual'],
  ['>', 'greaterThan'],
  ['<', 'lessThan'],
  ['is blank', 'blank'],
  ['is not blank', 'notBlank'],
];
const DATE_OPS = [
  ['=', 'equals'],
  ['!=', 'notEqual'],
  ['is after', 'greaterThan'],
  ['is before', 'lessThan'],
  ['>', 'greaterThan'],
  ['<', 'lessThan'],
  ['is blank', 'blank'],
  ['is not blank', 'notBlank'],
];
const BOOL_OPS = [
  ['is true', 'true'],
  ['is false', 'false'],
  ['is blank', 'blank'],
  ['is not blank', 'notBlank'],
];
export const ADVANCED_OPS = { text: TEXT_OPS, number: NUMBER_OPS, date: DATE_OPS, dateString: DATE_OPS, boolean: BOOL_OPS, object: TEXT_OPS };
const NO_VALUE = new Set(['blank', 'notBlank', 'true', 'false']);

export const advancedFilterMethods = {
  isAdvancedFilterEnabled() {
    return !!this.gos.enableAdvancedFilter && this.isClientSide();
  },

  advancedFilterColumns() {
    const inc = this.gos.includeHiddenColumnsInAdvancedFilter;
    return this.allColumns.filter(
      c => !c.isAuto && !c.autoType && !c.isPivotResult && c.colDef.filter !== false && (inc || c.visible) && (c.colDef.field || c.colDef.valueGetter),
    );
  },

  advancedFilterTypeOf(col) {
    const t = col.dataType || col.colDef.cellDataType;
    if (t === 'number') return 'number';
    if (t === 'boolean') return 'boolean';
    if (t === 'date') return 'date';
    if (t === 'dateString') return 'dateString';
    return 'text';
  },

  getAdvancedFilterModel() {
    return this.advancedFilterModel ?? null;
  },

  setAdvancedFilterModel(model) {
    this.advancedFilterModel = model || null;
    this.advancedFilterText = model ? this.advancedModelToText(model) : '';
    this.onFilterChanged('advancedFilter');
  },

  // 노드가 모델을 통과하는지
  advancedPasses(model, node) {
    if (!model) return true;
    if (model.filterType === 'join') {
      const list = model.conditions || [];
      if (!list.length) return true;
      return model.type === 'OR' ? list.some(c => this.advancedPasses(c, node)) : list.every(c => this.advancedPasses(c, node));
    }
    const col = this.getColumn(model.colId);
    if (!col) return true;
    const v = this.getCellValue(node, col);
    switch (model.filterType) {
      case 'number':
        return numberConditionPasses({ type: model.type, filter: model.filter }, v, {});
      case 'date':
      case 'dateString':
        return dateConditionPasses({ type: model.type, dateFrom: model.filter }, v, {});
      case 'boolean':
        if (model.type === 'true') return v === true;
        if (model.type === 'false') return v === false;
        if (model.type === 'blank') return v == null;
        return v != null;
      default:
        return textConditionPasses({ type: model.type, filter: model.filter }, v, {});
    }
  },

  // ── 식 → 모델 ─────────────────────────────────────────────
  parseAdvancedFilter(text) {
    const src = String(text || '').trim();
    if (!src) return { model: null };
    let i = 0;
    const cols = this.advancedFilterColumns();
    const err = msg => {
      throw new Error(`${msg} (위치 ${i + 1})`);
    };
    const ws = () => {
      while (i < src.length && /\s/.test(src[i])) i++;
    };
    const peekWord = w => src.slice(i, i + w.length).toUpperCase() === w && !/[\w가-힣]/.test(src[i + w.length] || '');
    const parseValue = () => {
      ws();
      if (src[i] === '"' || src[i] === "'") {
        const q = src[i++];
        let s = '';
        while (i < src.length && src[i] !== q) {
          if (src[i] === '\\' && i + 1 < src.length) i++;
          s += src[i++];
        }
        if (src[i] !== q) err('따옴표가 닫히지 않았습니다');
        i++;
        return s;
      }
      const m = /^[^\s()]+/.exec(src.slice(i));
      if (!m) err('값이 필요합니다');
      i += m[0].length;
      return m[0];
    };
    const parseCondition = () => {
      ws();
      if (src[i] !== '[') err('[컬럼명] 이 필요합니다');
      const end = src.indexOf(']', i);
      if (end < 0) err('] 가 필요합니다');
      const name = src.slice(i + 1, end).trim();
      i = end + 1;
      const col = cols.find(c => this.getDisplayName(c) === name) || cols.find(c => c.colId === name);
      if (!col) err(`알 수 없는 컬럼: ${name}`);
      const ft = this.advancedFilterTypeOf(col);
      ws();
      const ops = [...ADVANCED_OPS[ft]].sort((a, b) => b[0].length - a[0].length);
      const op = ops.find(([label]) => src.slice(i, i + label.length).toLowerCase() === label);
      if (!op) err(`연산자가 올바르지 않습니다 (${ADVANCED_OPS[ft].map(o => o[0]).join(', ')})`);
      i += op[0].length;
      const cond = { filterType: ft, colId: col.colId, type: op[1] };
      if (!NO_VALUE.has(op[1])) {
        const raw = parseValue();
        if (ft === 'number') {
          const n = Number(raw);
          if (Number.isNaN(n)) err(`숫자가 아닙니다: ${raw}`);
          cond.filter = n;
        } else cond.filter = raw;
      }
      return cond;
    };
    const parsePrimary = () => {
      ws();
      if (src[i] === '(') {
        i++;
        const e = parseOr();
        ws();
        if (src[i] !== ')') err(') 가 필요합니다');
        i++;
        return e;
      }
      return parseCondition();
    };
    const parseJoin = (type, next) => {
      const list = [next()];
      for (;;) {
        ws();
        if (peekWord(type)) {
          i += type.length;
          list.push(next());
        } else break;
      }
      return list.length === 1 ? list[0] : { filterType: 'join', type, conditions: list };
    };
    const parseAnd = () => parseJoin('AND', parsePrimary);
    const parseOr = () => parseJoin('OR', parseAnd);
    try {
      const model = parseOr();
      ws();
      if (i < src.length) err('식이 끝나야 합니다');
      return { model: model.filterType === 'join' ? model : { filterType: 'join', type: 'AND', conditions: [model] } };
    } catch (e) {
      return { error: e.message };
    }
  },

  // ── 모델 → 식 ─────────────────────────────────────────────
  advancedModelToText(model, nested = false) {
    if (!model) return '';
    if (model.filterType === 'join') {
      const parts = (model.conditions || []).map(c => this.advancedModelToText(c, true)).filter(Boolean);
      const s = parts.join(` ${model.type || 'AND'} `);
      return nested && parts.length > 1 ? `(${s})` : s;
    }
    const col = this.getColumn(model.colId);
    const name = col ? this.getDisplayName(col) : model.colId;
    const op = (ADVANCED_OPS[model.filterType] || TEXT_OPS).find(o => o[1] === model.type)?.[0] || model.type;
    if (NO_VALUE.has(model.type)) return `[${name}] ${op}`;
    const v = model.filterType === 'number' ? String(model.filter) : `"${String(model.filter ?? '').replace(/"/g, '\\"')}"`;
    return `[${name}] ${op} ${v}`;
  },

  applyAdvancedFilterText(text) {
    const r = this.parseAdvancedFilter(text);
    if (r.error) return r;
    this.advancedFilterModel = r.model;
    this.advancedFilterText = text;
    this.onFilterChanged('advancedFilter');
    return r;
  },
};
