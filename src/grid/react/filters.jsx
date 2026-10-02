// 필터 UI (Set / Text / Number / Date). 모델은 core.setColumnFilterModel 로 반영.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { localeText } from '../core/locale.js';
import {
  DATE_FILTER_TYPES,
  NUMBER_FILTER_TYPES,
  TEXT_FILTER_TYPES,
  isModelActive,
  resolveFilterKind,
} from '../core/filterService.js';
import { cx } from '../core/utils.js';
import { Checkbox } from './common.jsx';

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
      <div key={i} className="ag-virtual-list-item" style={{ position: 'absolute', top: i * itemHeight, height: itemHeight, left: 0, right: 0 }}>
        {renderItem(i)}
      </div>,
    );
  }
  return (
    <div
      ref={ref}
      className={cx('ag-virtual-list-viewport', className)}
      style={{ height, overflowY: 'auto', position: 'relative' }}
      onScroll={e => setTop(e.currentTarget.scrollTop)}
    >
      <div className="ag-virtual-list-container" style={{ height: count * itemHeight, position: 'relative' }}>
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
    <div className="ag-filter-apply-panel">
      {buttons.map(b => (
        <button
          key={b}
          type="button"
          className="ag-button ag-standard-button ag-filter-apply-panel-button"
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
    <div className="ag-filter ag-set-filter" role="presentation">
      <div className="ag-filter-wrapper">
        {!fp.suppressMiniFilter && (
          <div className="ag-mini-filter ag-text-field ag-input-field">
            <div className="ag-wrapper ag-input-wrapper ag-text-field-input-wrapper">
              <input
                ref={inputRef}
                className="ag-input-field-input ag-text-field-input"
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
          <div className="ag-set-filter-item ag-set-filter-select-all" onClick={toggleAll} role="option">
            <Checkbox checked={allState} onToggle={toggleAll} />
            <span className="ag-set-filter-item-value">
              {localeText(core, search ? 'selectAllSearchResults' : 'selectAll')}
            </span>
          </div>
        )}
        {shown.length ? (
          <VirtualList
            className="ag-set-filter-list"
            count={shown.length}
            itemHeight={ITEM_H}
            maxHeight={ITEM_H * 8}
            renderItem={k => {
              const i = shown[k];
              const key = entries[i].key;
              return (
                <div className="ag-set-filter-item" onClick={() => toggleKey(key)} role="option" title={labels[i]}>
                  <Checkbox checked={isSel(key)} onToggle={() => toggleKey(key)} />
                  <span className="ag-set-filter-item-value">{labels[i]}</span>
                </div>
              );
            }}
          />
        ) : (
          <div className="ag-filter-no-matches">{localeText(core, 'noMatches')}</div>
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
    <div className={cx('ag-filter', `ag-${kind}-filter`)} role="presentation">
      <div className="ag-filter-wrapper">
        <div className="ag-filter-body-wrapper ag-simple-filter-body-wrapper">
          {shownConds.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <div className="ag-filter-condition" role="radiogroup">
                  {['AND', 'OR'].map(op => (
                    <label key={op} className="ag-filter-condition-operator">
                      <input
                        type="radio"
                        className="ag-input-field-input ag-radio-button-input"
                        checked={state.operator === op}
                        onChange={() => update({ ...state, operator: op })}
                      />
                      <span>{localeText(core, op === 'AND' ? 'andCondition' : 'orCondition')}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="ag-filter-select ag-picker-field">
                <select
                  className="ag-picker-field-wrapper ag-filter-select-input"
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
                <div className="ag-filter-body" role="presentation">
                  <div className="ag-filter-from ag-filter-filter ag-input-field">
                    <input
                      ref={i === 0 ? firstInput : undefined}
                      className="ag-input-field-input ag-text-field-input"
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
                    <div className="ag-filter-to ag-filter-filter ag-input-field">
                      <input
                        className="ag-input-field-input ag-text-field-input"
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
  const kind = resolveFilterKind(column.colDef);
  if (!kind) return null;
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
    <div className="ag-filter-toolpanel">
      <div className="ag-filter-toolpanel-search">
        <input
          className="ag-input-field-input ag-text-field-input"
          placeholder={localeText(core, 'searchOoo')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.stopPropagation()}
        />
      </div>
      <div className="ag-filter-list-panel">
        {shown.map(c => {
          const isOpen = open.has(c.colId);
          return (
            <div key={c.colId} className="ag-filter-toolpanel-instance">
              <div
                className="ag-filter-toolpanel-header ag-filter-toolpanel-instance-header"
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
                <span className={cx('ag-icon', isOpen ? 'ag-icon-tree-open' : 'ag-icon-tree-closed')} />
                <span className="ag-header-cell-text">{core.getDisplayName(c)}</span>
                {c.filterActive && <span className="ag-icon ag-icon-filter ag-filter-toolpanel-instance-header-icon" />}
              </div>
              {isOpen && (
                <div className="ag-filter-toolpanel-instance-body ag-filter">
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
