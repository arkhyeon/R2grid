// Server-Side Row Model (rowModelType: 'serverSide') — AG 부분 스토어(partial store) 동작
// Infinite Row Model (rowModelType: 'infinite') 도 같은 블록 엔진 사용: datasource.getRows({ startRow, endRow, sortModel, filterModel, successCallback, failCallback })
//  - cacheBlockSize 단위 블록을 화면에 보일 때 getRows 로 요청
//  - success({ rowData, rowCount }) / fail()  (레거시 successCallback(rows, lastRow) / failCallback 도 지원)
//  - 정렬/필터 변경 시 캐시 비우고 서버 재요청
import { RowNode } from './RowNode.js';

export const ssrmMethods = {
  // 블록 지연 로딩 모델 (serverSide | infinite)
  isSsrm() {
    const t = this.gos.rowModelType;
    return t === 'serverSide' || t === 'infinite';
  },

  isInfinite() {
    return this.gos.rowModelType === 'infinite';
  },

  ssrmDatasource() {
    return this.isInfinite() ? this.gos.datasource : this.gos.serverSideDatasource;
  },

  ssrmBlockSize() {
    return this.gos.cacheBlockSize ?? 100;
  },

  makeStub(index) {
    const n = new RowNode(this, undefined, `stub-${index}`);
    n.stub = true;
    n.selectable = false;
    n.rowIndex = index;
    n.displayed = true;
    return n;
  },

  ssrmReset(reason = 'reset') {
    const prevVersion = this.ssrm?.version ?? 0;
    this.ssrm = {
      version: prevVersion + 1,
      blocks: new Map(),
      rowCount: (this.isInfinite() ? this.gos.infiniteInitialRowCount : this.gos.serverSideInitialRowCount) ?? 1,
      lru: [],
      lastRowKnown: false,
    };
    this.rootNodes = [];
    this.nodeById = new Map();
    this.ssrmResizeTo(this.ssrm.rowCount);
    this.rowDataSet = false;
    this.ssrmRefreshView(reason);
  },

  ssrmResizeTo(count) {
    const cur = this.displayedNodes;
    if (cur.length > count) cur.length = count;
    for (let i = cur.length; i < count; i++) cur.push(this.makeStub(i));
    for (let i = 0; i < cur.length; i++) cur[i].rowIndex = i;
  },

  ssrmRefreshView() {
    this.sortedNodes = this.displayedNodes;
    this.filteredNodes = this.rootNodes;
    this.updatePagination();
    this.computeRowTops();
    this.clampFocusAndRanges();
    this.notify();
  },

  ssrmBuildRequest(startRow, endRow) {
    const sortModel = this.allColumns
      .filter(c => c.sort)
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      .map(c => ({ colId: c.colId, sort: c.sort }));
    return {
      startRow,
      endRow,
      rowGroupCols: [],
      valueCols: [],
      pivotCols: [],
      pivotMode: false,
      groupKeys: [],
      filterModel: this.getFilterModel(),
      sortModel,
    };
  },

  // 화면에 보이는 stub 행이 속한 블록 로드
  ssrmEnsureRows(first, last) {
    if (!this.isSsrm() || !this.ssrm) return;
    const ds = this.ssrmDatasource();
    if (!ds || typeof ds.getRows !== 'function') return;
    const bs = this.ssrmBlockSize();
    const b0 = Math.floor(first / bs);
    const b1 = Math.floor(last / bs);
    for (let b = b0; b <= b1; b++) this.ssrmLoadBlock(b);
  },

  ssrmLoadBlock(bi) {
    const st = this.ssrm;
    if (st.blocks.has(bi)) return;
    const bs = this.ssrmBlockSize();
    const startRow = bi * bs;
    if (st.lastRowKnown && startRow >= st.rowCount) return;
    st.blocks.set(bi, { state: 'loading' });
    const version = st.version;
    let done = false;
    const success = ({ rowData, rowCount } = {}) => {
      if (done || version !== this.ssrm?.version || this.destroyed) return;
      done = true;
      this.ssrmOnLoaded(bi, rowData || [], rowCount);
    };
    const fail = () => {
      if (done || version !== this.ssrm?.version) return;
      done = true;
      st.blocks.set(bi, { state: 'failed' });
      this.notify();
    };
    const req = this.ssrmBuildRequest(startRow, startRow + bs);
    const params = this.isInfinite()
      ? {
          startRow: req.startRow,
          endRow: req.endRow,
          sortModel: req.sortModel,
          filterModel: req.filterModel,
          context: this.gos.context,
          successCallback: (rows, lastRow) => success({ rowData: rows, rowCount: lastRow != null && lastRow >= 0 ? lastRow : undefined }),
          failCallback: fail,
        }
      : {
      request: req,
      parentNode: { level: -1, id: 'ROOT_NODE_ID', group: true, childStore: null },
      api: this.api,
      context: this.gos.context,
      success,
      fail,
      successCallback: (rows, lastRow) => success({ rowData: rows, rowCount: lastRow != null && lastRow >= 0 ? lastRow : undefined }),
      failCallback: fail,
    };
    // AG 처럼 비동기로 호출 (렌더 중 setState 방지)
    Promise.resolve().then(() => {
      if (version !== this.ssrm?.version || this.destroyed) return;
      this.ssrmDatasource()?.getRows(params);
    });
  },

  ssrmOnLoaded(bi, rows, rowCount) {
    const st = this.ssrm;
    const bs = this.ssrmBlockSize();
    const start = bi * bs;
    st.blocks.set(bi, { state: 'loaded' });
    st.lru = st.lru.filter(x => x !== bi);
    st.lru.push(bi);
    if (rowCount != null && rowCount >= 0) {
      st.rowCount = rowCount;
      st.lastRowKnown = true;
    } else if (rows.length < bs) {
      st.rowCount = start + rows.length;
      st.lastRowKnown = true;
    } else if (!st.lastRowKnown) {
      st.rowCount = Math.max(st.rowCount, start + rows.length + (this.gos.cacheOverflowSize ?? 1));
    }
    this.ssrmResizeTo(st.rowCount);
    const getRowId = this.gos.getRowId;
    rows.forEach((data, i) => {
      const idx = start + i;
      if (idx >= this.displayedNodes.length) return;
      const id = typeof getRowId === 'function'
        ? String(getRowId({ data, level: 0, parentKeys: [], api: this.api, context: this.gos.context }))
        : String(idx);
      const prev = this.nodeById.get(id);
      const node = prev || new RowNode(this, data, id);
      node.data = data;
      node.rowIndex = idx;
      node.displayed = true;
      this.updateSelectable(node);
      this.nodeById.set(id, node);
      this.displayedNodes[idx] = node;
    });
    this.ssrmEvictBlocks(bi);
    this.rootNodes = this.displayedNodes.filter(n => !n.stub);
    this.rowDataSet = true;
    if (this.rootNodes.length) this.inferDataTypes();
    this.ssrmRefreshView();
    this.dispatch('modelUpdated', { newData: false, newPage: false, keepRenderedRows: true, animate: false });
    this.dispatch('storeUpdated', {});
  },

  // maxBlocksInCache 초과 시 오래 안 쓴 블록을 stub 으로 되돌림 (AG 동일)
  ssrmEvictBlocks(keepBi) {
    const max = this.gos.maxBlocksInCache;
    const st = this.ssrm;
    if (!max || max < 1) return;
    const bs = this.ssrmBlockSize();
    while (st.lru.length > max) {
      const victim = st.lru.find(b => b !== keepBi);
      if (victim == null) break;
      st.lru = st.lru.filter(b => b !== victim);
      st.blocks.delete(victim);
      for (let i = victim * bs; i < Math.min((victim + 1) * bs, this.displayedNodes.length); i++) {
        const n = this.displayedNodes[i];
        if (n && !n.stub) this.nodeById.delete(n.id);
        this.displayedNodes[i] = this.makeStub(i);
      }
    }
  },

  // ── Infinite 전용 api ──
  purgeInfiniteCache() {
    if (this.isInfinite()) this.ssrmReset('purge');
  },

  refreshInfiniteCache() {
    if (!this.isInfinite() || !this.ssrm) return;
    this.ssrm.version++;
    this.ssrm.blocks.clear();
    this.ssrm.lru = [];
    this.notify();
  },

  setInfiniteRowCount(count, lastRowIndexKnown) {
    if (!this.ssrm) return;
    this.ssrm.rowCount = count;
    if (lastRowIndexKnown != null) this.ssrm.lastRowKnown = !!lastRowIndexKnown;
    this.ssrmResizeTo(count);
    this.ssrmRefreshView();
  },

  getCacheBlockState() {
    const out = {};
    if (!this.ssrm) return out;
    const bs = this.ssrmBlockSize();
    for (const [bi, b] of this.ssrm.blocks) {
      out[bi] = { blockNumber: bi, startRow: bi * bs, endRow: (bi + 1) * bs, pageStatus: b.state };
    }
    return out;
  },

  refreshServerSide(params = {}) {
    if (!this.isSsrm()) return;
    if (params.purge || !this.ssrm) {
      this.ssrmReset('refresh');
      return;
    }
    // purge 없이: 로드된 블록을 다시 요청 (기존 행 유지)
    this.ssrm.version++;
    this.ssrm.blocks.clear();
    this.notify();
  },

  retryServerSideLoads() {
    if (!this.ssrm) return;
    for (const [bi, b] of [...this.ssrm.blocks]) if (b.state === 'failed') this.ssrm.blocks.delete(bi);
    this.notify();
  },
};
