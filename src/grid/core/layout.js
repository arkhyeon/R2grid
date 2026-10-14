// 페이지네이션·스크롤·자동 너비
//  GridCore.prototype 에 합쳐짐 (this = GridCore)
import { RowNode } from './RowNode.js';
import { clamp } from './utils.js';

export const layoutMethods = {
  // ── 페이지네이션 ─────────────────────────────────────────
  paginationGoToPage(page) {
    if (!this.gos.pagination) return;
    const target = clamp(page, 0, Math.max(0, this.totalPages - 1));
    if (target === this.currentPage) return;
    this.currentPage = target;
    this.updatePagination();
    this.computeRowTops();
    this.viewport?.setScrollTop?.(0);
    this.notify();
    this.dispatch('paginationChanged', {
      newData: false,
      newPage: true,
      newPageSize: false,
      keepRenderedRows: false,
      animate: false,
    });
  },

  // ── 스크롤 ───────────────────────────────────────────────
  ensureIndexVisible(index, position) {
    if (index == null || index < 0 || index >= this.displayedNodes.length) return;
    if (this.gos.pagination && (index < this.pageFirstRow || index >= this.pageLastRow)) {
      // index 가 속한 페이지 단위 찾기 (단위 시작 rowIndex 중 index 이하 최댓값)
      const units = this.getPageUnitStarts();
      let unit = index;
      if (units) {
        let lo = 0;
        let hi = units.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (units[mid] <= index) lo = mid;
          else hi = mid - 1;
        }
        unit = lo;
      }
      this.paginationGoToPage(Math.floor(unit / this.getPageSize()));
    }
    const vp = this.viewport;
    if (!vp) {
      this.pendingScroll = { index, position };
      return;
    }
    const i = index - this.pageFirstRow;
    const top = this.rowTopAt(i);
    const h = this.rowHeightAt(i);
    const vh = vp.getClientHeight();
    const cur = vp.getScrollTop();
    let target = null;
    if (position === 'top') target = top;
    else if (position === 'bottom') target = top + h - vh;
    else if (position === 'middle') target = top - vh / 2 + h / 2;
    else if (top < cur) target = top;
    else if (top + h > cur + vh) target = top + h - vh;
    if (target != null) vp.setScrollTop(Math.max(0, target));
  },

  ensureNodeVisible(nodeOrData, position) {
    let node = null;
    if (typeof nodeOrData === 'function') {
      node = this.displayedNodes.find(n => !n.detail && nodeOrData(n));
    } else if (nodeOrData instanceof RowNode) node = nodeOrData;
    else if (nodeOrData) node = this.rootNodes.find(n => n.data === nodeOrData) || null;
    if (node && node.rowIndex != null) this.ensureIndexVisible(node.rowIndex, position);
  },

  ensureColumnVisible(key, position = 'auto') {
    const col = this.getColumn(key);
    const vp = this.viewport;
    if (!col || !vp || col.pinned || !col.visible) return;
    const vw = vp.getCenterWidth();
    const cur = vp.getScrollLeft();
    const l = col.left;
    const r = col.left + col.actualWidth;
    let target = null;
    if (position === 'start') target = l;
    else if (position === 'end') target = r - vw;
    else if (position === 'middle') target = l - vw / 2 + col.actualWidth / 2;
    else if (l < cur) target = l;
    else if (r > cur + vw) target = r - vw;
    if (target != null) vp.setScrollLeft(Math.max(0, target));
  },

  getRenderedNodes() {
    const { first, last } = this.renderedRange;
    const out = [];
    if (first < 0) return out;
    for (let i = first; i <= last; i++) {
      const n = this.displayedNodes[i];
      if (n) out.push(n);
    }
    return out;
  },

  // ── 자동 폭 ──────────────────────────────────────────────
  autoSizeColumns(keys, skipHeader) {
    const root = this.eRoot;
    if (!root) return;
    const cols = keys ? this.getColumnsFromKeys(keys) : this.displayedColumns.filter(c => !c.isAuto);
    const skip = skipHeader ?? !!this.gos.skipHeaderOnAutoSize;
    const range = this.getDocument().createRange();
    const measure = el => {
      range.selectNodeContents(el);
      const w = range.getBoundingClientRect().width;
      const cs = getComputedStyle(el);
      return w + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2 + (this.gos.autoSizePadding ?? 0);
    };
    const resized = [];
    cols.forEach(col => {
      if (col.colDef.suppressAutoSize) return;
      const sel = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(col.colId) : col.colId;
      let max = 0;
      root.querySelectorAll(`.r2-cell[col-id="${sel}"]`).forEach(cell => {
        max = Math.max(max, measure(cell));
      });
      if (!skip) {
        const label = root.querySelector(`.r2-header-cell[col-id="${sel}"] .r2-header-cell-label`);
        const hcell = root.querySelector(`.r2-header-cell[col-id="${sel}"]`);
        if (label && hcell) {
          range.selectNodeContents(label);
          const cs = getComputedStyle(hcell);
          const extra = hcell.querySelector('.r2-header-cell-menu-button') ? 24 : 0;
          max = Math.max(max, range.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + extra + 16);
        }
      }
      if (max > 0) {
        let w = Math.ceil(max);
        w = Math.max(col.minWidth, w);
        if (col.maxWidth) w = Math.min(col.maxWidth, w);
        col.width = w;
        col.flex = null;
        resized.push(col);
      }
    });
    range.detach?.();
    if (!resized.length) return;
    this.afterColumnLayoutChange();
    this.dispatch('columnResized', {
      columns: resized,
      column: resized.length === 1 ? resized[0] : null,
      finished: true,
      source: 'autosizeColumns',
    });
  },

  sizeColumnsToFit(arg) {
    const params = typeof arg === 'object' && arg ? arg : {};
    const avail = typeof arg === 'number' ? arg : this.bodyWidth;
    if (!avail) return;
    const limits = new Map((params.columnLimits || []).map(l => [this.getColumn(l.key)?.colId, l]));
    const cols = this.displayedColumns;
    const fit = cols.filter(c => !c.colDef.suppressSizeToFit);
    const fixedW = cols.filter(c => c.colDef.suppressSizeToFit).reduce((s, c) => s + c.actualWidth, 0);
    const minOf = c => limits.get(c.colId)?.minWidth ?? params.defaultMinWidth ?? c.minWidth;
    const maxOf = c => limits.get(c.colId)?.maxWidth ?? params.defaultMaxWidth ?? c.maxWidth;
    let remaining = [...fit];
    const done = new Map();
    let again = true;
    while (again && remaining.length) {
      again = false;
      const space = avail - fixedW - [...done.values()].reduce((s, w) => s + w, 0);
      const cur = remaining.reduce((s, c) => s + c.actualWidth, 0) || 1;
      const scale = space / cur;
      for (const c of remaining) {
        const w = c.actualWidth * scale;
        const mn = minOf(c);
        const mx = maxOf(c);
        if (w < mn) {
          done.set(c, mn);
          remaining = remaining.filter(x => x !== c);
          again = true;
          break;
        }
        if (mx && w > mx) {
          done.set(c, mx);
          remaining = remaining.filter(x => x !== c);
          again = true;
          break;
        }
      }
    }
    done.forEach((w, c) => {
      c.width = w;
      c.flex = null;
    });
    const space = avail - fixedW - [...done.values()].reduce((s, w) => s + w, 0);
    const cur = remaining.reduce((s, c) => s + c.actualWidth, 0) || 1;
    let used = 0;
    remaining.forEach((c, i) => {
      const w = i === remaining.length - 1 ? Math.round(space - used) : Math.floor((c.actualWidth * space) / cur);
      c.width = Math.max(minOf(c), w);
      c.flex = null;
      used += c.width;
    });
    this.afterColumnLayoutChange();
    this.dispatch('columnResized', { columns: fit, column: null, finished: true, source: 'sizeColumnsToFit' });
  },

  // 화면 행 키(row-index 속성: 'n' | 't-n' | 'b-n') → 노드
  nodeFromRowKey(key) {
    if (key == null) return null;
    const m = /^([tb])-(\d+)$/.exec(key);
    if (m) return (m[1] === 't' ? this.pinnedTop : this.pinnedBottom)[+m[2]] || null;
    return this.displayedNodes[+key] || null;
  },
};
