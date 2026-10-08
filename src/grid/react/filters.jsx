// 필터 UI (Set / Text / Number / Date / 사용자 컴포넌트). 모델은 core.setColumnFilterModel 로 반영.
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { localeText } from '../core/locale.js';
import {
  DATE_FILTER_TYPES,
  NUMBER_FILTER_TYPES,
  TEXT_FILTER_TYPES,
  isModelActive,
  resolveCustomFilterImpl,
  resolveFilterKind,
} from '../core/filterService.js';
import { cx } from '../core/utils.js';
import { Checkbox, Icon } from './common.jsx';
import { stableElement } from './renderComponent.js';

// ── 사용자 필터 컴포넌트 ─────────────────────────────────────
const FilterCompContext = createContext(null);

// useGridFilter (ag-grid-react 호환): reactive 커스텀 필터가 doesFilterPass / afterGuiAttached 등 등록
export function useGridFilter(callbacks) {
  const ctx = useContext(FilterCompContext);
  useLayoutEffect(() => {
    ctx?.register(callbacks);
  });
}

function CustomFilterInstance({ core, column }) {
  const colId = column.colId;
  const impl = resolveCustomFilterImpl(column.colDef, core.gos.components);
  const register = useCallback(cbs => core.registerCustomFilterCallbacks(colId, cbs), [core, colId]);
  const setInst = useCallback(inst => core.attachCustomFilterInstance(colId, inst), [core, colId]);
  const ctx = useMemo(() => ({ register }), [register]);
  if (!impl) return null;
  const base = {
    ...(column.colDef.filterParams || {}),
    colDef: column.colDef,
    column,
    api: core.api,
    context: core.gos.context,
    getValue: (node, col) => core.getFilterValue(node, col ?? column),
    doesRowPassOtherFilter: node => core.doesRowPassOtherFilters(node, column),
  };
  const props = core.isReactiveFilters()
    ? {
        ...base,
        model: core.filterModels.get(colId) ?? null,
        onModelChange: m => core.onCustomFilterModelChange(column, m),
        onUiChange: () => {},
      }
    : {
        ...base,
        filterChangedCallback: () => core.onImperativeFilterChanged(column),
        filterModifiedCallback: () => {},
        valueGetter: node => core.getFilterValue(node, column),
        ref: setInst,
      };
  return <FilterCompContext.Provider value={ctx}>{stableElement(core, `filter:${colId}`, impl, props)}</FilterCompContext.Provider>;
}

// 생성된 커스텀 필터 인스턴스들을 고정 DOM(entry.el) 에 portal 로 유지
export function CustomFilterHost({ core }) {
  if (!core.customFilters?.size) return null;
  return [...core.customFilters.values()].map(e => {
    const col = core.columnById.get(e.colId);
    return col ? createPortal(<CustomFilterInstance core={core} column={col} />, e.el, e.colId) : null;
  });
}

// 팝업/툴패널 안에 커스텀 필터 DOM 을 붙였다 떼는 자리
function CustomFilterSlot({ core, column, onClose }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const e = core.getCustomFilterEntry(column, true);
    const host = ref.current;
    host.appendChild(e.el);
    const t = setTimeout(() => {
      const params = { hidePopup: () => onClose?.() };
      if (e.inst?.afterGuiAttached) e.inst.afterGuiAttached(params);
      else e.callbacks?.afterGuiAttached?.(params);
    }, 0);
    return () => {
      clearTimeout(t);
      if (e.el.parentNode === host) host.removeChild(e.el);
      if (e.inst?.afterGuiDetached) e.inst.afterGuiDetached();
      else e.callbacks?.afterGuiDetached?.();
    };
  }, [core, column]);
  return <div ref={ref} className="r2-filter-wrapper r2-filter-custom" />;
}

const ITEM_H = 28;

function VirtualList({ count, itemHeight, maxHeight, renderItem, className }) {
  const ref = useRef(null);
  const [top, setTop] = useState(0);
  const height = Math.min(maxHeight, count * itemHeight);
  const first = Math.max(0, Math.floor(top / itemHeight) - 5);
  const last = Math.min(count, Math.ceil((top + height) / itemHeight) + 5);
  const items = [];
  for (let i = first; i < last; i++) {
    items.push(
      <div key={i} className="r2-virtual-list-item" style={{ position: 'absolute', top: i * itemHeight, height: itemHeight, left: 0, right: 0 }}>
        {renderItem(i)}
      </div>,
    );
  }
  return (
    <div
      ref={ref}
      className={cx('r2-virtual-list-viewport', className)}
      style={{ height, overflowY: 'auto', position: 'relative' }}
      onScroll={e => setTop(e.currentTarget.scrollTop)}
    >
      <div className="r2-virtual-list-container" style={{ height: count * itemHeight, position: 'relative' }}>
        {items}
      </div>
    </div>
  );
}

function FilterButtons({ core, buttons, onApply, onClear, onReset, onCancel }) {
  if (!buttons?.length) return null;
  const label = { apply: 'applyFilter', clear: 'clearFilter', reset: 'resetFilter', cancel: 'cancelFilter' };
  const handler = { apply: onApply, clear: onClear, reset: onReset, cancel: onCancel };
  return (
    <div className="r2-filter-apply-panel">
      {buttons.map(b => (
        <button
          key={b}
          type="button"
          className="r2-button r2-standard-button r2-filter-apply-panel-button"
          onClick={handler[b]}
        >
          {localeText(core, label[b])}
        </button>
      ))}
    </div>
  );
}

// ── Set 필터 ───────────────────────────────────────────────
function SetFilterUI({ core, column, onClose }) {
  const fp = column.colDef.filterParams || {};
  const buttons = fp.buttons;
  const needApply = buttons?.includes('apply');
  const entries = useMemo(() => core.getSetFilterValues(column), [column]);
  const labels = useMemo(() => entries.map(e => core.formatSetFilterLabel(column, e)), [entries]);
  const allKeys = useMemo(() => entries.map(e => e.key), [entries]);
  const applied = core.getColumnFilterModel(column);
  const [selected, setSelected] = useState(() => (applied?.values ? new Set(applied.values) : null));
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    const idx = [];
    for (let i = 0; i < entries.length; i++) {
      if (!s || labels[i].toLowerCase().includes(s)) idx.push(i);
    }
    return idx;
  }, [search, entries, labels]);

  const isSel = key => selected === null || selected.has(key);
  const toModel = sel => {
    if (sel === null) return null;
    if (allKeys.every(k => sel.has(k))) return null;
    return { filterType: 'set', values: allKeys.filter(k => sel.has(k)) };
  };
  const commit = sel => {
    const model = toModel(sel);
    setSelected(model ? new Set(model.values) : null);
    core.dispatch('filterModified', { column, filterInstance: null });
    core.dispatch('filterUiChanged', { column });
    if (!needApply) core.setColumnFilterModel(column, model);
  };
  const toggleKey = key => {
    const base = new Set(selected === null ? allKeys : selected);
    if (base.has(key)) base.delete(key);
    else base.add(key);
    commit(base);
  };
  const shownSelected = shown.filter(i => isSel(entries[i].key)).length;
  const allState = !shown.length ? false : shownSelected === shown.length ? true : shownSelected === 0 ? false : null;
  const toggleAll = () => {
    const base = new Set(selected === null ? allKeys : selected);
    if (allState === true) shown.forEach(i => base.delete(entries[i].key));
    else shown.forEach(i => base.add(entries[i].key));
    commit(base);
  };

  return (
    <div className="r2-filter r2-set-filter" role="presentation">
      <div className="r2-filter-wrapper">
        {!fp.suppressMiniFilter && (
          <div className="r2-mini-filter r2-text-field r2-input-field">
            <div className="r2-wrapper r2-input-wrapper r2-text-field-input-wrapper">
              <input
                ref={inputRef}
                className="r2-input-field-input r2-text-field-input"
                placeholder={localeText(core, 'searchOoo')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Escape') onClose?.();
                  if (e.key === 'Enter' && needApply) core.setColumnFilterModel(column, toModel(selected));
                }}
              />
            </div>
          </div>
        )}
        {!fp.suppressSelectAll && shown.length > 0 && (
          <div className="r2-set-filter-item r2-set-filter-select-all" onClick={toggleAll} role="option">
            <Checkbox checked={allState} onToggle={toggleAll} />
            <span className="r2-set-filter-item-value">
              {localeText(core, search ? 'selectAllSearchResults' : 'selectAll')}
            </span>
          </div>
        )}
        {shown.length ? (
          <VirtualList
            className="r2-set-filter-list"
            count={shown.length}
            itemHeight={ITEM_H}
            maxHeight={ITEM_H * 8}
            renderItem={k => {
              const i = shown[k];
              const key = entries[i].key;
              return (
                <div className="r2-set-filter-item" onClick={() => toggleKey(key)} role="option" title={labels[i]}>
                  <Checkbox checked={isSel(key)} onToggle={() => toggleKey(key)} />
                  <span className="r2-set-filter-item-value">{labels[i]}</span>
                </div>
              );
            }}
          />
        ) : (
          <div className="r2-filter-no-matches">{localeText(core, 'noMatches')}</div>
        )}
      </div>
      <FilterButtons
        core={core}
        buttons={buttons}
        onApply={() => {
          core.setColumnFilterModel(column, toModel(selected));
          if (fp.closeOnApply) onClose?.();
        }}
        onClear={() => setSelected(null)}
        onReset={() => {
          setSelected(null);
          core.setColumnFilterModel(column, null);
        }}
        onCancel={() => {
          setSelected(applied?.values ? new Set(applied.values) : null);
          onClose?.();
        }}
      />
    </div>
  );
}

// ── 조건 필터 (text / number / date) ─────────────────────────
const NO_INPUT = new Set(['blank', 'notBlank', 'empty']);

function condComplete(c) {
  if (!c || !c.type) return false;
  if (NO_INPUT.has(c.type)) return true;
  if (c.type === 'inRange') return c.from !== '' && c.to !== '';
  return c.from !== '' && c.from != null;
}

function ConditionFilterUI({ core, column, kind, onClose }) {
  const fp = column.colDef.filterParams || {};
  const buttons = fp.buttons;
  const needApply = buttons?.includes('apply');
  const baseTypes = kind === 'number' ? NUMBER_FILTER_TYPES : kind === 'date' ? DATE_FILTER_TYPES : TEXT_FILTER_TYPES;
  const options = (fp.filterOptions || baseTypes).map(o =>
    typeof o === 'string' ? { key: o, label: localeText(core, o) } : { key: o.displayKey, label: o.displayName },
  );
  const defaultType = fp.defaultOption || options[0]?.key || (kind === 'text' ? 'contains' : 'equals');
  const maxConds = fp.maxNumConditions ?? 2;

  const fromModel = m => {
    const conv = c => ({
      type: c.type || defaultType,
      from: kind === 'date' ? (c.dateFrom || '').slice(0, 10) : c.filter ?? '',
      to: kind === 'date' ? (c.dateTo || '').slice(0, 10) : c.filterTo ?? '',
    });
    if (!m) return { operator: 'AND', conds: [{ type: defaultType, from: '', to: '' }] };
    if (Array.isArray(m.conditions)) return { operator: m.operator || 'AND', conds: m.conditions.map(conv) };
    return { operator: 'AND', conds: [conv(m)] };
  };
  const applied = core.getColumnFilterModel(column);
  const [state, setState] = useState(() => fromModel(applied));
  const firstInput = useRef(null);
  useEffect(() => {
    firstInput.current?.focus({ preventScroll: true });
  }, []);

  const toModel = st => {
    const conv = c => {
      const base = { filterType: kind, type: c.type };
      if (NO_INPUT.has(c.type)) return base;
      if (kind === 'number') {
        const f = c.from === '' ? null : Number(c.from);
        const out = { ...base, filter: f };
        if (c.type === 'inRange') out.filterTo = c.to === '' ? null : Number(c.to);
        return out;
      }
      if (kind === 'date') {
        const out = { ...base, dateFrom: c.from ? `${c.from} 00:00:00` : null, dateTo: null };
        if (c.type === 'inRange') out.dateTo = c.to ? `${c.to} 00:00:00` : null;
        return out;
      }
      return { ...base, filter: c.from };
    };
    const active = st.conds.filter(condComplete).map(conv);
    if (!active.length) return null;
    if (active.length === 1) return active[0];
    return { filterType: kind, operator: st.operator, conditions: active };
  };

  const debounceMs = fp.debounceMs ?? (kind === 'date' ? 0 : 500);
  const timer = useRef(null);
  const applyNow = st => {
    clearTimeout(timer.current);
    const m = toModel(st);
    core.setColumnFilterModel(column, m && isModelActive(m) ? m : null);
  };
  const update = next => {
    setState(next);
    core.dispatch('filterModified', { column, filterInstance: null });
    core.dispatch('filterUiChanged', { column });
    if (needApply) return;
    clearTimeout(timer.current);
    if (debounceMs) timer.current = setTimeout(() => applyNow(next), debounceMs);
    else applyNow(next);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const setCond = (i, patch) => {
    const conds = state.conds.map((c, k) => (k === i ? { ...c, ...patch } : c));
    // 앞 조건이 완성되면 다음 조건 칸 노출 (maxNumConditions 까지)
    if (conds.length < maxConds && condComplete(conds[conds.length - 1])) {
      conds.push({ type: defaultType, from: '', to: '' });
    }
    while (conds.length > 1 && !condComplete(conds[conds.length - 2]) && !condComplete(conds[conds.length - 1])) {
      conds.pop();
    }
    update({ ...state, conds });
  };

  let shownConds = state.conds;
  if (shownConds.length < maxConds && condComplete(shownConds[shownConds.length - 1])) {
    shownConds = [...shownConds, { type: defaultType, from: '', to: '' }];
  }
  const inputType = kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text';

  return (
    <div className={cx('r2-filter', `r2-${kind}-filter`)} role="presentation">
      <div className="r2-filter-wrapper">
        <div className="r2-filter-body-wrapper r2-simple-filter-body-wrapper">
          {shownConds.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className="r2-filter-condition" role="radiogroup">
                  {['AND', 'OR'].map(op => (
                    <label key={op} className="r2-filter-condition-operator">
                      <input
                        type="radio"
                        className="r2-input-field-input r2-radio-button-input"
                        checked={state.operator === op}
                        onChange={() => update({ ...state, operator: op })}
                      />
                      <span>{localeText(core, op === 'AND' ? 'andCondition' : 'orCondition')}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="r2-filter-select r2-picker-field">
                <select
                  className="r2-picker-field-wrapper r2-filter-select-input"
                  value={c.type}
                  onChange={e => setCond(i, { type: e.target.value })}
                  onKeyDown={e => e.stopPropagation()}
                >
                  {options.map(o => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {!NO_INPUT.has(c.type) && (
                <div className="r2-filter-body" role="presentation">
                  <div className="r2-filter-from r2-filter-filter r2-input-field">
                    <input
                      ref={i === 0 ? firstInput : undefined}
                      className="r2-input-field-input r2-text-field-input"
                      type={inputType}
                      placeholder={localeText(core, c.type === 'inRange' ? 'inRangeStart' : 'filterOoo')}
                      value={c.from}
                      onChange={e => setCond(i, { from: e.target.value })}
                      onKeyDown={e => {
                        e.stopPropagation();
                        if (e.key === 'Enter') applyNow(state);
                        if (e.key === 'Escape') onClose?.();
                      }}
                    />
                  </div>
                  {c.type === 'inRange' && (
                    <div className="r2-filter-to r2-filter-filter r2-input-field">
                      <input
                        className="r2-input-field-input r2-text-field-input"
                        type={inputType}
                        placeholder={localeText(core, 'inRangeEnd')}
                        value={c.to}
                        onChange={e => setCond(i, { to: e.target.value })}
                        onKeyDown={e => e.stopPropagation()}
                      />
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      <FilterButtons
        core={core}
        buttons={buttons}
        onApply={() => {
          applyNow(state);
          if (fp.closeOnApply) onClose?.();
        }}
        onClear={() => setState(fromModel(null))}
        onReset={() => {
          const s = fromModel(null);
          setState(s);
          core.setColumnFilterModel(column, null);
        }}
        onCancel={() => {
          setState(fromModel(applied));
          onClose?.();
        }}
      />
    </div>
  );
}

export function FilterUI({ core, column, onClose }) {
  const kind = resolveFilterKind(column.colDef, core.gos.components);
  if (!kind) return null;
  if (kind === 'custom') return <CustomFilterSlot core={core} column={column} onClose={onClose} />;
  if (kind === 'set') return <SetFilterUI core={core} column={column} onClose={onClose} />;
  return <ConditionFilterUI core={core} column={column} kind={kind} onClose={onClose} />;
}

// 필터 툴패널
export function FiltersToolPanel({ core }) {
  const [open, setOpen] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const cols = core.allColumns.filter(c => c.colDef.filter && !c.colDef.suppressFiltersToolPanel && !c.isAuto);
  const s = search.trim().toLowerCase();
  const shown = s ? cols.filter(c => core.getDisplayName(c).toLowerCase().includes(s)) : cols;
  return (
    <div className="r2-filter-toolpanel">
      <div className="r2-filter-toolpanel-search">
        <input
          className="r2-input-field-input r2-text-field-input"
          placeholder={localeText(core, 'searchOoo')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.stopPropagation()}
        />
      </div>
      <div className="r2-filter-list-panel">
        {shown.map(c => {
          const isOpen = open.has(c.colId);
          return (
            <div key={c.colId} className="r2-filter-toolpanel-instance">
              <div
                className="r2-filter-toolpanel-header r2-filter-toolpanel-instance-header"
                role="button"
                onClick={() =>
                  setOpen(prev => {
                    const n = new Set(prev);
                    if (n.has(c.colId)) n.delete(c.colId);
                    else n.add(c.colId);
                    return n;
                  })
                }
              >
                <span className={cx('r2-icon', isOpen ? 'r2-icon-tree-open' : 'r2-icon-tree-closed')} />
                <span className="r2-header-cell-text">{core.getDisplayName(c)}</span>
                {c.filterActive && <span className="r2-icon r2-icon-filter r2-filter-toolpanel-instance-header-icon" />}
              </div>
              {isOpen && (
                <div className="r2-filter-toolpanel-instance-body r2-filter">
                  <FilterUI core={core} column={c} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 플로팅 필터 (colDef.floatingFilter) ───────────────────────
const READONLY_TYPES = new Set(['inRange', 'blank', 'notBlank']);

function describeCondition(core, c) {
  if (c.type === 'blank' || c.type === 'notBlank') return localeText(core, c.type);
  if (c.type === 'inRange') {
    const from = c.dateFrom ? String(c.dateFrom).slice(0, 10) : c.filter;
    const to = c.dateTo ? String(c.dateTo).slice(0, 10) : c.filterTo;
    return `${from ?? ''}-${to ?? ''}`;
  }
  if (c.dateFrom) return String(c.dateFrom).slice(0, 10);
  return c.filter == null ? '' : String(c.filter);
}

function describeModel(core, model) {
  if (!model) return '';
  if (Array.isArray(model.conditions)) {
    const op = localeText(core, model.operator === 'OR' ? 'orCondition' : 'andCondition', model.operator || 'AND');
    return model.conditions.map(c => describeCondition(core, c)).join(` ${op} `);
  }
  return describeCondition(core, model);
}

function ConditionFloatingInput({ core, column, kind }) {
  const fp = column.colDef.filterParams || {};
  const model = core.filterModels.get(column.colId) ?? null;
  const editable = !model || (!Array.isArray(model.conditions) && !READONLY_TYPES.has(model.type));
  const modelText = model && !Array.isArray(model.conditions) ? (kind === 'date' ? String(model.dateFrom || '').slice(0, 10) : model.filter ?? '') : '';
  const [text, setText] = useState(String(modelText));
  const timer = useRef(null);
  const lastApplied = useRef(String(modelText));
  // 바깥(팝업/api)에서 모델이 바뀌면 입력값 동기화
  useEffect(() => {
    if (String(modelText) !== lastApplied.current) {
      lastApplied.current = String(modelText);
      setText(String(modelText));
    }
  }, [modelText]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const defaultType = fp.defaultOption || (kind === 'text' ? 'contains' : 'equals');
  const apply = v => {
    lastApplied.current = v;
    if (v === '' || v == null) {
      core.setColumnFilterModel(column, null);
      return;
    }
    const type = model && !READONLY_TYPES.has(model.type) && !Array.isArray(model.conditions) ? model.type : defaultType;
    if (kind === 'number') {
      const n = Number(v);
      if (Number.isNaN(n)) return;
      core.setColumnFilterModel(column, { filterType: 'number', type, filter: n });
    } else if (kind === 'date') {
      core.setColumnFilterModel(column, { filterType: 'date', type, dateFrom: `${v} 00:00:00`, dateTo: null });
    } else {
      core.setColumnFilterModel(column, { filterType: 'text', type, filter: v });
    }
  };
  const debounceMs = fp.debounceMs ?? (kind === 'date' ? 0 : 500);
  const onChange = e => {
    const v = e.target.value;
    setText(v);
    core.dispatch('floatingFilterUiChanged', { column });
    clearTimeout(timer.current);
    if (debounceMs) timer.current = setTimeout(() => apply(v), debounceMs);
    else apply(v);
  };
  if (!editable) {
    return (
      <div className="r2-floating-filter-input">
        <div className="r2-input-field r2-text-field r2-disabled">
          <input className="r2-input-field-input r2-text-field-input" disabled value={describeModel(core, model)} readOnly />
        </div>
      </div>
    );
  }
  return (
    <div className="r2-floating-filter-input">
      <div className={cx('r2-input-field', kind === 'number' ? 'r2-number-field' : kind === 'date' ? 'r2-date-field' : 'r2-text-field')}>
        <input
          className={cx('r2-input-field-input', kind === 'number' ? 'r2-number-field-input' : kind === 'date' ? 'r2-date-field-input' : 'r2-text-field-input')}
          type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'}
          value={text}
          onChange={onChange}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              clearTimeout(timer.current);
              apply(text);
            }
          }}
          aria-label={`${core.getDisplayName(column)} Filter Input`}
        />
      </div>
    </div>
  );
}

function ReadOnlyFloating({ text }) {
  return (
    <div className="r2-floating-filter-input">
      <div className="r2-input-field r2-text-field r2-disabled">
        <input className="r2-input-field-input r2-text-field-input" disabled value={text} readOnly />
      </div>
    </div>
  );
}

export function FloatingFilterCell({ core, col, height }) {
  const cd = col.colDef;
  const kind = col.isAuto ? null : resolveFilterKind(cd, core.gos.components);
  const enabled = !!kind && !!cd.floatingFilter;
  let body = null;
  if (enabled) {
    const model = core.filterModels.get(col.colId) ?? null;
    const ffc = cd.floatingFilterComponent;
    const impl = typeof ffc === 'string' ? core.gos.components?.[ffc] : ffc;
    if (impl) {
      body = stableElement(core, `floatingFilter:${col.colId}`, impl, {
        ...(cd.floatingFilterComponentParams || {}),
        model,
        onModelChange: m => core.setColumnFilterModel(col, m),
        column: col,
        filterParams: cd.filterParams,
        currentParentModel: () => model,
        parentFilterInstance: cb => core.api.getColumnFilterInstance(col).then(cb),
        showParentFilter: () => core.openPopup({ type: 'filter', column: col, anchorColId: col.colId }),
        api: core.api,
        context: core.gos.context,
      });
    } else if (kind === 'set') {
      const vals = model?.values;
      const text = Array.isArray(vals) ? `(${vals.length}) ${vals.map(v => (v == null ? localeText(core, 'blanks', '(빈 값)') : v)).join(',')}` : '';
      body = <ReadOnlyFloating text={text} />;
    } else if (kind === 'custom') {
      const e = core.customFilters?.get(col.colId);
      const fn = e?.callbacks?.getModelAsString || e?.inst?.getModelAsString;
      body = <ReadOnlyFloating text={model == null ? '' : typeof fn === 'function' ? fn(model) : ''} />;
    } else {
      body = <ConditionFloatingInput core={core} column={col} kind={kind} />;
    }
  }
  const showButton = enabled && !cd.suppressFloatingFilterButton && !cd.floatingFilterComponentParams?.suppressFilterButton;
  return (
    <div
      className={`r2-header-cell r2-floating-filter r2-focus-managed${core.headerFocus?.colId === col.colId && core.headerFocus.rowIndex === (core.headerGroupDepth || 0) + 1 ? ' r2-header-cell-focus' : ''}`}
      role="gridcell"
      col-id={col.colId}
      style={{ ...core.colPos(col.left), width: col.actualWidth, height }}
    >
      {enabled && <div className="r2-floating-filter-body" role="presentation">{body}</div>}
      {showButton && (
        <div className="r2-floating-filter-button" role="presentation">
          <button
            type="button"
            className={cx('r2-button r2-floating-filter-button-button', col.filterActive && 'r2-filter-active')}
            aria-label="Open Filter Menu"
            onClick={e => {
              e.stopPropagation();
              core.openPopup({ type: 'filter', column: col, anchorColId: col.colId });
            }}
          >
            <Icon name={col.filterActive ? 'filter-active' : 'filter'} />
          </button>
        </div>
      )}
    </div>
  );
}
