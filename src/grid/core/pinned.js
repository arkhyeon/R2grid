// 상단/하단 고정 행 (pinnedTopRowData / pinnedBottomRowData)
import { RowNode } from './RowNode.js';

export const pinnedMethods = {
  buildPinnedRows() {
    const mk = (arr, pos) =>
      (arr || []).map((data, i) => {
        const prev = (pos === 'top' ? this.pinnedTop : this.pinnedBottom)?.[i];
        const n = prev && prev.data === data ? prev : new RowNode(this, data, `${pos === 'top' ? 't' : 'b'}-${i}`);
        n.rowPinned = pos;
        n.rowIndex = i;
        n.displayed = true;
        n.selectable = false;
        return n;
      });
    this.pinnedTopUser = mk(this.gos.pinnedTopRowData, 'top');
    this.pinnedBottomUser = mk(this.gos.pinnedBottomRowData, 'bottom');
    this.mergePinnedRows();
  },

  // 사용자 고정 행 + 수동 고정 행(enableRowPinning) + grandTotalRow: 'pinnedTop' | 'pinnedBottom'
  mergePinnedRows() {
    const grand = this.isGroupMode?.() ? this.grandTotalPinned : null;
    const top = [...(this.pinnedTopUser || []), ...this.manualPinnedClones('top')];
    const bottom = [...(this.pinnedBottomUser || []), ...this.manualPinnedClones('bottom')];
    if (grand?.rowPinned === 'top') top.push(grand);
    if (grand?.rowPinned === 'bottom') bottom.push(grand);
    top.forEach((n, i) => {
      n.rowIndex = i;
      n.displayed = true;
    });
    bottom.forEach((n, i) => {
      n.rowIndex = i;
      n.displayed = true;
    });
    this.pinnedTop = top;
    this.pinnedBottom = bottom;
  },

  // ── 수동 행 고정 (enableRowPinning: true | 'top' | 'bottom') ─────────────
  // 원본 행은 본문에 그대로 두고, 같은 data 를 쓰는 복제 노드를 고정 영역에 둔다 (서로 pinnedSibling 으로 연결).
  // 고정 목록은 원본 행 id 로 보관 → 정렬·필터·데이터 갱신(getRowId)에도 유지, 원본이 사라지면 같이 빠진다.
  rowPinningAllowed(pos) {
    const v = this.gos.enableRowPinning;
    return !!v && (v === true || v === pos);
  },

  pinnedSourceOf(node) {
    return node?.manualPinned ? node.pinnedSibling : node;
  },

  isRowPinnableNode(node) {
    const src = this.pinnedSourceOf(node);
    if (!src || src.rowPinned || src.group || src.footer || src.stub || src.detail || !src.data) return false;
    if (this.nodeById.get(src.id) !== src) return false;
    const fn = this.gos.isRowPinnable;
    return typeof fn === 'function' ? fn(src) !== false : true;
  },

  manualPinPosition(node) {
    const src = this.pinnedSourceOf(node);
    if (!src || !this.manualPins) return null;
    if (this.manualPins.top.includes(src.id)) return 'top';
    if (this.manualPins.bottom.includes(src.id)) return 'bottom';
    return null;
  },

  pinRowManual(node, pos, source = 'api') {
    const src = this.pinnedSourceOf(node);
    if (!src || src.rowPinned) return false;
    pos = pos === 'top' || pos === 'bottom' ? pos : null;
    if (pos && (!this.rowPinningAllowed(pos) || !this.isRowPinnableNode(src))) return false;
    if (this.manualPinPosition(src) === pos) return false;
    const m = (this.manualPins ||= { top: [], bottom: [] });
    m.top = m.top.filter(id => id !== src.id);
    m.bottom = m.bottom.filter(id => id !== src.id);
    if (pos) m[pos].push(src.id);
    this.afterManualPinsChange(source);
    return true;
  },

  setManualPins({ top = [], bottom = [] } = {}, source = 'api') {
    const ok = pos => id => this.rowPinningAllowed(pos) && this.isRowPinnableNode(this.nodeById.get(String(id)));
    const t = [...new Set(top.map(String))].filter(ok('top'));
    const b = [...new Set(bottom.map(String))].filter(id => !t.includes(id)).filter(ok('bottom'));
    this.manualPins = { top: t, bottom: b };
    this.afterManualPinsChange(source);
  },

  afterManualPinsChange(source) {
    if (this.focus?.rowPinned) this.focus = null;
    this.mergePinnedRows();
    this.notify();
    this.dispatch('pinnedRowsChanged', { source });
  },

  // isRowPinned 콜백으로 초기 고정 (rowData 설정·트랜잭션 추가 시). reset=true 면 기존 고정 해제 (getRowId 없는 전체 교체)
  initRowPinning(nodes, reset) {
    if (reset || !this.manualPins) this.manualPins = { top: [], bottom: [] };
    const fn = this.gos.isRowPinned;
    if (typeof fn !== 'function' || !this.gos.enableRowPinning) return;
    for (const n of nodes) {
      if (this.manualPinPosition(n)) continue;
      const pos = fn(n);
      if ((pos === 'top' || pos === 'bottom') && this.rowPinningAllowed(pos) && this.isRowPinnableNode(n)) this.manualPins[pos].push(n.id);
    }
  },

  manualPinnedClones(pos) {
    const m = this.manualPins;
    if (!m) return [];
    const cache = (this.manualCloneCache ||= new Map());
    // 원본이 사라진 id 는 목록에서도 정리
    m[pos] = m[pos].filter(id => this.nodeById.get(id)?.data);
    const out = m[pos].map(id => {
      const src = this.nodeById.get(id);
      const key = `${pos}:${id}`;
      let c = cache.get(key);
      if (!c || c.pinnedSibling !== src) {
        c = new RowNode(this, src.data, `${pos === 'top' ? 't' : 'b'}-${id}`);
        c.manualPinned = true;
        c.selectable = false;
        cache.set(key, c);
      }
      if (c.data !== src.data) {
        c.data = src.data;
        c.__version++;
      }
      c.pinnedSibling = src;
      c.rowPinned = pos;
      src.pinnedSibling = c;
      return c;
    });
    // 고정 해제된 원본의 연결 끊기
    for (const [key, c] of cache) {
      if (key.startsWith(`${pos}:`) && !out.includes(c)) {
        if (c.pinnedSibling?.pinnedSibling === c) c.pinnedSibling.pinnedSibling = undefined;
        cache.delete(key);
      }
    }
    return out;
  },

  pinnedRowHeight(node) {
    const fn = this.gos.getRowHeight;
    if (typeof fn === 'function') {
      const h = fn({ node, data: node.data, api: this.api, context: this.gos.context });
      if (h != null) return h;
    }
    return node.__autoHeight ?? this.getDefaultRowHeight();
  },

  pinnedTotalHeight(pos) {
    const list = pos === 'top' ? this.pinnedTop : this.pinnedBottom;
    let h = 0;
    for (const n of list) {
      n.rowTop = h;
      n.rowHeight = this.pinnedRowHeight(n);
      h += n.rowHeight;
    }
    return h;
  },

  // 포커스 대상 노드 (고정 행 포함)
  getFocusNode() {
    const f = this.focus;
    if (!f) return null;
    if (f.rowPinned === 'top') return this.pinnedTop[f.rowIndex] || null;
    if (f.rowPinned === 'bottom') return this.pinnedBottom[f.rowIndex] || null;
    return this.displayedNodes[f.rowIndex] || null;
  },

  focusPinned(pos, rowIndex, colId) {
    this.focus = { rowIndex, colId, rowPinned: pos };
    this.ranges = [];
    this.ensureColumnVisible(colId);
    this.notify();
    this.dispatch('cellFocused', {
      rowIndex,
      column: this.getColumn(colId),
      rowPinned: pos,
      forceBrowserFocus: true,
      isFullWidthCell: false,
      floating: pos,
    });
  },
};
