// Server-Side Row Model (rowModelType: 'serverSide') — 부분 스토어(partial store) 동작
// Infinite Row Model (rowModelType: 'infinite') 도 같은 블록 엔진 사용: datasource.getRows({ startRow, endRow, sortModel, filterModel, successCallback, failCallback })
//  - cacheBlockSize 단위 블록을 화면에 보일 때 getRows 로 요청
//  - success({ rowData, rowCount }) / fail()  (레거시 successCallback(rows, lastRow) / failCallback 도 지원)
//  - 정렬/필터 변경 시 캐시 비우고 서버 재요청
//  - 서버 그룹: 행 그룹 컬럼이 있으면 단계마다 그룹 행을 받고, 그룹을 펼치면 그 그룹의 스토어(route = 그룹 키 경로)를 따로 요청
//    request.groupKeys = route, request.rowGroupCols / valueCols. 트리(treeData + isServerSideGroup + getServerSideGroupKey)도 같은 구조
//  스토어 = { route, level, parentNode, nodes(행 또는 stub), blocks, rowCount, lastRowKnown, lru, version }
//  this.ssrm 은 최상위 스토어 (+ stores: route 키 → 스토어)
import { RowNode } from './RowNode.js';
import { getFieldValue } from './utils.js';

const routeKey = route => (route.length ? JSON.stringify(route) : 'ROOT');

export const ssrmMethods = {
  // 블록 지연 로딩 모델 (serverSide | infinite)
  isSsrm() {
    const t = this.gos.rowModelType;
    return t === 'serverSide' || t === 'infinite';
  },

  isInfinite() {
    return this.gos.rowModelType === 'infinite';
  },

  // 서버 그룹 / 서버 트리 사용 중
  isServerGrouping() {
    return this.gos.rowModelType === 'serverSide' && (this.isServerTree() || this.rowGroupColumns().length > 0);
  },

  isServerTree() {
    return this.gos.rowModelType === 'serverSide' && !!this.gos.treeData && typeof this.gos.isServerSideGroup === 'function';
  },

  ssrmDatasource() {
    return this.isInfinite() ? this.gos.datasource : this.gos.serverSideDatasource;
  },

  ssrmBlockSize() {
    return this.gos.cacheBlockSize ?? 100;
  },

  ssrmInitialRowCount() {
    return (this.isInfinite() ? this.gos.infiniteInitialRowCount : this.gos.serverSideInitialRowCount) ?? 1;
  },

  makeStub(index, store = this.ssrm) {
    const n = new RowNode(this, undefined, `stub-${store?.id ?? 'ROOT'}-${index}`);
    n.stub = true;
    n.selectable = false;
    n.rowIndex = index;
    n.displayed = true;
    n.level = store?.level ?? 0;
    n.uiLevel = n.level;
    n.parent = store?.parentNode ?? null;
    n.__store = store;
    return n;
  },

  ssrmNewStore(route, parentNode) {
    const st = {
      id: routeKey(route),
      route,
      level: route.length,
      parentNode: parentNode || null,
      version: 1,
      blocks: new Map(),
      rowCount: this.ssrmInitialRowCount(),
      lastRowKnown: false,
      lru: [],
      nodes: [],
    };
    this.ssrmResizeStore(st, st.rowCount);
    return st;
  },

  ssrmReset(reason = 'reset') {
    // 그룹 기준이 바뀌면 펼침 기억도 의미가 없어짐
    const sig = this.rowGroupColumns().map(c => c.colId).join('|');
    if (sig !== this.ssrmGroupSig) {
      this.ssrmExpanded = new Set();
      // 그룹 경로가 바뀌면 그룹 선택 트리도 의미가 없어짐
      if (this.ssrmGroupSig !== undefined) this.ssrmSelTree = null;
    }
    this.ssrmGroupSig = sig;
    this.ssrmExpanded ||= new Set();
    const root = { ...this.ssrmNewStore([], null), stores: new Map(), modelSig: this.ssrmModelSig() };
    // 이전 루트를 참조하는 늦은 응답은 무시됨 (store 객체가 바뀜)
    root.nodes.forEach(n => (n.__store = root));
    root.stores.set(root.id, root);
    this.ssrm = root;
    this.rootNodes = [];
    this.nodeById = new Map();
    // 선택은 id 기준 상태(selectAll + toggled)로 유지 → 다시 로드돼도 선택이 살아남음. 로드된 노드 맵만 비움
    this.ssrmSel ||= { selectAll: false, toggled: new Set() };
    this.selected = new Map();
    this.rowDataSet = false;
    this.ssrmFlatten();
    this.ssrmRefreshView(reason);
  },

  // 요청 모양을 바꾸는 컬럼 상태 (행 그룹 · 값 컬럼 집계)
  ssrmModelSig() {
    if (this.isInfinite()) return '';
    return `${this.rowGroupColumns().map(c => c.colId).join('|')}/${this.valueColumns().map(c => `${c.colId}:${c.colDef.aggFunc}`).join('|')}`;
  },

  ssrmResizeStore(st, count) {
    const cur = st.nodes;
    if (cur.length > count) {
      for (let i = count; i < cur.length; i++) if (!cur[i].stub) this.ssrmForgetNode(cur[i]);
      cur.length = count;
    }
    for (let i = cur.length; i < count; i++) cur.push(this.makeStub(i, st));
  },

  // 화면 행 목록 = 루트 스토어 + 펼친 그룹의 하위 스토어 (깊이 우선)
  ssrmFlatten() {
    const root = this.ssrm;
    if (!root) return;
    let out;
    if (root.stores.size <= 1) {
      out = root.nodes;
      for (let i = 0; i < out.length; i++) out[i].__storeIndex = i;
    } else {
      out = [];
      const walk = st => {
        st.nodes.forEach((n, i) => {
          n.__storeIndex = i;
          out.push(n);
          if (n.__ssrmGroup && n.expanded && n.childStore) walk(n.childStore);
        });
      };
      walk(root);
    }
    for (let i = 0; i < out.length; i++) {
      out[i].rowIndex = i;
      out[i].displayed = true;
    }
    this.displayedNodes = out;
  },

  ssrmRefreshView() {
    this.sortedNodes = this.displayedNodes;
    this.filteredNodes = this.rootNodes;
    this.updatePagination();
    this.computeRowTops();
    this.clampFocusAndRanges();
    this.notify();
  },

  // 로드된 행 전체 (모든 스토어)
  ssrmForEachLoaded(cb) {
    for (const st of this.ssrm?.stores.values() || []) for (const n of st.nodes) if (!n.stub) cb(n, st);
  },

  ssrmRebuildRootNodes() {
    const out = [];
    this.ssrmForEachLoaded(n => out.push(n));
    this.rootNodes = out;
  },

  ssrmBuildRequest(startRow, endRow, store = this.ssrm) {
    const sortModel = this.allColumns
      .filter(c => c.sort)
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      .map(c => ({ colId: c.colId, sort: c.sort }));
    const colInfo = c => ({ id: c.colId, displayName: this.getDisplayName?.(c, true) ?? c.colId, field: c.colDef.field, aggFunc: typeof c.colDef.aggFunc === 'string' ? c.colDef.aggFunc : undefined });
    const tree = this.isServerTree();
    return {
      startRow,
      endRow,
      rowGroupCols: tree ? [] : this.rowGroupColumns().map(colInfo),
      valueCols: this.isInfinite() ? [] : this.valueColumns().map(colInfo),
      pivotCols: [],
      pivotMode: false,
      groupKeys: [...(store?.route || [])],
      filterModel: this.getFilterModel(),
      sortModel,
    };
  },

  // 화면에 보이는 stub 행이 속한 블록 로드 (스토어별)
  ssrmEnsureRows(first, last) {
    if (!this.isSsrm() || !this.ssrm) return;
    const ds = this.ssrmDatasource();
    if (!ds || typeof ds.getRows !== 'function') return;
    const bs = this.ssrmBlockSize();
    const want = new Map();
    const nodes = this.displayedNodes;
    for (let i = Math.max(0, first); i <= last && i < nodes.length; i++) {
      const n = nodes[i];
      const st = n.__store || this.ssrm;
      const local = n.__storeIndex ?? i;
      if (st.nodes[local] !== n) continue;
      const bi = Math.floor(local / bs);
      if (!n.stub && st.blocks.has(bi)) continue;
      if (!want.has(st)) want.set(st, new Set());
      want.get(st).add(bi);
    }
    for (const [st, set] of want) for (const bi of set) this.ssrmLoadBlock(bi, st);
  },

  ssrmLoadBlock(bi, store = this.ssrm) {
    const st = store;
    if (st.blocks.has(bi)) return;
    const bs = this.ssrmBlockSize();
    const startRow = bi * bs;
    if (st.lastRowKnown && startRow >= st.rowCount) return;
    st.blocks.set(bi, { state: 'loading' });
    const version = st.version;
    const root = this.ssrm;
    const alive = () => !this.destroyed && this.ssrm === root && st.version === version && root.stores.get(st.id) === st;
    let done = false;
    const success = ({ rowData, rowCount } = {}) => {
      if (done || !alive()) return;
      done = true;
      this.ssrmOnLoaded(bi, rowData || [], rowCount, st);
    };
    const fail = () => {
      if (done || !alive()) return;
      done = true;
      st.blocks.set(bi, { state: 'failed' });
      this.notify();
    };
    const req = this.ssrmBuildRequest(startRow, startRow + bs, st);
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
          parentNode: st.parentNode || { level: -1, id: 'ROOT_NODE_ID', group: true, childStore: null },
          api: this.api,
          context: this.gos.context,
          success,
          fail,
          successCallback: (rows, lastRow) => success({ rowData: rows, rowCount: lastRow != null && lastRow >= 0 ? lastRow : undefined }),
          failCallback: fail,
        };
    // 비동기로 호출 (렌더 중 setState 방지)
    Promise.resolve().then(() => {
      if (!alive()) return;
      this.ssrmDatasource()?.getRows(params);
    });
  },

  ssrmOnLoaded(bi, rows, rowCount, store = this.ssrm) {
    const st = store;
    st.blocks.set(bi, { state: 'loaded' });
    st.lru = st.lru.filter(x => x !== bi);
    st.lru.push(bi);
    this.ssrmWriteRows(bi * this.ssrmBlockSize(), rows, rowCount, bi, st);
    // 로딩 중이라 미뤄둔 비동기 트랜잭션
    if (this.ssrmTxQueue?.length && !this.ssrmIsLoading()) this.flushServerSideAsyncTransactions();
  },

  ssrmRowId(data, idx, store = this.ssrm) {
    const getRowId = this.gos.getRowId;
    if (typeof getRowId === 'function') {
      return String(getRowId({ data, level: store?.level ?? 0, parentKeys: [...(store?.route || [])], api: this.api, context: this.gos.context }));
    }
    return store && store.level > 0 ? `${store.parentNode?.id ?? store.id}-${idx}` : String(idx);
  },

  // 그룹 행이면 { key, field, col } (평면 행이면 null)
  ssrmGroupInfo(data, store) {
    if (this.isServerTree()) {
      const isGroup = !!this.gos.isServerSideGroup(data);
      const keyFn = this.gos.getServerSideGroupKey;
      return { group: isGroup, key: typeof keyFn === 'function' ? keyFn(data) : undefined, field: null, col: null };
    }
    const cols = this.rowGroupColumns();
    if (store.level >= cols.length) return null;
    const col = cols[store.level];
    const cd = col.colDef;
    const key = typeof cd.valueGetter === 'function' ? cd.valueGetter({ data, node: null, colDef: cd, column: col, api: this.api, context: this.gos.context }) : getFieldValue(data, cd.field);
    return { group: true, key, field: cd.field, col };
  },

  // 선택 상태를 로드된 노드에 반영 — 평면: selectAll XOR toggled / 그룹 선택: 선택 트리
  ssrmApplySelection(node) {
    let want;
    if (this.ssrmTreeMode()) {
      want = !!node.selectable && (node.__ssrmGroup ? this.ssrmGroupState(node) === true : this.ssrmTreeEffective(node).sel);
    } else {
      const sel = this.ssrmSel;
      if (!sel) return false;
      want = !!node.selectable && sel.selectAll !== sel.toggled.has(node.id);
    }
    const changed = node.selected !== want;
    node.selected = want;
    if (want) this.selected.set(node.id, node);
    else this.selected.delete(node.id);
    return changed;
  },

  // 스토어에서 빠지는 행: 맵·선택에서 제거 (하위 스토어도)
  ssrmForgetNode(n) {
    if (this.nodeById.get(n.id) === n) this.nodeById.delete(n.id);
    this.selected.delete(n.id);
    if (n.childStore) this.ssrmDropStore(n.childStore);
  },

  ssrmDropStore(st) {
    const root = this.ssrm;
    if (!root || root.stores.get(st.id) !== st) return;
    root.stores.delete(st.id);
    st.version++;
    for (const n of st.nodes) if (!n.stub) this.ssrmForgetNode(n);
  },

  ssrmSetupNode(node, data, store) {
    node.level = store.level;
    node.uiLevel = store.level;
    node.parent = store.parentNode;
    node.__store = store;
    const info = this.ssrmGroupInfo(data, store);
    if (this.isServerTree()) {
      node.key = info.key;
      node.__ssrmTree = true;
    }
    if (info?.group) {
      const route = [...store.route, info.key];
      node.group = true;
      node.__ssrmGroup = true;
      node.key = info.key;
      node.field = info.field;
      node.rowGroupColumn = info.col;
      node.__route = route;
      const cc = this.gos.getChildCount;
      node.allChildrenCount = typeof cc === 'function' ? cc(data) : undefined;
      // 처음 만든 그룹 행: 기억된 펼침(정렬·필터로 다시 불러와도 유지) 또는 groupDefaultExpanded / isGroupOpenByDefault
      if (!node.__ssrmSeen) {
        const k = routeKey(route);
        node.expanded = this.ssrmExpanded.has(k) || this.defaultExpandedFor(node);
        if (node.expanded) this.ssrmExpanded.add(k);
        node.__ssrmSeen = true;
      }
      if (node.expanded && !node.childStore) this.ssrmOpenChildStore(node);
    } else {
      node.group = false;
      node.__ssrmGroup = false;
    }
  },

  ssrmOpenChildStore(node) {
    const root = this.ssrm;
    const k = routeKey(node.__route);
    let st = root.stores.get(k);
    if (!st || st.parentNode !== node) {
      st = this.ssrmNewStore(node.__route, node);
      root.stores.set(k, st);
    }
    node.childStore = st;
    return st;
  },

  ssrmWriteRows(start, rows, rowCount, bi, store = this.ssrm) {
    const st = store;
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
    this.ssrmResizeStore(st, st.rowCount);
    rows.forEach((data, i) => {
      const idx = start + i;
      if (idx >= st.nodes.length) return;
      const id = this.ssrmRowId(data, idx, st);
      const prev = this.nodeById.get(id);
      const node = prev || new RowNode(this, data, id);
      if (prev && prev.data !== data) prev.__version++;
      node.data = data;
      node.displayed = true;
      this.ssrmSetupNode(node, data, st);
      this.updateSelectable(node);
      this.ssrmApplySelection(node);
      this.nodeById.set(id, node);
      const old = st.nodes[idx];
      if (old && old !== node && !old.stub) this.ssrmForgetNode(old);
      st.nodes[idx] = node;
    });
    if (bi != null) this.ssrmEvictBlocks(bi, st);
    this.ssrmRebuildRootNodes();
    this.rowDataSet = true;
    if (this.rootNodes.length) this.inferDataTypes();
    this.ssrmFlatten();
    this.ssrmRefreshView();
    this.dispatch('modelUpdated', { newData: false, newPage: false, keepRenderedRows: true, animate: false });
    this.dispatch('storeUpdated', {});
  },

  // maxBlocksInCache 초과 시 오래 안 쓴 블록을 stub 으로 되돌림 (스토어별)
  ssrmEvictBlocks(keepBi, store = this.ssrm) {
    const max = this.gos.maxBlocksInCache;
    const st = store;
    if (!max || max < 1) return;
    const bs = this.ssrmBlockSize();
    while (st.lru.length > max) {
      const victim = st.lru.find(b => b !== keepBi);
      if (victim == null) break;
      st.lru = st.lru.filter(b => b !== victim);
      st.blocks.delete(victim);
      for (let i = victim * bs; i < Math.min((victim + 1) * bs, st.nodes.length); i++) {
        const n = st.nodes[i];
        if (n && !n.stub) this.ssrmForgetNode(n);
        st.nodes[i] = this.makeStub(i, st);
      }
    }
  },

  // 서버 그룹 펼치기/접기 — 펼치면 하위 스토어를 만들고 보이는 블록을 요청
  ssrmSetExpanded(node, expanded) {
    if (!node.__ssrmGroup || node.expanded === expanded) return;
    node.expanded = expanded;
    const k = routeKey(node.__route);
    if (expanded) {
      this.ssrmExpanded.add(k);
      if (!node.childStore) this.ssrmOpenChildStore(node);
    } else this.ssrmExpanded.delete(k);
    this.ssrmFlatten();
    this.ssrmRefreshView();
    node.__dispatchLocal('expandedChanged', { expanded });
    this.dispatch('rowGroupOpened', { node, data: node.data, rowIndex: node.rowIndex, expanded });
  },

  ssrmFindStore(route) {
    if (!this.ssrm) return null;
    return this.ssrm.stores.get(routeKey(route || [])) || null;
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
    this.ssrmResizeStore(this.ssrm, count);
    this.ssrmFlatten();
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

  // getServerSideGroupLevelState: 만들어진 스토어(최상위 + 펼친 그룹) 목록
  getServerSideGroupLevelState() {
    if (!this.ssrm) return [];
    return [...this.ssrm.stores.values()].map(st => ({
      route: [...st.route],
      rowCount: st.rowCount,
      lastRowIndexKnown: st.lastRowKnown,
      info: {},
      pageSize: this.ssrmBlockSize(),
      maxBlocksInCache: this.gos.maxBlocksInCache,
    }));
  },

  // route 를 주면 그 그룹의 스토어만. purge: 행을 비우고 처음부터 / 아니면 기존 행을 둔 채 다시 요청
  refreshServerSide(params = {}) {
    if (!this.isSsrm()) return;
    if (!this.ssrm) {
      this.ssrmReset('refresh');
      return;
    }
    const st = this.ssrmFindStore(params.route);
    if (!st) return;
    if (params.purge) {
      if (st === this.ssrm) {
        this.ssrmReset('refresh');
        return;
      }
      for (const n of st.nodes) if (!n.stub) this.ssrmForgetNode(n);
      st.version++;
      st.blocks.clear();
      st.lru = [];
      st.lastRowKnown = false;
      st.rowCount = this.ssrmInitialRowCount();
      st.nodes = [];
      this.ssrmResizeStore(st, st.rowCount);
      this.ssrmRebuildRootNodes();
      this.ssrmFlatten();
      this.ssrmRefreshView();
      return;
    }
    st.version++;
    st.blocks.clear();
    st.lru = [];
    this.notify();
  },

  retryServerSideLoads() {
    if (!this.ssrm) return;
    for (const st of this.ssrm.stores.values()) for (const [bi, b] of [...st.blocks]) if (b.state === 'failed') st.blocks.delete(bi);
    this.notify();
  },

  // 단독 선택(클릭·singleRow) 전에 id 상태 초기화 — keep: 선택을 유지할 노드
  ssrmResetSelection(keep = []) {
    if (!this.isSsrm()) return;
    if (this.ssrmTreeMode()) {
      this.ssrmSelTree = { id: undefined, selectAll: false, toggled: new Map() };
      keep.forEach(n => this.ssrmTreeSet(n, true));
    } else if (this.ssrmSel) this.ssrmSel = { selectAll: false, toggled: new Set(keep.map(n => n.id)) };
  },

  ssrmIsLoading() {
    if (!this.ssrm) return false;
    for (const st of this.ssrm.stores.values()) for (const b of st.blocks.values()) if (b.state === 'loading') return true;
    return false;
  },

  // 블록 다시 계산: 전부 실제 행인 블록만 '로드됨', 나머지는 보일 때 다시 요청
  ssrmRebuildBlocks(st = this.ssrm) {
    const nodes = st.nodes;
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

  // ── SSRM 트랜잭션 (applyServerSideTransaction) ──
  // 로드된 행에만 적용 (안 보인 행은 서버가 이미 반영했다고 보고 다음 로드에 받음). update/remove 는 getRowId 권장.
  //  - route: 그 그룹의 스토어에 적용 (그룹을 한 번도 안 펼쳤으면 StoreNotFound)
  //  - 로딩 중이면 적용 안 하고 status 'StoreLoading' (Async 판은 로드 끝난 뒤 적용)
  applyServerSideTransaction(tx = {}) {
    if (this.gos.rowModelType !== 'serverSide') return undefined;
    const st = this.ssrmFindStore(tx.route);
    if (!this.ssrm || !st) return { status: 'StoreNotFound' };
    if (this.ssrmIsLoading()) return { status: 'StoreLoading' };
    const nodes = st.nodes;
    const res = { status: 'Applied', add: [], update: [], remove: [] };
    const hasId = typeof this.gos.getRowId === 'function';
    const findNode = d => {
      if (hasId) {
        const n = this.nodeById.get(this.ssrmRowId(d, 0, st));
        return n && n.__store === st ? n : null;
      }
      return nodes.find(n => n.data === d) || null;
    };
    let selChanged = false;
    if (tx.remove?.length) {
      const gone = new Set(tx.remove.map(findNode).filter(Boolean));
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (!gone.has(n)) continue;
        nodes.splice(i, 1);
        if (this.selected.has(n.id)) selChanged = true;
        this.ssrmForgetNode(n);
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
        const n = new RowNode(this, d, hasId ? this.ssrmRowId(d, 0, st) : `ssrm-add-${(this.ssrmAddSeq = (this.ssrmAddSeq || 0) + 1)}`);
        n.displayed = true;
        this.ssrmSetupNode(n, d, st);
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
    st.rowCount = nodes.length;
    this.ssrmRebuildBlocks(st);
    this.ssrmRebuildRootNodes();
    this.ssrmFlatten();
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

  // 서버 요청 없이 행 직접 넣기 (applyServerSideRowData)
  applyServerSideRowData({ successParams, startRow = 0, route } = {}) {
    if (this.gos.rowModelType !== 'serverSide') return;
    if (!this.ssrm) this.ssrmReset('rowData');
    const st = this.ssrmFindStore(route);
    if (!st) return;
    const rows = successParams?.rowData || [];
    this.ssrmWriteRows(startRow, rows, successParams?.rowCount, null, st);
    this.ssrmRebuildBlocks(st);
  },

  // ── SSRM 선택 상태 (getServerSideSelectionState) ──
  // { selectAll, toggledNodes }: selectAll=true 면 toggledNodes 는 '선택 해제된' id, false 면 '선택된' id. 안 불러온 행도 포함
  getServerSideSelectionState() {
    if (!this.isSsrm()) return null;
    if (this.ssrmTreeMode()) return this.ssrmTreeToState();
    const sel = this.ssrmSel || { selectAll: false, toggled: new Set() };
    return { selectAll: sel.selectAll, toggledNodes: [...sel.toggled] };
  },

  setServerSideSelectionState(state, source = 'api') {
    if (!this.isSsrm()) return;
    if (this.ssrmTreeMode() || (state && 'selectAllChildren' in state)) {
      // 그룹 선택 모양 { selectAllChildren, toggledNodes: [{ nodeId, selectAllChildren, toggledNodes }] }
      const build = (x, id) => ({
        id,
        selectAll: !!(x?.selectAllChildren ?? x?.selectAll),
        toggled: new Map((x?.toggledNodes || []).map(t => (typeof t === 'object' ? [String(t.nodeId), build(t, String(t.nodeId))] : [String(t), { id: String(t), selectAll: !x?.selectAll, toggled: new Map() }]))),
      });
      this.ssrmSelTree = build(state, undefined);
    } else {
      this.ssrmSel = { selectAll: !!state?.selectAll, toggled: new Set((state?.toggledNodes || []).map(String)) };
    }
    this.ssrmApplyAllSelection(source);
  },

  // 로드된 행 전체에 선택 상태 다시 반영 → 바뀐 행만 이벤트
  ssrmApplyAllSelection(source) {
    const changed = [];
    this.ssrmForEachLoaded(n => {
      if (this.ssrmApplySelection(n)) changed.push(n);
    });
    this.__ssrmApplying = true;
    try {
      this.afterSelectionChange(changed, source, undefined, true);
    } finally {
      this.__ssrmApplying = false;
    }
  },

  // ── 그룹 선택 (rowSelection.groupSelects: 'descendants' | 'filteredDescendants') ──
  // 선택 트리: { selectAll, toggled: Map<id, 같은 모양> } — 항목은 부모와 다른 상태인 그룹/행만 (안 불러온 하위도 상속으로 결정)
  ssrmTreeMode() {
    return this.isServerGrouping() && this.rsOpts?.mode === 'multiRow' && this.groupSelectsMode() !== 'self';
  },

  ssrmTreeRoot() {
    return (this.ssrmSelTree ||= { id: undefined, selectAll: false, toggled: new Map() });
  },

  ssrmAncestors(node) {
    const out = [];
    for (let p = node.parent; p; p = p.parent) out.unshift(p);
    return out;
  },

  // 노드의 실제 선택값 (가장 가까운 트리 항목의 selectAll 상속) + 자기 항목
  ssrmTreeEffective(node) {
    let s = this.ssrmTreeRoot();
    let sel = s.selectAll;
    for (const a of this.ssrmAncestors(node)) {
      const e = s?.toggled.get(a.id);
      if (e) {
        sel = e.selectAll;
        s = e;
      } else s = null;
    }
    const entry = s?.toggled.get(node.id) || null;
    return { sel: entry ? entry.selectAll : sel, entry };
  },

  // 그룹 체크 상태: true | false | null(하위 일부만)
  ssrmGroupState(node) {
    const { sel, entry } = this.ssrmTreeEffective(node);
    return entry && entry.toggled.size ? null : sel;
  },

  ssrmTreeSet(node, value) {
    let s = this.ssrmTreeRoot();
    let sel = s.selectAll;
    for (const a of this.ssrmAncestors(node)) {
      let e = s.toggled.get(a.id);
      if (!e) s.toggled.set(a.id, (e = { id: a.id, selectAll: sel, toggled: new Map() }));
      sel = e.selectAll;
      s = e;
    }
    s.toggled.set(node.id, { id: node.id, selectAll: !!value, toggled: new Map() });
    // 부모와 같은 값이고 하위 항목도 없으면 정리
    const norm = st => {
      for (const [id, e] of st.toggled) {
        norm(e);
        if (!e.toggled.size && e.selectAll === st.selectAll) st.toggled.delete(id);
      }
    };
    norm(this.ssrmTreeRoot());
  },

  ssrmSetGroupSelected(node, value, source = 'api') {
    if (!this.ssrmTreeMode()) {
      this.setNodeSelected(node, value, false, source);
      return;
    }
    this.ssrmTreeSet(node, value);
    this.ssrmApplyAllSelection(source);
  },

  ssrmTreeToState(st = this.ssrmTreeRoot()) {
    const out = { selectAllChildren: st.selectAll, toggledNodes: [...st.toggled.values()].map(e => this.ssrmTreeToState(e)) };
    if (st.id !== undefined) return { nodeId: st.id, ...out };
    return out;
  },

  // 선택 변경 후 id 상태 동기화 (afterSelectionChange 에서 호출)
  ssrmSyncSelection(changed) {
    if (this.__ssrmApplying) return;
    if (this.ssrmTreeMode()) {
      // 행 하나를 직접 바꾼 경우: 트리에 기록하고, 그 영향(부모 그룹 체크 상태)을 로드된 행에 다시 반영
      for (const n of [...changed]) this.ssrmTreeSet(n, n.selected);
      this.ssrmForEachLoaded(n => {
        if (this.ssrmApplySelection(n) && !changed.includes(n)) changed.push(n);
      });
      return;
    }
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
};
