// 셀 값: valueGetter·field·식, 표시 텍스트(valueFormatter), 값 쓰기(setCellValue), 값 캐시
//  GridCore.prototype 에 합쳐짐 (this = GridCore)
import { pad2 } from './gridConstants.js';
import { localeText } from './locale.js';
import { evaluateExpression, getFieldValue, setFieldValue, toText } from './utils.js';

export const valueMethods = {
  // ── 값 ───────────────────────────────────────────────────
  makeValueParams(node, column) {
    return {
      node,
      data: node?.data,
      colDef: column?.colDef,
      column,
      api: this.api,
      context: this.gos.context,
      getValue: field => getFieldValue(node?.data, field),
    };
  },

  getCellValue(node, column) {
    if (!node || !column) return undefined;
    if (column.autoType === 'rowNumbers') {
      if (node.rowIndex == null || node.rowPinned) return null;
      const vg = column.colDef.valueGetter;
      return typeof vg === 'function' ? vg(this.makeValueParams(node, column)) : node.rowIndex + 1;
    }
    if (column.autoType === 'selection') return undefined;
    if (node.stub) return undefined;
    if (column.autoType === 'group') return this.getAutoGroupValue(node, column);
    // 일괄 편집 중 보류 값
    if (this.batch) {
      const pending = this.getBatchValue(node, column);
      if (pending) return pending.value;
    }
    // valueCache: valueGetter 결과를 데이터가 바뀔 때까지 재사용 (정렬·필터·집계에서 같은 값을 반복 계산하지 않음)
    const vg = column.colDef.valueGetter;
    if (vg && this.gos.valueCache && !(node.group && node.aggData && column.colId in node.aggData) && !node.footer) {
      let c = node.__vc;
      if (!c || node.__vcVer !== this.valueCacheVersion) {
        c = node.__vc = new Map();
        node.__vcVer = this.valueCacheVersion;
      }
      if (c.has(column.colId)) return c.get(column.colId);
      const v = this.computeCellValue(node, column);
      c.set(column.colId, v);
      return v;
    }
    return this.computeCellValue(node, column);
  },

  getBestCostNodeSelection() {
    if (!this.groupMode || !this.groupTop) return this.getSelectedNodes();
    const out = [];
    const leavesOf = n => (n.childrenAll || []).flatMap(c => (c.group && c.childrenAll ? [...(c.data !== undefined ? [c] : []), ...leavesOf(c)] : [c]));
    const walk = list => {
      for (const n of list) {
        if (n.group && n.childrenAll) {
          const leaves = leavesOf(n);
          if (leaves.length && leaves.every(l => l.selected) && (n.data === undefined || n.selected)) out.push(n);
          else {
            if (n.data !== undefined && n.selected) out.push(n);
            walk(n.childrenAll);
          }
        } else if (n.selected) out.push(n);
      }
    };
    walk(this.groupTop);
    return out;
  },

  // 값 캐시 만료: 데이터가 바뀌면 전체 (다른 행 값을 쓰는 valueGetter 가 있을 수 있어서).
  //  valueCacheNeverExpires 면 api.expireValueCache · refreshCells({ force }) 로만
  bumpValueCache(force = false) {
    if (!force && this.gos.valueCacheNeverExpires) return;
    this.valueCacheVersion = (this.valueCacheVersion || 0) + 1;
  },

  computeCellValue(node, column) {
    // 그룹 노드: 집계값 우선 (트리데이터의 데이터 보유 부모도 동일)
    if (node.group && node.aggData && column.colId in node.aggData) {
      // 합계 행이 아래에 따로 보이면 펼친 그룹 행은 집계값을 비움
      if (node.__footerShown && node.expanded && !node.footer && !this.gos.groupSuppressBlankHeader) return undefined;
      return node.aggData[column.colId];
    }
    if (node.footer) return undefined;
    if (node.group && node.data === undefined) return undefined;
    const cd = column.colDef;
    let v;
    if (cd.valueGetter) {
      const p = this.makeValueParams(node, column);
      v = typeof cd.valueGetter === 'function' ? cd.valueGetter(p) : evaluateExpression(cd.valueGetter, p);
    } else if (cd.field) v = getFieldValue(node.data, cd.field, this.gos.suppressFieldDotNotation);
    // enableCellExpressions: '=' 로 시작하는 값은 식으로 계산
    if (this.gos.enableCellExpressions && typeof v === 'string' && v.startsWith('=')) {
      try {
        return evaluateExpression(v.slice(1), this.makeValueParams(node, column));
      } catch {
        return v;
      }
    }
    return v;
  },

  // valueFormatter 결과 (없으면 null — valueFormatted=null)
  formatValue(node, column, value) {
    const cd = column.colDef;
    if (column.autoType === 'group' && column.groupIndex != null) {
      if (value == null || node.footer) return null;
      const target = this.ancestorAtLevel(node, column.groupIndex);
      if (!target) return null;
      if (target.key == null) return localeText(this, 'blanks');
      const rgc = target.rowGroupColumn;
      if (typeof rgc?.colDef.valueFormatter === 'function') {
        return rgc.colDef.valueFormatter({ ...this.makeValueParams(target, rgc), value: target.groupValue ?? value });
      }
      return null;
    }
    if (column.autoType === 'group' && node.group) {
      if (node.footer) return null;
      if (node.key == null && this.groupMode === 'group') return localeText(this, 'blanks');
      // 그룹 행 키는 그룹 기준 컬럼의 valueFormatter 로 표시
      const rgc = node.rowGroupColumn;
      if (rgc?.colDef.valueFormatter && typeof rgc.colDef.valueFormatter === 'function') {
        return rgc.colDef.valueFormatter({ ...this.makeValueParams(node, rgc), value: node.groupValue ?? value });
      }
      return null;
    }
    const vf = cd.valueFormatter;
    if (vf) {
      const p = { ...this.makeValueParams(node, column), value };
      return typeof vf === 'function' ? vf(p) : evaluateExpression(vf, p);
    }
    if (cd.refData && value != null) return cd.refData[value] ?? value;
    // dataTypeDefinitions 의 valueFormatter
    const dtf = column.dataTypeDef?.valueFormatter;
    if (typeof dtf === 'function') return dtf({ ...this.makeValueParams(node, column), value });
    if (column.dataType === 'date' && value instanceof Date) {
      return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    }
    return null;
  },

  getCellText(node, column) {
    const v = this.getCellValue(node, column);
    const f = this.formatValue(node, column, v);
    const out = f != null ? f : v;
    return out == null ? '' : typeof out === 'object' && !(out instanceof Date) ? String(out) : toText(out);
  },

  cellEventParams(node, column, event) {
    return {
      node,
      data: node?.data,
      value: column ? this.getCellValue(node, column) : undefined,
      rowIndex: node?.rowIndex ?? null,
      rowPinned: node?.rowPinned,
      colDef: column?.colDef,
      column,
      event,
    };
  },

  isCellEditable(column, node) {
    if (!node || !column || node.detail || column.isAuto || node.footer) return false;
    // 그룹 행: enableGroupEdit 일 때만 (트리 데이터의 데이터 있는 부모 행은 그냥 편집 가능)
    if (node.group && !this.gos.enableGroupEdit && !(node.data && (this.gos.treeData || node.__ssrmTree))) return false;
    const e = column.colDef.editable;
    if (typeof e === 'function') return !!e(this.makeValueParams(node, column));
    return !!e;
  },

  setCellValue(node, column, newValue, source = 'api', knownOldValue) {
    if (!node || !column) return false;
    this.spanEpoch = (this.spanEpoch || 0) + 1;
    const cd = column.colDef;
    const oldValue = knownOldValue !== undefined ? knownOldValue : this.getCellValue(node, column);
    const params = { ...this.makeValueParams(node, column), oldValue, newValue };
    let changed;
    if (cd.valueSetter) {
      if (typeof cd.valueSetter === 'function') {
        changed = cd.valueSetter(params);
        if (changed === undefined) changed = true;
      } else {
        setFieldValue(node.data, cd.valueSetter, newValue);
        changed = true;
      }
    } else if (cd.field) {
      const eq = cd.equals ? cd.equals(oldValue, newValue) : oldValue === newValue;
      // 데이터 없는 그룹 행(enableGroupEdit)은 valueSetter 없이는 쓸 곳이 없음 → 이벤트(cellEditingStopped)로만 알림
      if (eq || !node.data) changed = false;
      else {
        setFieldValue(node.data, cd.field, newValue, this.gos.suppressFieldDotNotation);
        changed = true;
      }
    } else changed = false;
    if (!changed) return false;
    this.recordUndo(node, column, oldValue, newValue, source);
    node.__version++;
    this.bumpValueCache();
    node.__quickFilterText = null;
    // 집계 먼저 (cellValueChanged 에서 그룹·루트 aggData 가 새 값이게). suppressChangeDetection 이면 다시 집계 안 함
    if (!this.gos.suppressChangeDetection) this.markAggDirty(node);
    this.dispatch('cellValueChanged', {
      ...this.cellEventParams(node, column),
      value: newValue,
      oldValue,
      newValue,
      source,
    });
    node.__dispatchLocal('cellChanged', { column, newValue, oldValue });
    if (cd.enableCellChangeFlash) this.flashCells({ rowNodes: [node], columns: [column] });
    this.notify();
    return true;
  },
};
