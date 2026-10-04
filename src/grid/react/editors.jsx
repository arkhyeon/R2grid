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
import { cx, isPrintableKey } from '../core/utils.js';
import { stableElement } from './renderComponent.js';
import { Checkbox, Icon } from './common.jsx';
import { bodyClipOf } from './popup.jsx';

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
    <div className="r2-cell-edit-wrapper">
      <div className="r2-cell-editor r2-text-field r2-input-field" role="presentation">
        <div className="r2-wrapper r2-input-wrapper r2-text-field-input-wrapper" role="presentation">
          <input
            ref={ref}
            className="r2-input-field-input r2-text-field-input"
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
    <div className="r2-cell-edit-wrapper">
      <div className="r2-cell-editor r2-number-field r2-input-field" role="presentation">
        <div className="r2-wrapper r2-input-wrapper r2-number-field-input-wrapper" role="presentation">
          <input
            ref={ref}
            className={cx('r2-input-field-input r2-number-field-input', !params.showStepperButtons && 'r2-number-field-input-stepper')}
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
    <div className="r2-cell-edit-wrapper">
      <div className="r2-cell-editor r2-date-field r2-input-field">
        <div className="r2-wrapper r2-input-wrapper">
          <input
            ref={ref}
            className="r2-input-field-input r2-date-field-input"
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
      className="r2-cell-wrapper r2-checkbox-edit"
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
    <div className="r2-large-text" tabIndex={-1}>
      <div className="r2-large-text-input r2-text-area r2-input-field">
        <div className="r2-wrapper r2-input-wrapper r2-text-area-input-wrapper">
          <textarea
            ref={ref}
            className="r2-input-field-input r2-text-area-input"
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
function RichSelectEditor({ core, ed, params, plain, getCellEl }) {
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

  // 목록 열림: rich 는 항상, select 는 Enter 로 시작했을 때만 (AG SelectCellEditor startedByEnter 동일), 필드 클릭으로 토글
  const [open, setOpen] = useState(() => !plain || ed.eventKey === 'Enter');
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
  }, [hi, open]);

  const choose = v => {
    ed.setValue(v);
    core.stopEditing(false);
  };
  const typeBuffer = useRef({ text: '', t: 0 });
  const onKeyDown = e => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    } else if (e.key === 'ArrowDown') {
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
  // 기본 상한 없음 — 그리드 바디 공간이 상한 (AG valueListMaxHeight 지정 시 그 값)
  const maxH = typeof params.valueListMaxHeight === 'number' ? params.valueListMaxHeight : Infinity;
  // AG 구조: 셀(또는 팝업 에디터) 안에는 선택값 필드만, 목록은 필드 아래 별도 팝업
  //  → 셀 overflow 에 잘리지 않고, 셀이 스크롤로 가려져도 그리드 경계에 붙어 계속 보임
  const fieldRef = useRef(null);
  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      className={cx('r2-rich-select', plain && 'r2-select-editor', ed.editor.popup ? 'r2-popup-editor' : 'r2-rich-select-inline')}
      onKeyDown={onKeyDown}
      role="combobox"
      aria-expanded="true"
    >
      <div
        ref={fieldRef}
        className="r2-rich-select-value r2-picker-field-wrapper"
        onMouseDown={e => {
          if (e.target.tagName !== 'INPUT') e.preventDefault();
        }}
        onClick={() => setOpen(o => !o)}
      >
        {params.allowTyping ? (
          <input
            ref={inputRef}
            className="r2-input-field-input r2-text-field-input"
            value={search}
            placeholder={format(ed.value)}
            onChange={e => setSearch(e.target.value)}
          />
        ) : (
          <span className="r2-picker-field-display">{format(hi >= 0 ? shown[hi] : ed.value)}</span>
        )}
        <span className="r2-picker-field-icon">
          <Icon name="small-down" />
        </span>
      </div>
      {open && (
      <SelectListPopup anchorRef={fieldRef} getCellEl={getCellEl} count={shown.length}>
        {fitH => (
      <div
        ref={listRef}
        className="r2-rich-select-list"
        role="listbox"
        // 높이 = 선택지 개수만큼 (CSS 고정 높이보다 우선), 공간·valueListMaxHeight 넘치면 스크롤
        style={{ height: shown.length * rowH, maxHeight: Number.isFinite(Math.min(maxH, fitH ?? Infinity)) ? Math.min(maxH, fitH ?? Infinity) : undefined }}
      >
        <div className="r2-rich-select-virtual-list-container" style={{ height: shown.length * rowH }}>
          {shown.map((v, i) => {
            const label = format(v);
            const selected = v === ed.value;
            return (
              <div
                key={i}
                className={cx(
                  'r2-rich-select-row',
                  i === hi && 'r2-rich-select-row-highlighted',
                  selected && 'r2-rich-select-row-selected',
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
        )}
      </SelectListPopup>
      )}
    </div>
  );
}

// 셀 편집 팝업 공통: 셀(행) DOM 안에 두므로 스크롤하면 브라우저가 셀과 함께 움직이고(지연·흔들림 없음),
// 바디 뷰포트 밖으로 나간 부분은 뷰포트 overflow 로 잘린다. 행이 사라지면(필터·데이터 변경) 같이 사라진다.
// 위치는 열 때 레이아웃 단계에서 한 번만 계산 → 그리기 전에 확정돼 깜빡임 없음.
export const stopGridPointer = {
  onMouseDown: e => e.stopPropagation(),
  onPointerDown: e => e.stopPropagation(),
  onClick: e => e.stopPropagation(),
  onDoubleClick: e => e.stopPropagation(),
  onContextMenu: e => e.stopPropagation(),
};

// 셀이 보이는 영역: 세로 = 바디(또는 고정 행) 뷰포트, 가로 = 중앙 스크롤 영역(고정 컬럼이면 바디 전체)
function cellClipRects(cell) {
  const v = bodyClipOf(cell) || { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  const h = cell?.closest('.r2-center-cols-viewport')?.getBoundingClientRect() || v;
  return { v, h };
}

// 선택 목록 — 선택값 필드 바로 아래(공간 없으면 위, 둘 다 부족하면 넓은 쪽에 맞춰 줄이고 스크롤)
function SelectListPopup({ anchorRef, getCellEl, count, children }) {
  const ref = useRef(null);
  const [pl, setPl] = useState(null); // { above, maxH, dx }
  useLayoutEffect(() => {
    const el = ref.current;
    const a = anchorRef.current;
    if (!el || !a) return;
    const ar = a.getBoundingClientRect();
    const { v, h } = cellClipRects(getCellEl?.());
    // 원래 높이(줄이기 전): 목록 내용 높이 + 테두리
    const list = el.querySelector('.r2-rich-select-list');
    const natural = list ? list.scrollHeight + (el.offsetHeight - list.clientHeight) : el.offsetHeight;
    const below = v.bottom - ar.bottom - 2;
    const above = ar.top - v.top - 2;
    let up = false;
    let maxH;
    if (natural > below) {
      if (natural <= above) up = true;
      else if (above > below) {
        up = true;
        maxH = above;
      } else maxH = below;
    }
    const w = el.offsetWidth;
    let dx = 0;
    if (ar.left + w > h.right - 2) dx = Math.max(h.left + 2 - ar.left, h.right - 2 - w - ar.left);
    setPl({ above: up, maxH, dx });
  }, [count]);
  return (
    <div
      ref={ref}
      className="r2-popup-child r2-popup-editor r2-select-list-popup"
      style={{
        position: 'absolute',
        left: pl?.dx ?? 0,
        top: pl?.above ? undefined : '100%',
        bottom: pl?.above ? '100%' : undefined,
        minWidth: '100%',
        visibility: pl ? 'visible' : 'hidden',
      }}
      {...stopGridPointer}
    >
      {children(pl?.maxH != null ? pl.maxH - 2 : undefined)}
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
      const host = ed.editor.popup ? el?.querySelector('.r2-popup-editor-host') : el;
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
    <Builtin core={core} ed={ed} params={params} getCellEl={getCellEl} />
  ) : (
    <CustomEditor core={core} ed={ed} params={params} getCellEl={getCellEl} />
  );
  if (!ed.editor.popup) return content;
  return <PopupEditor core={core} ed={ed} getCellEl={getCellEl}>{content}</PopupEditor>;
}

function PopupEditor({ core, ed, getCellEl, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  // 셀 위(over) 또는 아래(under)에 배치, 보이는 영역을 넘으면 안쪽으로 밀어 넣음 (열 때 1회)
  useLayoutEffect(() => {
    const host = ref.current;
    const cell = getCellEl?.();
    if (!host || !cell || !host.offsetParent) return;
    const cr = cell.getBoundingClientRect();
    const op = host.offsetParent.getBoundingClientRect();
    const { v, h } = cellClipRects(cell);
    let x = cr.left;
    let y = ed.editor.popupPosition === 'under' ? cr.bottom : cr.top;
    const w = host.offsetWidth;
    const hh = host.offsetHeight;
    if (x + w > h.right - 2) x = Math.max(h.left + 2, h.right - 2 - w);
    if (y + hh > v.bottom - 2) y = Math.max(v.top + 2, v.bottom - 2 - hh);
    // absolute 기준은 offsetParent 의 padding box → 테두리 두께만큼 보정
    const par = host.offsetParent;
    setPos({ left: x - op.left - par.clientLeft, top: y - op.top - par.clientTop, minWidth: cr.width });
  }, [ed]);
  return (
    <div
      ref={ref}
      className="r2-popup-child r2-popup-editor r2-popup-editor-host"
      style={{ position: 'absolute', left: pos?.left ?? 0, top: pos?.top ?? 0, minWidth: pos?.minWidth, zIndex: 3, visibility: pos ? 'visible' : 'hidden' }}
      {...stopGridPointer}
    >
      {children}
    </div>
  );
}
