// 채우기/범위 핸들 (cellSelection.handle = { mode: 'fill' | 'range', direction, suppressClearOnFillReduction, setFillValue })
// 레거시: enableFillHandle / enableRangeHandle / fillHandleDirection / fillOperation
//  - fill : 숫자 2개 이상 → 최소제곱 직선으로 연장, 1개/문자 → 복사(순환). Alt 로 증가/복사 토글. 줄이면 비움.
//  - range: 범위 크기만 조절
// 이벤트: fillStart / fillEnd({ initialRange, finalRange }) , cellValueChanged(source 'rangeSvc')

const isNum = v => typeof v === 'number' && Number.isFinite(v);

// 최소제곱 직선 y = a + b*x (x = 0..n-1) 로 n 번째 이후 값 예측 (AG 동일 방식)
function linearSeries(values) {
  const n = values.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let x = 0; x < n; x++) {
    sx += x;
    sy += values[x];
    sxy += x * values[x];
    sxx += x * x;
  }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  return x => {
    const v = a + b * x;
    return Math.round(v * 1e10) / 1e10;
  };
}

export const fillHandleMethods = {
  getFillHandleOpts() {
    const g = this.gos;
    const cs = this.cellSelectionOpts;
    if (!cs) return null;
    const h = cs.handle;
    if (h && typeof h === 'object' && (h.mode === 'fill' || h.mode === 'range')) {
      return { direction: 'xy', ...h };
    }
    if (g.enableFillHandle) {
      return {
        mode: 'fill',
        direction: g.fillHandleDirection || 'xy',
        suppressClearOnFillReduction: !!g.suppressClearOnFillReduction,
        setFillValue: g.fillOperation,
      };
    }
    if (g.enableRangeHandle) return { mode: 'range', direction: 'xy' };
    return null;
  },

  // 핸들 위치: 범위가 하나일 때 그 범위의 우하단 셀
  getFillHandleCell() {
    if (this.__fhVersion === this.version) return this.__fh;
    let fh = null;
    const opts = this.getFillHandleOpts();
    if (opts && this.ranges.length === 1 && !this.rangeDragging && !this.editing) {
      const b = this.rangeBounds(this.ranges[0]);
      const col = b && this.displayedColumns[b.c1];
      if (b && !col?.colDef.suppressFillHandle) fh = { rowIndex: b.r1, colId: col?.colId, mode: opts.mode };
    }
    this.__fh = fh;
    this.__fhVersion = this.version;
    return fh;
  },

  fillStart() {
    const b = this.ranges.length === 1 ? this.rangeBounds(this.ranges[0]) : null;
    if (!b) return false;
    this.fillState = { initial: b, target: { ...b } };
    this.notify();
    this.dispatch('fillStart', {});
    return true;
  },

  // 포인터 아래 셀 → 확장/축소 대상 영역 계산
  fillMove(rowIndex, colId) {
    const st = this.fillState;
    if (!st) return;
    const ci = this.displayedIndex.get(colId);
    if (ci == null) return;
    const b = st.initial;
    const dir = this.getFillHandleOpts()?.direction || 'xy';
    const allowY = dir !== 'x';
    const allowX = dir !== 'y';
    const dy = rowIndex > b.r1 ? rowIndex - b.r1 : rowIndex < b.r0 ? b.r0 - rowIndex : 0;
    const dx = ci > b.c1 ? ci - b.c1 : ci < b.c0 ? b.c0 - ci : 0;
    let t = { ...b };
    if (allowY && dy && (dy >= dx || !allowX)) {
      t = rowIndex > b.r1 ? { ...b, r1: rowIndex } : { ...b, r0: rowIndex };
    } else if (allowX && dx) {
      t = ci > b.c1 ? { ...b, c1: ci } : { ...b, c0: ci };
    } else if (!dy && !dx) {
      // 범위 안쪽으로 끌면 축소 (아래/오른쪽 끝을 당김)
      if (allowY && rowIndex < b.r1) t = { ...b, r1: rowIndex };
      else if (allowX && ci < b.c1) t = { ...b, c1: ci };
    }
    if (t.r0 === st.target.r0 && t.r1 === st.target.r1 && t.c0 === st.target.c0 && t.c1 === st.target.c1) return;
    st.target = t;
    this.notify();
  },

  // 미리보기 테두리 (렌더용): 대상 영역의 가장자리 셀 클래스
  fillPreviewInfo(rowIndex, colId) {
    const st = this.fillState;
    if (!st) return null;
    const t = st.target;
    const ci = this.displayedIndex.get(colId);
    if (ci == null || rowIndex < t.r0 || rowIndex > t.r1 || ci < t.c0 || ci > t.c1) return null;
    return { top: rowIndex === t.r0, bottom: rowIndex === t.r1, left: ci === t.c0, right: ci === t.c1 };
  },

  fillEnd(event, cancelled = false) {
    const st = this.fillState;
    if (!st) return;
    this.fillState = null;
    const opts = this.getFillHandleOpts();
    const b = st.initial;
    const t = st.target;
    const same = b.r0 === t.r0 && b.r1 === t.r1 && b.c0 === t.c0 && b.c1 === t.c1;
    const toRange = x => ({
      startRow: { rowIndex: x.r0, rowPinned: null },
      endRow: { rowIndex: x.r1, rowPinned: null },
      columns: this.displayedColumns.slice(x.c0, x.c1 + 1),
    });
    if (!cancelled && !same && opts) {
      if (opts.mode === 'fill') this.applyFill(b, t, opts, event);
      const r = this.ranges[0];
      if (r) {
        r.startRowIndex = t.r0;
        r.endRowIndex = t.r1;
        r.startColId = this.displayedColumns[t.c0].colId;
        r.endColId = this.displayedColumns[t.c1].colId;
      }
      this.dispatchRangeChanged(false, true);
    }
    this.notify();
    this.dispatch('fillEnd', { initialRange: toRange(b), finalRange: toRange(cancelled ? b : t) });
  },

  applyFill(b, t, opts, event) {
    const cols = this.displayedColumns;
    const rows = this.displayedNodes;
    const alt = !!event?.altKey;
    this.beginUndoBatch();
    const touchedNodes = new Set();
    const touchedCols = new Set();
    const write = (node, col, value) => {
      if (!node || node.detail || node.group || !col || col.isAuto) return;
      if (!this.isCellEditable(col, node)) return;
      this.writeCell(node, col, value, 'rangeSvc');
      touchedNodes.add(node);
      touchedCols.add(col);
    };

    // 축소 → 잘려 나간 칸 비우기
    if (t.r1 < b.r1 || t.c1 < b.c1) {
      if (!opts.suppressClearOnFillReduction) {
        for (let ri = b.r0; ri <= b.r1; ri++) {
          for (let ci = b.c0; ci <= b.c1; ci++) {
            if (ri <= t.r1 && ci <= t.c1) continue;
            write(rows[ri], cols[ci], null);
          }
        }
      }
    } else {
      const vertical = t.r0 !== b.r0 || t.r1 !== b.r1;
      const backward = vertical ? t.r0 < b.r0 : t.c0 < b.c0;
      const direction = vertical ? (backward ? 'up' : 'down') : backward ? 'left' : 'right';
      // 각 라인(세로 채우기면 컬럼, 가로면 행)마다 원본 값 → 새 칸 채우기
      const lines = vertical ? [b.c0, b.c1] : [b.r0, b.r1];
      for (let li = lines[0]; li <= lines[1]; li++) {
        const srcCells = [];
        if (vertical) for (let ri = b.r0; ri <= b.r1; ri++) srcCells.push([rows[ri], cols[li]]);
        else for (let ci = b.c0; ci <= b.c1; ci++) srcCells.push([rows[li], cols[ci]]);
        const values = srcCells.map(([n, c]) => this.getCellValue(n, c));
        const ordered = backward ? [...values].reverse() : values;
        const allNum = ordered.length > 0 && ordered.every(isNum);
        let next;
        if (allNum && ordered.length > 1 && !alt) {
          const f = linearSeries(ordered);
          next = k => f(ordered.length + k);
        } else if (allNum && ordered.length === 1 && alt) {
          next = k => ordered[0] + (k + 1);
        } else {
          next = k => ordered[k % ordered.length];
        }
        const targets = [];
        if (vertical) {
          if (backward) for (let ri = b.r0 - 1; ri >= t.r0; ri--) targets.push([rows[ri], cols[li]]);
          else for (let ri = b.r1 + 1; ri <= t.r1; ri++) targets.push([rows[ri], cols[li]]);
        } else if (backward) for (let ci = b.c0 - 1; ci >= t.c0; ci--) targets.push([rows[li], cols[ci]]);
        else for (let ci = b.c1 + 1; ci <= t.c1; ci++) targets.push([rows[li], cols[ci]]);
        targets.forEach(([node, col], k) => {
          let value = next(k);
          if (typeof opts.setFillValue === 'function') {
            const r = opts.setFillValue({
              event,
              values: ordered,
              initialValues: ordered,
              initialNonAggregatedValues: ordered,
              currentIndex: k,
              currentCellValue: node && col ? this.getCellValue(node, col) : undefined,
              direction,
              column: col,
              rowNode: node,
              api: this.api,
              context: this.gos.context,
            });
            if (r !== false) value = r;
          }
          write(node, col, value);
        });
      }
    }
    this.endUndoBatch();
  },
};
