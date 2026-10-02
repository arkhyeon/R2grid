// 셀 에디터. AG-Grid 내장 에디터 이름(agTextCellEditor 등) + 커스텀 React 에디터 지원.
// 커스텀 에디터 props: value, onValueChange, eventKey, column, colDef, node, data, rowIndex, api, context, stopEditing ...
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cx, isPrintableKey } from '../core/utils.js';
import { stableElement } from './renderComponent.js';
import { Checkbox } from './common.jsx';
import { usePopupPosition, PopupLayer } from './popup.jsx';

// useGridCellEditor (ag-grid-react 호환) — reactive 커스텀 에디터가 콜백 등록
const CellEditorContext = createContext(null);
export function useGridCellEditor(callbacks) {
  const ctx = useContext(CellEditorContext);
  useEffect(() => {
    if (ctx) ctx.hooks = callbacks || {};
  });
}

function startValueFrom(eventKey, value) {
  if (eventKey === 'Backspace' || eventKey === 'Delete') return '';
  if (eventKey && eventKey.length === 1) return eventKey;
  return value == null ? '' : String(value);
}

function focusAndPlace(input, eventKey) {
  if (!input) return;
  input.focus({ preventScroll: true });
  if (eventKey && eventKey.length === 1) {
    const len = input.value.length;
    input.setSelectionRange?.(len, len);
  } else {
    input.select?.();
  }
}

function TextEditor({ core, ed, params }) {
  const ref = useRef(null);
  const [text, setText] = useState(() => {
    if (params.useFormatter && !ed.eventKey) {
      const f = core.formatValue(ed.node, ed.column, ed.value);
      return f != null ? String(f) : startValueFrom(null, ed.value);
    }
    return startValueFrom(ed.eventKey, ed.value);
  });
  useLayoutEffect(() => {
    ed.setValue(text);
    if (core.editing?.primary === ed) focusAndPlace(ref.current, ed.eventKey);
  }, []);
  return (
    <div className="ag-cell-edit-wrapper">
      <div className="ag-cell-editor ag-text-field ag-input-field" role="presentation">
        <div className="ag-wrapper ag-input-wrapper ag-text-field-input-wrapper" role="presentation">
          <input
            ref={ref}
            className="ag-input-field-input ag-text-field-input"
            type="text"
            value={text}
            maxLength={params.maxLength}
            onChange={e => {
              setText(e.target.value);
              ed.setValue(e.target.value);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function NumberEditor({ core, ed, params }) {
  const ref = useRef(null);
  const toNum = s => {
    if (s === '' || s == null || s === '-') return null;
    let n = Number(s);
    if (Number.isNaN(n)) return null;
    if (params.precision != null) n = Number(n.toFixed(params.precision));
    return n;
  };
  const [text, setText] = useState(() => {
    const k = ed.eventKey;
    if (k && k.length === 1) return /[\d.-]/.test(k) ? k : '';
    return startValueFrom(k, ed.value);
  });
  useLayoutEffect(() => {
    ed.setValue(toNum(text));
    if (core.editing?.primary === ed) focusAndPlace(ref.current, ed.eventKey);
  }, []);
  return (
    <div className="ag-cell-edit-wrapper">
      <div className="ag-cell-editor ag-number-field ag-input-field" role="presentation">
        <div className="ag-wrapper ag-input-wrapper ag-number-field-input-wrapper" role="presentation">
          <input
            ref={ref}
            className={cx('ag-input-field-input ag-number-field-input', !params.showStepperButtons && 'ag-number-field-input-stepper')}
            type="number"
            step={params.step ?? 'any'}
            min={params.min}
            max={params.max}
            value={text}
            onChange={e => {
              setText(e.target.value);
              ed.setValue(toNum(e.target.value));
            }}
          />
        </div>
      </div>
    </div>
  );
}

function DateEditor({ core, ed, params, asString }) {
  const ref = useRef(null);
  const toInput = v => {
    if (v == null || v === '') return '';
    if (v instanceof Date) {
      const p = n => (n < 10 ? `0${n}` : n);
      return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    return String(v).slice(0, 10);
  };
  const [text, setText] = useState(() => toInput(ed.value));
  const toValue = s => {
    if (!s) return null;
    if (asString) return s;
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  useLayoutEffect(() => {
    ed.setValue(toValue(text));
    if (core.editing?.primary === ed) ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="ag-cell-edit-wrapper">
      <div className="ag-cell-editor ag-date-field ag-input-field">
        <div className="ag-wrapper ag-input-wrapper">
          <input
            ref={ref}
            className="ag-input-field-input ag-date-field-input"
            type="date"
            min={params.min}
            max={params.max}
            value={text}
            onChange={e => {
              setText(e.target.value);
              ed.setValue(toValue(e.target.value));
            }}
          />
        </div>
      </div>
    </div>
  );
}

function CheckboxEditor({ core, ed }) {
  const [checked, setChecked] = useState(() => !!ed.value);
  const ref = useRef(null);
  useLayoutEffect(() => {
    ed.setValue(checked);
    if (core.editing?.primary === ed) ref.current?.focus({ preventScroll: true });
  }, []);
  const toggle = () => {
    setChecked(c => {
      ed.setValue(!c);
      return !c;
    });
  };
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="ag-cell-wrapper ag-checkbox-edit"
      onKeyDown={e => {
        if (e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggle();
        }
      }}
    >
      <Checkbox checked={checked} onToggle={toggle} />
    </div>
  );
}

function LargeTextEditor({ core, ed, params }) {
  const ref = useRef(null);
  const [text, setText] = useState(() => startValueFrom(ed.eventKey, ed.value));
  useLayoutEffect(() => {
    ed.editor.handlesEnter = true;
    ed.setValue(text);
    if (core.editing?.primary === ed) focusAndPlace(ref.current, ed.eventKey);
  }, []);
  return (
    <div className="ag-large-text" tabIndex={-1}>
      <div className="ag-large-text-input ag-text-area ag-input-field">
        <div className="ag-wrapper ag-input-wrapper ag-text-area-input-wrapper">
          <textarea
            ref={ref}
            className="ag-input-field-input ag-text-area-input"
            maxLength={params.maxLength ?? 200}
            rows={params.rows ?? 10}
            cols={params.cols ?? 60}
            value={text}
            onChange={e => {
              setText(e.target.value);
              ed.setValue(e.target.value);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.shiftKey || e.ctrlKey)) {
                e.preventDefault();
                e.stopPropagation();
                core.stopEditing(false);
              } else if (e.key === 'Enter') {
                e.stopPropagation();
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

// agRichSelectCellEditor / agSelectCellEditor
function RichSelectEditor({ core, ed, params, plain }) {
  const { node, column } = ed;
  const [values, setValues] = useState(() => (Array.isArray(params.values) ? params.values : []));
  useEffect(() => {
    const v = params.values;
    if (typeof v === 'function') {
      const r = v({ ...core.makeValueParams(node, column) });
      if (r && typeof r.then === 'function') r.then(list => setValues(list || []));
      else setValues(r || []);
    } else if (Array.isArray(v)) setValues(v);
  }, []);
  const format = v => {
    if (typeof params.formatValue === 'function') return params.formatValue(v);
    const f = core.formatValue(node, column, v);
    return f != null ? String(f) : v == null ? '' : String(v);
  };
  const [search, setSearch] = useState(() => (ed.eventKey && ed.eventKey.length === 1 ? ed.eventKey : ''));
  const filterList = !!params.filterList && !!params.allowTyping;
  const shown = useMemo(() => {
    if (!filterList || !search) return values;
    const s = search.toLowerCase();
    return values.filter(v => format(v).toLowerCase().includes(s));
  }, [values, search, filterList]);
  const findMatch = s => {
    if (!s) return -1;
    const low = s.toLowerCase();
    const type = params.searchType ?? 'fuzzy';
    let idx = shown.findIndex(v => format(v).toLowerCase().startsWith(low));
    if (idx < 0 && type !== 'match') idx = shown.findIndex(v => format(v).toLowerCase().includes(low));
    return idx;
  };
  const [hi, setHi] = useState(() => {
    if (search) return -1;
    return values.findIndex(v => v === ed.value);
  });
  useEffect(() => {
    if (search) setHi(findMatch(search));
    else setHi(shown.findIndex(v => v === ed.value));
  }, [shown]);
  useEffect(() => {
    if (search) setHi(findMatch(search));
  }, [search]);

  const listRef = useRef(null);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const rowH = params.cellHeight ?? 30;
  useLayoutEffect(() => {
    if (core.editing?.primary === ed) (inputRef.current || boxRef.current)?.focus({ preventScroll: true });
    ed.setValue(ed.value);
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (!el || hi < 0) return;
    const top = hi * rowH;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowH > el.scrollTop + el.clientHeight) el.scrollTop = top + rowH - el.clientHeight;
  }, [hi]);

  const choose = v => {
    ed.setValue(v);
    core.stopEditing(false);
  };
  const typeBuffer = useRef({ text: '', t: 0 });
  const onKeyDown = e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setHi(h => Math.min(shown.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setHi(h => Math.max(0, h - 1));
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      e.stopPropagation();
      const step = Math.max(1, Math.floor((listRef.current?.clientHeight || 200) / rowH));
      setHi(h => Math.max(0, Math.min(shown.length - 1, h + (e.key === 'PageDown' ? step : -step))));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (hi >= 0 && hi < shown.length) ed.setValue(shown[hi]);
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        core.stopEditing(false);
      }
    } else if (!params.allowTyping && isPrintableKey(e)) {
      e.stopPropagation();
      const now = Date.now();
      const buf = now - typeBuffer.current.t < 1000 ? typeBuffer.current.text + e.key : e.key;
      typeBuffer.current = { text: buf, t: now };
      const idx = findMatch(buf);
      if (idx >= 0) setHi(idx);
    }
  };
  const ItemRenderer = params.cellRenderer;
  const maxH = params.valueListMaxHeight ?? rowH * 8;
  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      className={cx('ag-rich-select ag-popup-editor', plain && 'ag-select-editor')}
      onKeyDown={onKeyDown}
      role="listbox"
    >
      <div className="ag-rich-select-value ag-picker-field-wrapper">
        {params.allowTyping ? (
          <input
            ref={inputRef}
            className="ag-input-field-input ag-text-field-input"
            value={search}
            placeholder={format(ed.value)}
            onChange={e => setSearch(e.target.value)}
          />
        ) : (
          <span className="ag-picker-field-display">{format(hi >= 0 ? shown[hi] : ed.value)}</span>
        )}
        <span className="ag-picker-field-icon">
          <span className="ag-icon ag-icon-small-down" />
        </span>
      </div>
      <div ref={listRef} className="ag-rich-select-list" style={{ maxHeight: maxH }}>
        <div className="ag-rich-select-virtual-list-container" style={{ height: shown.length * rowH }}>
          {shown.map((v, i) => {
            const label = format(v);
            const selected = v === ed.value;
            return (
              <div
                key={i}
                className={cx(
                  'ag-rich-select-row',
                  i === hi && 'ag-rich-select-row-highlighted',
                  selected && 'ag-rich-select-row-selected',
                )}
                style={{ height: rowH, top: i * rowH }}
                role="option"
                aria-selected={selected}
                onMouseMove={() => hi !== i && setHi(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => choose(v)}
              >
                {ItemRenderer
                  ? stableElement(core, `richItem:${column.colId}`, ItemRenderer, {
                      value: v,
                      valueFormatted: label,
                      api: core.api,
                      context: core.gos.context,
                    })
                  : label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const BUILTIN_EDITORS = {
  agTextCellEditor: TextEditor,
  agNumberCellEditor: NumberEditor,
  agLargeTextCellEditor: LargeTextEditor,
  agSelectCellEditor: props => <RichSelectEditor {...props} plain />,
  agRichSelectCellEditor: RichSelectEditor,
  agCheckboxCellEditor: CheckboxEditor,
  agDateCellEditor: DateEditor,
  agDateStringCellEditor: props => <DateEditor {...props} asString />,
};

// 사용자 에디터 컴포넌트 호스트 — 값은 grid 가 보유(reactive), ref.getValue 도 지원(레거시)
function CustomEditor({ core, ed, params, getCellEl }) {
  const { node, column } = ed;
  const ctxValue = useMemo(() => ({ hooks: {} }), []);
  useEffect(() => {
    ed.hooks = ctxValue.hooks;
  });
  useLayoutEffect(() => {
    const inst = ed.ref.current;
    inst?.afterGuiAttached?.();
    ctxValue.hooks?.afterGuiAttached?.();
    if (core.editing?.primary === ed) {
      // 에디터가 스스로 포커스를 잡지 않으면 첫 입력요소에 포커스
      const el = getCellEl?.();
      const host = ed.editor.popup ? document.querySelector('.ag-popup-editor-host') : el;
      if (host && !host.contains(document.activeElement)) {
        const f = host.querySelector('input,textarea,select,[tabindex]');
        f?.focus({ preventScroll: true });
      }
    }
  }, []);
  const eventKey = ed.eventKey;
  const props = {
    ...params,
    value: ed.value,
    onValueChange: v => core.setEditorValue(v, ed),
    eventKey,
    charPress: eventKey && eventKey.length === 1 ? eventKey : null,
    key: undefined,
    column,
    colDef: column.colDef,
    node,
    data: node.data,
    rowIndex: node.rowIndex,
    api: core.api,
    context: core.gos.context,
    cellStartedEdit: true,
    stopEditing: () => core.stopEditing(false),
    parseValue: v => v,
    formatValue: v => core.formatValue(node, column, v) ?? v,
    eGridCell: getCellEl?.(),
    validate: () => {},
    onKeyDown: () => {},
    ref: ed.ref,
  };
  delete props.key;
  return (
    <CellEditorContext.Provider value={ctxValue}>
      {stableElement(core, `editor:${column.colId}`, ed.editor.comp, props)}
    </CellEditorContext.Provider>
  );
}

export function EditorHost({ core, ed, getCellEl }) {
  const comp = ed.editor.comp;
  const params = ed.editor.params || {};
  const Builtin = typeof comp === 'string' ? BUILTIN_EDITORS[comp] || TextEditor : null;
  const content = Builtin ? (
    <Builtin core={core} ed={ed} params={params} />
  ) : (
    <CustomEditor core={core} ed={ed} params={params} getCellEl={getCellEl} />
  );
  if (!ed.editor.popup) return content;
  return <PopupEditor core={core} ed={ed} getCellEl={getCellEl}>{content}</PopupEditor>;
}

function PopupEditor({ core, ed, getCellEl, children }) {
  const ref = useRef(null);
  const pos = usePopupPosition(ref, () => {
    const el = getCellEl?.();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const under = ed.editor.popupPosition === 'under';
    return { x: r.left, y: under ? r.bottom : r.top, minWidth: r.width, alignTo: r };
  }, [ed]);
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        className="ag-popup-child ag-popup-editor ag-popup-editor-host"
        style={{ position: 'fixed', left: pos.x, top: pos.y, minWidth: pos.minWidth, visibility: pos.ready ? 'visible' : 'hidden' }}
        onPointerDown={e => e.stopPropagation()}
      >
        {children}
      </div>
    </PopupLayer>,
    document.body,
  );
}
