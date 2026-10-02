// Server-Side Row Model (rowModelType: 'serverSide') — AG 부분 스토어(partial store) 동작
//  - cacheBlockSize 단위 블록을 화면에 보일 때 getRows 로 요청
//  - success({ rowData, rowCount }) / fail()  (레거시 successCallback(rows, lastRow) / failCallback 도 지원)
//  - 정렬/필터 변경 시 캐시 비우고 서버 재요청
import { RowNode } from './RowNode.js';

export const ssrmMethods = {
  isSsrm() {
    return this.gos.rowModelType === 'serverSide';
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
      rowCount: this.gos.serverSideInitialRowCount ?? 1,
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
    const ds = this.gos.serverSideDatasource;
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
    const params = {
      request: this.ssrmBuildRequest(startRow, startRow + bs),
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
      this.gos.serverSideDatasource.getRows(params);
    });
  },

  ssrmOnLoaded(bi, rows, rowCount) {
    const st = this.ssrm;
    const bs = this.ssrmBlockSize();
    const start = bi * bs;
    st.blocks.set(bi, { state: 'loaded' });
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
    this.rootNodes = this.displayedNodes.filter(n => !n.stub);
    this.rowDataSet = true;
    if (this.rootNodes.length) this.inferDataTypes();
    this.ssrmRefreshView();
    this.dispatch('modelUpdated', { newData: false, newPage: false, keepRenderedRows: true, animate: false });
    this.dispatch('storeUpdated', {});
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
