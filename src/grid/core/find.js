// Find: findSearchValue / findOptions + findNext / findPrevious / findGoTo / findClearActive ...
// 표시 행 × 표시 컬럼의 표시 텍스트에서 일치 위치를 모두 찾는다. 한 셀 안의 여러 일치도 각각 매치.
export const findMethods = {
  findKey() {
    const g = this.gos;
    return `${g.findSearchValue ?? ''}|${JSON.stringify(g.findOptions || {})}|${this.spanEpoch || 0}|${this.columnsVersion}|${this.pageFirstRow}:${this.pageLastRow}`;
  },

  findMatches() {
    const value = this.gos.findSearchValue;
    if (value == null || value === '') return [];
    const key = this.findKey();
    if (this.__findKey === key && this.__findNodes === this.displayedNodes) return this.__findMatches;
    const opts = this.gos.findOptions || {};
    const cs = !!opts.caseSensitive;
    const needle = cs ? String(value) : String(value).toLowerCase();
    const from = opts.currentPageOnly ? this.pageFirstRow : 0;
    const to = opts.currentPageOnly ? this.pageLastRow : this.displayedNodes.length;
    const cols = this.displayedColumns.filter(c => c.autoType !== 'selection' && c.autoType !== 'rowNumbers');
    const out = [];
    for (let i = from; i < to; i++) {
      const node = this.displayedNodes[i];
      if (!node || node.detail || node.stub) continue;
      for (const column of cols) {
        const gft = column.colDef.getFindText;
        let text = typeof gft === 'function' ? gft({ ...this.makeValueParams(node, column), value: this.getCellValue(node, column) }) : this.getCellText(node, column);
        text = text == null ? '' : String(text);
        if (!text) continue;
        if (!cs) text = text.toLowerCase();
        let k = 0;
        let p = text.indexOf(needle);
        while (p >= 0) {
          out.push({ node, column, numInMatch: ++k });
          p = text.indexOf(needle, p + needle.length);
        }
      }
    }
    this.__findKey = key;
    this.__findNodes = this.displayedNodes;
    this.__findMatches = out;
    // 활성 매치가 사라졌으면 해제
    if (this.findActive && !out.some(m => m.node === this.findActive.node && m.column === this.findActive.column && m.numInMatch === this.findActive.numInMatch)) {
      this.findActive = null;
    }
    return out;
  },

  findGetTotalMatches() {
    return this.findMatches().length;
  },

  findGetActiveMatch() {
    return this.findActive ? { ...this.findActive } : undefined;
  },

  findIndexOf(m) {
    if (!m) return -1;
    return this.findMatches().findIndex(x => x.node === m.node && x.column === m.column && x.numInMatch === m.numInMatch);
  },

  findStep(dir) {
    const list = this.findMatches();
    if (!list.length) return;
    const cur = this.findIndexOf(this.findActive);
    const next = cur < 0 ? (dir > 0 ? 0 : list.length - 1) : (cur + dir + list.length) % list.length;
    this.findGoTo(list[next]);
  },

  findNext() {
    this.findStep(1);
  },

  findPrevious() {
    this.findStep(-1);
  },

  findGoTo(match) {
    if (!match) return;
    const idx = this.findIndexOf(match);
    if (idx < 0) return;
    this.findActive = this.findMatches()[idx];
    const { node, column } = this.findActive;
    if (node.rowIndex != null) this.ensureIndexVisible(node.rowIndex);
    this.ensureColumnVisible(column);
    this.notify();
    this.dispatchFindChanged();
  },

  findClearActive() {
    if (!this.findActive) return;
    this.findActive = null;
    this.notify();
    this.dispatchFindChanged();
  },

  findRefresh() {
    this.__findKey = null;
    this.notify();
    this.dispatchFindChanged();
  },

  dispatchFindChanged() {
    this.dispatch('findChanged', {
      findSearchValue: this.gos.findSearchValue,
      activeMatch: this.findGetActiveMatch(),
      totalMatches: this.findGetTotalMatches(),
    });
  },

  // 셀 텍스트를 매치/비매치 조각으로 분리 (렌더용). 매치 없으면 null
  findGetParts(node, column, text) {
    const value = this.gos.findSearchValue;
    if (value == null || value === '' || !text) return null;
    const cs = !!this.gos.findOptions?.caseSensitive;
    const hay = cs ? text : text.toLowerCase();
    const needle = cs ? String(value) : String(value).toLowerCase();
    let p = hay.indexOf(needle);
    if (p < 0) return null;
    const a = this.findActive;
    const activeHere = a && a.node === node && a.column === column ? a.numInMatch : 0;
    const parts = [];
    let last = 0;
    let k = 0;
    while (p >= 0) {
      if (p > last) parts.push({ value: text.slice(last, p) });
      k++;
      parts.push({ value: text.slice(p, p + needle.length), match: true, activeMatch: k === activeHere });
      last = p + needle.length;
      p = hay.indexOf(needle, last);
    }
    if (last < text.length) parts.push({ value: text.slice(last) });
    return parts;
  },

  findGetNumMatches({ node, column }) {
    return this.findMatches().filter(m => m.node === node && m.column === this.getColumn(column)).length;
  },
};
