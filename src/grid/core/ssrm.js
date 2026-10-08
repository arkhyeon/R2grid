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
    // 선택은 id 기준 상태(selectAll + toggled)로 유지 → 다시 로드돼도 선택이 살아남음. 로드된 노드 맵만 비움
    this.ssrmSel ||= { selectAll: false, toggled: new Set() };
    this.selected = new Map();
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
    st.blocks.set(bi, { state: 'loaded' });
    st.lru = st.lru.filter(x => x !== bi);
    st.lru.push(bi);
    this.ssrmWriteRows(bi * this.ssrmBlockSize(), rows, rowCount, bi);
    // 로딩 중이라 미뤄둔 비동기 트랜잭션
    if (this.ssrmTxQueue?.length && !this.ssrmIsLoading()) this.flushServerSideAsyncTransactions();
  },

  ssrmRowId(data, idx) {
    const getRowId = this.gos.getRowId;
    return typeof getRowId === 'function'
      ? String(getRowId({ data, level: 0, parentKeys: [], api: this.api, context: this.gos.context }))
      : String(idx);
  },

  // 선택 상태(selectAll XOR toggled)를 로드된 노드에 반영
  ssrmApplySelection(node) {
    const sel = this.ssrmSel;
    if (!sel) return false;
    const want = !!node.selectable && sel.selectAll !== sel.toggled.has(node.id);
    const changed = node.selected !== want;
    node.selected = want;
    if (want) this.selected.set(node.id, node);
    else this.selected.delete(node.id);
    return changed;
  },

  ssrmWriteRows(start, rows, rowCount, bi) {
    const st = this.ssrm;
    const bs = this.ssrmBlockSize();
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
    rows.forEach((data, i) => {
      const idx = start + i;
      if (idx >= this.displayedNodes.length) return;
      const id = this.ssrmRowId(data, idx);
      const prev = this.nodeById.get(id);
      const node = prev || new RowNode(this, data, id);
      if (prev && prev.data !== data) prev.__version++;
      node.data = data;
      node.rowIndex = idx;
      node.displayed = true;
      this.updateSelectable(node);
      this.ssrmApplySelection(node);
      this.nodeById.set(id, node);
      this.displayedNodes[idx] = node;
    });
    if (bi != null) this.ssrmEvictBlocks(bi);
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
        if (n && !n.stub) {
          this.nodeById.delete(n.id);
          this.selected.delete(n.id);
        }
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

  ssrmIsLoading() {
    return !!this.ssrm && [...this.ssrm.blocks.values()].some(b => b.state === 'loading');
  },

  // 블록 다시 계산: 전부 실제 행인 블록만 '로드됨', 나머지는 보일 때 다시 요청
  ssrmRebuildBlocks() {
    const st = this.ssrm;
    const nodes = this.displayedNodes;
    const bs = this.ssrmBlockSize();
    const blocks = new Map();
    for (let b = 0; b * bs < nodes.length; b++) {
      const prev = st.blocks.get(b);
      if (prev && prev.state !== 'loaded') {
        blocks.set(b, prev);
        continue;
      }
      let full = true;
      for (let i = b * bs; i < Math.min((b + 1) * bs, nodes.length); i++) {
        if (nodes[i].stub) {
          full = false;
          break;
        }
      }
      if (full) blocks.set(b, { state: 'loaded' });
    }
    st.blocks = blocks;
    st.lru = st.lru.filter(b => blocks.get(b)?.state === 'loaded');
    for (const [b, x] of blocks) if (x.state === 'loaded' && !st.lru.includes(b)) st.lru.push(b);
  },

  // ── SSRM 트랜잭션 (AG applyServerSideTransaction) ──
  // 평면 SSRM: 로드된 행에만 적용 (안 보인 행은 서버가 이미 반영했다고 보고 다음 로드에 받음). update/remove 는 getRowId 권장.
  //  - 로딩 중이면 적용 안 하고 status 'StoreLoading' (Async 판은 로드 끝난 뒤 적용)
  applyServerSideTransaction(tx = {}) {
    if (this.gos.rowModelType !== 'serverSide') return undefined;
    if (!this.ssrm || tx.route?.length) return { status: 'StoreNotFound' };
    if (this.ssrmIsLoading()) return { status: 'StoreLoading' };
    const nodes = this.displayedNodes;
    const res = { status: 'Applied', add: [], update: [], remove: [] };
    const hasId = typeof this.gos.getRowId === 'function';
    const findNode = d => (hasId ? this.nodeById.get(this.ssrmRowId(d)) : this.rootNodes.find(n => n.data === d)) || null;
    let selChanged = false;
    if (tx.remove?.length) {
      const gone = new Set(tx.remove.map(findNode).filter(Boolean));
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!gone.has(n)) continue;
        nodes.splice(i, 1);
        this.nodeById.delete(n.id);
        if (this.selected.delete(n.id)) selChanged = true;
        this.ssrmSel?.toggled.delete(n.id);
        res.remove.push(n);
      }
    }
    for (const d of tx.update || []) {
      const n = findNode(d);
      if (!n) continue;
      const before = this.flashCandidates(n);
      n.data = d;
      n.__version++;
      n.__quickFilterText = null;
      this.updateSelectable(n);
      if (this.ssrmApplySelection(n)) selChanged = true;
      this.flashChangedCells(n, before);
      res.update.push(n);
    }
    if (tx.add?.length) {
      const at = Math.max(0, Math.min(tx.addIndex ?? nodes.length, nodes.length));
      const added = tx.add.map(d => {
        const n = new RowNode(this, d, hasId ? this.ssrmRowId(d) : `ssrm-add-${(this.ssrmAddSeq = (this.ssrmAddSeq || 0) + 1)}`);
        n.displayed = true;
        this.updateSelectable(n);
        if (this.ssrmApplySelection(n)) selChanged = true;
        this.nodeById.set(n.id, n);
        res.add.push(n);
        return n;
      });
      nodes.splice(at, 0, ...added);
    }
    if (!res.add.length && !res.update.length && !res.remove.length) return res;
    // 행 위치가 밀렸으므로 행 수·블록 다시 계산
    this.ssrm.rowCount = nodes.length;
    nodes.forEach((n, i) => (n.rowIndex = i));
    this.ssrmRebuildBlocks();
    this.rootNodes = nodes.filter(n => !n.stub);
    this.ssrmRefreshView();
    this.dispatch('modelUpdated', { newData: false, newPage: false, keepRenderedRows: true, animate: false });
    if (selChanged) this.dispatch('selectionChanged', { source: 'rowDataChanged', selectedNodes: this.getSelectedNodes() });
    return res;
  },

  applyServerSideTransactionAsync(tx, callback) {
    if (this.gos.rowModelType !== 'serverSide') return;
    (this.ssrmTxQueue ||= []).push({ tx, callback });
    if (this.ssrmTxTimer) return;
    this.ssrmTxTimer = this.setTimer(() => {
      this.ssrmTxTimer = null;
      this.flushServerSideAsyncTransactions();
    }, this.gos.asyncTransactionWaitMillis ?? 50);
  },

  // 로딩 중이면 미룸 → 블록 로드가 끝나면 자동으로 다시 시도
  flushServerSideAsyncTransactions() {
    const q = this.ssrmTxQueue || [];
    if (!q.length || this.ssrmIsLoading()) return;
    this.ssrmTxQueue = [];
    const results = q.map(({ tx, callback }) => {
      const r = this.applyServerSideTransaction(tx);
      callback?.(r);
      return r;
    });
    this.dispatch('asyncTransactionsFlushed', { results });
  },

  // 서버 요청 없이 행 직접 넣기 (AG applyServerSideRowData)
  applyServerSideRowData({ successParams, startRow = 0, route } = {}) {
    if (this.gos.rowModelType !== 'serverSide' || route?.length) return;
    if (!this.ssrm) this.ssrmReset('rowData');
    const rows = successParams?.rowData || [];
    this.ssrmWriteRows(startRow, rows, successParams?.rowCount);
    this.ssrmRebuildBlocks();
    this.rootNodes = this.displayedNodes.filter(n => !n.stub);
    this.rowDataSet = true;
    this.ssrmRefreshView();
  },

  // ── SSRM 선택 상태 (AG getServerSideSelectionState) ──
  // { selectAll, toggledNodes }: selectAll=true 면 toggledNodes 는 '선택 해제된' id, false 면 '선택된' id. 안 불러온 행도 포함
  getServerSideSelectionState() {
    if (!this.isSsrm()) return null;
    const sel = this.ssrmSel || { selectAll: false, toggled: new Set() };
    return { selectAll: sel.selectAll, toggledNodes: [...sel.toggled] };
  },

  setServerSideSelectionState(state, source = 'api') {
    if (!this.isSsrm()) return;
    this.ssrmSel = { selectAll: !!state?.selectAll, toggled: new Set((state?.toggledNodes || []).map(String)) };
    const changed = [];
    for (const n of this.displayedNodes) if (!n.stub && this.ssrmApplySelection(n)) changed.push(n);
    this.afterSelectionChange(changed, source, undefined, true);
  },

  // 선택 변경 후 id 상태 동기화 (afterSelectionChange 에서 호출)
  ssrmSyncSelection(changed) {
    const sel = this.ssrmSel;
    if (!sel) return;
    if (this.rsOpts?.mode === 'singleRow') {
      sel.selectAll = false;
      sel.toggled = new Set(this.selected.keys());
      return;
    }
    for (const n of changed) {
      if (n.selected !== sel.selectAll) sel.toggled.add(n.id);
      else sel.toggled.delete(n.id);
    }
  },

  retryServerSideLoads() {
    if (!this.ssrm) return;
    for (const [bi, b] of [...this.ssrm.blocks]) if (b.state === 'failed') this.ssrm.blocks.delete(bi);
    this.notify();
  },
};
