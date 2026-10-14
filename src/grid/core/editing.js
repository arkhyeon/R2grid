// 셀·행 편집, 편집 값 검사, 범위 일괄 입력
//  GridCore.prototype 에 합쳐짐 (this = GridCore)
import { localeText } from './locale.js';
import { evaluateExpression } from './utils.js';

export const editingMethods = {
  // ── 편집 ─────────────────────────────────────────────────
  resolveEditor(node, column) {
    const cd = column.colDef;
    const params = { ...this.makeValueParams(node, column), value: this.getCellValue(node, column) };
    const sel = typeof cd.cellEditorSelector === 'function' ? cd.cellEditorSelector(params) : null;
    let comp = sel?.component ?? cd.cellEditor;
    const rawParams = sel?.params ?? cd.cellEditorParams;
    const editorParams = (typeof rawParams === 'function' ? rawParams(params) : rawParams) || {};
    let popup = sel?.popup ?? cd.cellEditorPopup;
    if (!comp || comp === true) {
      const t = column.dataType;
      if (t === 'number') comp = 'r2NumberCellEditor';
      else if (t === 'boolean') comp = 'r2CheckboxCellEditor';
      else if (t === 'date') comp = 'r2DateCellEditor';
      else if (t === 'dateString') comp = 'r2DateStringCellEditor';
      else comp = 'r2TextCellEditor';
    }
    if (typeof comp === 'string') {
      const registered = this.gos.components?.[comp];
      if (registered) comp = registered;
    }
    // r2RichSelect/r2Select 는 isPopup()=false (셀 안 필드 + 목록 팝업), r2LargeText 만 팝업
    if (comp === 'r2LargeTextCellEditor') popup = popup ?? true;
    return {
      comp,
      params: editorParams,
      popup: !!popup,
      popupPosition: sel?.popupPosition ?? cd.cellEditorPopupPosition ?? 'over',
    };
  },

  // 셀 1개의 편집 상태
  makeCellEditor(node, column, eventKey) {
    const value = this.getCellValue(node, column);
    const ed = {
      node,
      column,
      colId: column.colId,
      rowIndex: node.rowIndex,
      value,
      startValue: value,
      eventKey,
      editor: this.resolveEditor(node, column),
      valueChanged: false,
      ref: { current: null },
      hooks: {},
    };
    ed.setValue = v => {
      ed.value = v;
      ed.valueChanged = true;
      this.revalidateEditing(ed);
    };
    return ed;
  },

  // ── 편집 값 검증 ─────────────────────────────────────────
  // 내장 에디터 규칙(숫자 min·max·step, 날짜 min·max, 글자 수 maxLength)
  //  → 사용자 에디터의 getValidationErrors() → cellEditorParams.getValidationErrors 가 최종 결정
  cellEditorErrors(ed) {
    const inst = ed.ref.current;
    const p = ed.editor.params || {};
    const comp = ed.editor.comp;
    let value = ed.value;
    if (!ed.valueChanged && typeof inst?.getValue === 'function') value = inst.getValue();
    const msg = (key, x) => String(localeText(this, key)).replace('${value}', x);
    const errs = [];
    if (comp === 'r2TextCellEditor' || comp === 'r2LargeTextCellEditor') {
      const max = p.maxLength ?? (comp === 'r2LargeTextCellEditor' ? 200 : null);
      if (max != null && typeof value === 'string' && value.length > max) errs.push(msg('validationMaxLength', max));
    } else if (comp === 'r2NumberCellEditor') {
      if (typeof value === 'number') {
        if (p.min != null && value < p.min) errs.push(msg('validationMin', p.min));
        if (p.max != null && value > p.max) errs.push(msg('validationMax', p.max));
        if (p.step > 0) {
          const base = p.min ?? (typeof ed.startValue === 'number' ? ed.startValue : 0);
          const k = (value - base) / p.step;
          if (Math.abs(k - Math.round(k)) > 1e-9) errs.push(msg('validationStep', p.step));
        }
      }
    } else if (comp === 'r2DateCellEditor' || comp === 'r2DateStringCellEditor') {
      const ymd = v => {
        if (v == null || v === '') return null;
        if (v instanceof Date) {
          const z = n => (n < 10 ? `0${n}` : n);
          return `${v.getFullYear()}-${z(v.getMonth() + 1)}-${z(v.getDate())}`;
        }
        return String(v).slice(0, 10);
      };
      const d = ymd(value);
      if (d) {
        const lo = ymd(p.min);
        const hi = ymd(p.max);
        if (lo && d < lo) errs.push(msg('validationMinDate', lo));
        if (hi && d > hi) errs.push(msg('validationMaxDate', hi));
      }
    }
    let internal = errs.length ? errs : null;
    const own = typeof inst?.getValidationErrors === 'function' ? inst.getValidationErrors : ed.hooks?.getValidationErrors;
    if (typeof own === 'function') internal = own() ?? null;
    if (typeof p.getValidationErrors === 'function') {
      const { node, column } = ed;
      const cellEditorParams = {
        ...p,
        value,
        node,
        column,
        colDef: column.colDef,
        data: node.data,
        rowIndex: node.rowIndex,
        api: this.api,
        context: this.gos.context,
      };
      internal = p.getValidationErrors({ value, internalErrors: internal, cellEditorParams }) ?? null;
    }
    return internal && internal.length ? internal : null;
  },

  // 행 전체 편집(editType:'fullRow') 검증: getFullRowEditValidationErrors({ editorsState })
  rowEditErrors(editing = this.editing) {
    const fn = this.gos.getFullRowEditValidationErrors;
    if (!editing?.fullRow || typeof fn !== 'function') return null;
    const editorsState = [...editing.cells.values()].map(c => ({
      rowIndex: c.node.rowIndex,
      rowPinned: c.node.rowPinned || null,
      colId: c.colId,
      column: c.column,
      oldValue: c.startValue,
      newValue: c.valueChanged ? c.value : (c.ref.current?.getValue?.() ?? c.value),
      state: 'editing',
    }));
    const r = fn({ editorsState, api: this.api, context: this.gos.context });
    return r && r.length ? r : null;
  },

  // 값이 바뀔 때마다 다시 검사 — 결과가 달라졌을 때만 다시 그림
  revalidateEditing(ed) {
    const editing = this.editing;
    if (!ed || !editing || !editing.cells.has(ed.colId) || editing.cells.get(ed.colId) !== ed) return;
    const key = x => (x ? x.join('\u0001') : '');
    const cellErrs = this.cellEditorErrors(ed);
    const rowErrs = this.rowEditErrors(editing);
    const changed = key(cellErrs) !== key(ed.errors) || key(rowErrs) !== key(editing.rowErrors);
    ed.errors = cellErrs;
    editing.rowErrors = rowErrs;
    if (changed) this.notify();
  },

  // 지금 편집 중인 값 검사 결과 (api.validateEdit)
  validateEdit() {
    const editing = this.editing;
    if (!editing) return null;
    const out = [];
    for (const c of editing.cells.values()) {
      const m = this.cellEditorErrors(c);
      c.errors = m;
      if (m) out.push({ rowIndex: c.node.rowIndex, rowPinned: c.node.rowPinned || null, column: c.column, messages: m });
    }
    const rowErrs = this.rowEditErrors(editing);
    editing.rowErrors = rowErrs;
    if (rowErrs && !out.length)
      out.push({ rowIndex: editing.node.rowIndex, rowPinned: editing.node.rowPinned || null, column: editing.column, messages: rowErrs });
    return out.length ? out : null;
  },

  // ── 범위 일괄 입력 (bulk edit) ─────────────────────────────
  // 셀 범위를 고른 채 편집하다 Ctrl+Enter: 지금 입력한 값을 범위 안 편집 가능한 모든 칸에 넣음 (되돌리기 한 번)
  //  일괄 편집(batch) 중이면 보류 값으로만 쌓음. bulkEditingStarted / bulkEditingStopped({ changes })
  applyBulkEdit() {
    const ed = this.editing;
    const ranges = this.getCellRanges();
    if (!ed || !ranges.length) return false;
    if (this.validateEdit()) {
      if (this.gos.invalidEditValueMode === 'block') {
        this.notify();
        return true;
      }
      this.stopEditing(true);
      return true;
    }
    const src = ed.primary;
    const inst = src.ref.current;
    const raw = !src.valueChanged && typeof inst?.getValue === 'function' ? inst.getValue() : src.value;
    this.editing = null;
    if (!this.batch) this.dispatch('bulkEditingStarted', {});
    const changes = [];
    this.beginUndoBatch();
    for (const r of ranges) {
      const r0 = Math.min(r.startRow.rowIndex, r.endRow.rowIndex);
      const r1 = Math.max(r.startRow.rowIndex, r.endRow.rowIndex);
      for (let i = r0; i <= r1; i++) {
        const node = this.displayedNodes[i];
        if (!node || node.stub) continue;
        for (const column of r.columns) {
          if (!this.isCellEditable(column, node)) continue;
          const oldValue = this.getCellValue(node, column);
          const newValue = this.parseBulkValue(node, column, raw, oldValue);
          if (newValue === oldValue) continue;
          if (this.batch) this.stageBatchValue(node, column, newValue, oldValue);
          else if (this.gos.readOnlyEdit)
            this.dispatch('cellEditRequest', { ...this.cellEventParams(node, column), oldValue, newValue, value: newValue, source: 'bulk' });
          else if (!this.setCellValue(node, column, newValue, 'bulk', oldValue)) continue;
          changes.push({ rowIndex: node.rowIndex, rowPinned: node.rowPinned || null, columnId: column.colId, oldValue, newValue });
        }
      }
    }
    this.endUndoBatch();
    this.notify();
    for (const c of ed.cells.values()) {
      const node = c.node;
      const now = this.getCellValue(node, c.column);
      this.dispatch('cellEditingStopped', {
        ...this.cellEventParams(node, c.column),
        oldValue: c.startValue,
        newValue: now,
        valueChanged: now !== c.startValue,
      });
    }
    if (ed.fullRow) this.dispatch('rowEditingStopped', this.rowEventParams(ed.node));
    if (!this.batch) this.dispatch('bulkEditingStopped', { changes });
    this.focusGrid();
    return true;
  },

  parseBulkValue(node, column, value, oldValue) {
    const cd = column.colDef;
    let v = value;
    if (cd.valueParser) {
      const p = { ...this.makeValueParams(node, column), oldValue, newValue: v };
      v = typeof cd.valueParser === 'function' ? cd.valueParser(p) : evaluateExpression(cd.valueParser, p);
    } else if (typeof column.dataTypeDef?.valueParser === 'function') {
      v = column.dataTypeDef.valueParser({ ...this.makeValueParams(node, column), oldValue, newValue: v });
    } else if (column.dataType === 'number' && typeof v === 'string') {
      const t = v.replace(/,/g, '').trim();
      v = t === '' ? null : Number(t);
    } else if (column.dataType === 'boolean' && typeof v === 'string') {
      v = v.trim().toLowerCase() === 'true';
    } else if (column.dataType === 'text' && v === '') {
      v = null;
    }
    return typeof v === 'number' && Number.isNaN(v) ? null : v;
  },

  // 편집 칸에 보여 줄 오류 (셀 오류 + 행 오류는 지금 편집 칸에)
  editErrorsFor(ced) {
    const editing = this.editing;
    if (!ced || !editing) return null;
    const row = editing.primary === ced ? editing.rowErrors : null;
    if (!ced.errors && !row) return null;
    return [...(ced.errors || []), ...(row || [])];
  },

  // editing = 행 단위 (editType:'fullRow' 면 편집 가능한 모든 셀, 아니면 1셀)
  startEdit(node, column, eventKey = null, source = 'ui') {
    if (!node || !column) return false;
    const cur = this.editing;
    if (cur) {
      if (cur.node === node && cur.cells.has(column.colId)) {
        cur.primary = cur.cells.get(column.colId);
        cur.column = column;
        cur.colId = column.colId;
        this.focus = { rowIndex: node.rowIndex, colId: column.colId, rowPinned: node.rowPinned || null };
        this.notify();
        return true;
      }
      if (!this.stopEditing(false)) return false;
    }
    if (!this.isCellEditable(column, node)) return false;
    const fullRow = this.gos.editType === 'fullRow';
    const cells = new Map();
    if (fullRow) {
      for (const c of this.displayedColumns) {
        if (this.isCellEditable(c, node)) cells.set(c.colId, this.makeCellEditor(node, c, c === column ? eventKey : null));
      }
    } else {
      cells.set(column.colId, this.makeCellEditor(node, column, eventKey));
    }
    const editing = {
      node,
      column,
      colId: column.colId,
      rowIndex: node.rowIndex,
      fullRow,
      cells,
      primary: cells.get(column.colId),
      source,
    };
    // 단일 셀 시절 코드 호환 (editing.editor / ref / hooks / value)
    Object.defineProperties(editing, {
      editor: { get: () => editing.primary.editor },
      ref: { get: () => editing.primary.ref },
      hooks: { get: () => editing.primary.hooks },
      value: { get: () => editing.primary.value },
    });
    this.editing = editing;
    this.focus = { rowIndex: node.rowIndex, colId: column.colId, rowPinned: node.rowPinned || null };
    this.notify();
    if (fullRow) this.dispatch('rowEditingStarted', this.rowEventParams(node));
    for (const c of cells.values()) this.dispatch('cellEditingStarted', this.cellEventParams(node, c.column));
    return true;
  },

  rowEventParams(node, event) {
    return { node, data: node.data, rowIndex: node.rowIndex, rowPinned: node.rowPinned, event };
  },

  getEditingCell(node, column) {
    const e = this.editing;
    if (!e || e.node !== node) return null;
    return e.cells.get(column.colId) || null;
  },

  setEditorValue(v, cellEd) {
    const e = cellEd || this.editing?.primary;
    if (!e) return;
    e.value = v;
    e.valueChanged = true;
    this.revalidateEditing(e);
    this.notify();
  },

  // 내장 에디터는 자체 state 로 입력을 그리므로 재렌더 없이 값만 기록 (검사 결과가 바뀌면 그때만 그림)
  setEditorValueSilently(v, cellEd) {
    const e = cellEd || this.editing?.primary;
    if (!e) return;
    e.value = v;
    e.valueChanged = true;
    this.revalidateEditing(e);
  },

  // 셀 편집 결과 반영 → cellEditingStopped 파라미터 반환
  commitCellEditor(ed, cancel) {
    const inst = ed.ref.current;
    let newValue = ed.value;
    if (!ed.valueChanged && inst && typeof inst.getValue === 'function') newValue = inst.getValue();
    const cancelAfterEnd = !cancel && (!!inst?.isCancelAfterEnd?.() || !!ed.hooks.isCancelAfterEnd?.());
    const { node, column } = ed;
    const oldValue = ed.startValue;
    let valueChanged = false;
    const cancelled = cancel || cancelAfterEnd;
    // 원래 값이 비어있고 입력도 비어있으면 원래 값 유지 (TextCellEditor.getValue 규칙)
    if (newValue === '' && oldValue == null) newValue = oldValue;
    if (!cancelled && newValue !== oldValue) {
      const cd = column.colDef;
      if (cd.valueParser) {
        const p = { ...this.makeValueParams(node, column), oldValue, newValue };
        newValue = typeof cd.valueParser === 'function' ? cd.valueParser(p) : evaluateExpression(cd.valueParser, p);
      } else if (typeof column.dataTypeDef?.valueParser === 'function') {
        newValue = column.dataTypeDef.valueParser({ ...this.makeValueParams(node, column), oldValue, newValue });
      } else if (column.dataType === 'text' && newValue === '') {
        newValue = null;
      }
      if (this.batch) {
        // 일괄 편집: 데이터엔 아직 안 씀 (commitBatchEdit 때 반영)
        valueChanged = this.stageBatchValue(node, column, newValue, oldValue);
      } else if (this.gos.readOnlyEdit) {
        this.dispatch('cellEditRequest', {
          ...this.cellEventParams(node, column),
          oldValue,
          newValue,
          value: newValue,
          source: 'edit',
        });
      } else {
        valueChanged = this.setCellValue(node, column, newValue, 'edit', oldValue);
      }
    }
    return {
      valueChanged,
      params: {
        ...this.cellEventParams(node, column),
        oldValue,
        newValue: cancelled ? oldValue : newValue,
        valueChanged,
      },
    };
  },

  // 편집 끝내기. 검사에 걸린 값은 invalidEditValueMode 대로:
  //  'revert'(기본) 틀린 칸만 원래 값으로 (행 검사에 걸리면 행 전체), 'block' 편집을 끝내지 않고 그대로 둠 → false 반환
  stopEditing(cancel = false, { noFocus = false } = {}) {
    const ed = this.editing;
    if (!ed) return true;
    let revert = null;
    if (!cancel && this.validateEdit()) {
      if (this.gos.invalidEditValueMode === 'block') {
        this.notify();
        return false;
      }
      revert = ed.rowErrors ? new Set(ed.cells.keys()) : new Set([...ed.cells.values()].filter(c => c.errors).map(c => c.colId));
    }
    this.editing = null;
    const results = [];
    this.beginUndoBatch();
    for (const c of ed.cells.values()) results.push(this.commitCellEditor(c, cancel || !!revert?.has(c.colId)));
    this.endUndoBatch();
    this.notify();
    for (const r of results) this.dispatch('cellEditingStopped', r.params);
    if (ed.fullRow) {
      this.dispatch('rowEditingStopped', this.rowEventParams(ed.node));
      if (!cancel && results.some(r => r.valueChanged)) this.dispatch('rowValueChanged', this.rowEventParams(ed.node));
    }
    if (!noFocus) this.focusGrid();
    return true;
  },

  // fullRow 편집 중 Tab: 같은 행의 다음 편집 셀로 이동
  tabWithinEditingRow(backwards) {
    const ed = this.editing;
    const ids = [...ed.cells.keys()];
    if (ids.length < 2) return false;
    const i = ids.indexOf(ed.primary.colId);
    const next = ids[(i + (backwards ? -1 : 1) + ids.length) % ids.length];
    ed.primary = ed.cells.get(next);
    ed.column = ed.primary.column;
    ed.colId = next;
    this.focus = { rowIndex: ed.node.rowIndex, colId: next, rowPinned: ed.node.rowPinned || null };
    this.ensureColumnVisible(next);
    this.notify();
    this.focusEditorInput();
    return true;
  },

  // 지금 편집 칸의 입력 요소로 포커스 (검사에 걸려 편집을 못 끝냈을 때 다른 칸 클릭 후 되돌리기 등)
  focusEditorInput() {
    const ed = this.editing;
    if (!ed) return;
    const id = ed.primary.colId;
    this.focus = { rowIndex: ed.node.rowIndex, colId: id, rowPinned: ed.node.rowPinned || null };
    const rowSel = ed.node.rowPinned ? `[row-index="${ed.node.rowPinned[0]}-${ed.node.rowIndex}"]` : `[row-index="${ed.node.rowIndex}"]`;
    setTimeout(() => {
      const cell = this.eRoot?.querySelector(`.r2-row${rowSel} .r2-cell[col-id="${CSS.escape(id)}"]`);
      cell?.querySelector('input,textarea,select,[tabindex]')?.focus({ preventScroll: true });
    }, 0);
  },

  // 테마 변수 스타일 넣기: themeStyleContainer(요소 또는 함수, 기본 head) · styleNonce(CSP).
  //  themeCssLayer 는 지원 안 함: 테마 값만 layer 에 넣으면 layer 밖 기본 CSS 에 져서 적용되지 않음 (r2grid.css 를 앱에서 layer 로 import)
  installTheme() {
    const g = this.gos;
    const sc = g.themeStyleContainer;
    const container = typeof sc === 'function' ? sc() : sc;
    this.theme?.install(this.getDocument(), { container: container || null, nonce: g.styleNonce });
  },

  // getDocument: 그리드가 다른 문서(iframe·새 창)에 그려질 때 그 문서. 없으면 그리드 루트의 문서
  getDocument() {
    const fn = this.gos.getDocument;
    return (typeof fn === 'function' && fn()) || this.eRoot?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  },

  focusGrid() {
    const el = this.eFocusSink;
    const doc = this.getDocument();
    if (el && doc.activeElement !== el) {
      // 그리드 밖으로 포커스가 나간 경우엔 뺏지 않는다
      if (!this.eRoot || !doc.activeElement || this.eRoot.contains(doc.activeElement) || doc.activeElement === doc.body) {
        el.focus({ preventScroll: true });
      }
    }
  },
};
