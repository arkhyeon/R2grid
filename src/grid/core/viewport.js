// Viewport 행 모델 (rowModelType: 'viewport')
//  화면에 보이는 범위만 데이터 소스가 채워 주는 방식 — 실시간 시세처럼 서버가 바뀐 행을 계속 밀어 넣는 화면용.
//  viewportDatasource: {
//    init({ setRowCount(count, keepRenderedRows?), setRowData({ [rowIndex]: data }), getRow(rowIndex) }),
//    setViewportRange(firstRow, lastRow),   // 보이는 범위가 바뀔 때 (viewportRowModelPageSize 단위 + viewportRowModelBufferSize 여유)
//    destroy?()
//  }
//  정렬·필터는 그리드가 하지 않음 (데이터 소스가 api.getColumnState / getFilterModel 을 보고 다시 보내 줌).
import { RowNode } from './RowNode.js';

export const viewportMethods = {
  isViewportModel() {
    return this.gos.rowModelType === 'viewport';
  },

  vpInit() {
    this.vpDestroy();
    const ds = this.gos.viewportDatasource;
    const version = (this.vp?.version || 0) + 1;
    this.vp = { nodes: [], range: null, ds, version };
    this.rootNodes = [];
    this.nodeById = new Map();
    this.vpRefreshView();
    if (!ds) return;
    const alive = () => this.vp?.version === version && !this.destroyed;
    ds.init?.({
      setRowCount: (count, keepRenderedRows) => alive() && this.vpSetRowCount(count, keepRenderedRows),
      setRowData: rowData => alive() && this.vpSetRowData(rowData),
      getRow: i => this.vp?.nodes[i],
    });
  },

  vpDestroy() {
    const vp = this.vp;
    if (!vp || vp.destroyed) return;
    vp.destroyed = true;
    vp.version++;
    vp.ds?.destroy?.();
  },

  vpStub(i) {
    const n = new RowNode(this, undefined, `vp-stub-${i}`);
    n.stub = true;
    n.selectable = false;
    n.rowIndex = i;
    n.displayed = true;
    return n;
  },

  // 행 수 지정. keepRenderedRows 면 이미 받은 행은 그대로, 아니면 모두 비우고 다시 요청
  vpSetRowCount(count, keepRenderedRows) {
    const nodes = this.vp.nodes;
    const n = Math.max(0, Number(count) || 0);
    if (!keepRenderedRows) {
      for (let i = 0; i < nodes.length; i++) if (!nodes[i].stub) this.vpForget(nodes[i]);
      nodes.length = 0;
    }
    for (let i = n; i < nodes.length; i++) if (!nodes[i].stub) this.vpForget(nodes[i]);
    if (nodes.length > n) nodes.length = n;
    for (let i = nodes.length; i < n; i++) nodes.push(this.vpStub(i));
    this.vp.range = null; // 다음 그리기 때 범위를 다시 알림
    this.vpRefreshView();
  },

  vpForget(node) {
    if (this.nodeById.get(node.id) === node) this.nodeById.delete(node.id);
  },

  // { 행 번호: 데이터 } — 빈 칸이면 새 행, 이미 있으면 값만 바꿈(바뀐 칸 깜빡임은 enableCellChangeFlash)
  vpSetRowData(rowData) {
    const nodes = this.vp.nodes;
    let added = false;
    for (const [k, data] of Object.entries(rowData || {})) {
      const i = Number(k);
      const cur = nodes[i];
      if (!cur || data == null) continue;
      if (cur.stub) {
        const id = typeof this.gos.getRowId === 'function' ? this.makeRowId(data) : String(i);
        const node = new RowNode(this, data, id);
        node.rowIndex = i;
        node.displayed = true;
        nodes[i] = node;
        this.nodeById.set(id, node);
        this.updateSelectable?.(node);
        // 이 id 가 선택돼 있었으면 다시 선택 표시
        if (this.selected.has(id)) {
          node.selected = true;
          this.selected.set(id, node);
        }
        added = true;
      } else if (cur.data !== data) {
        this.setNodeData(cur, data, true);
      }
    }
    if (added) this.vpRefreshView();
  },

  // 보이는 행 범위 → 페이지 단위로 넓혀서 데이터 소스에 알림. 범위 밖 행은 비움
  vpEnsureRange(first, last) {
    const vp = this.vp;
    if (!vp?.ds || !vp.nodes.length) return;
    const ps = Math.max(1, this.gos.viewportRowModelPageSize ?? 5);
    const buf = Math.max(0, this.gos.viewportRowModelBufferSize ?? 5);
    const count = vp.nodes.length;
    const f = Math.max(0, Math.floor(Math.max(0, first - buf) / ps) * ps);
    const l = Math.min(count - 1, Math.ceil((last + buf + 1) / ps) * ps - 1);
    if (vp.range && vp.range.first === f && vp.range.last === l) return;
    vp.range = { first: f, last: l };
    let purged = false;
    for (let i = 0; i < count; i++) {
      if (i >= f && i <= l) continue;
      const n = vp.nodes[i];
      if (n.stub) continue;
      this.vpForget(n);
      vp.nodes[i] = this.vpStub(i);
      purged = true;
    }
    vp.ds.setViewportRange?.(f, l);
    if (purged) this.vpRefreshView();
  },

  vpRefreshView() {
    const nodes = this.vp?.nodes || [];
    nodes.forEach((n, i) => {
      n.rowIndex = i;
      n.displayed = true;
    });
    this.rootNodes = nodes.filter(n => !n.stub);
    this.displayedNodes = nodes;
    this.sortedNodes = nodes;
    this.filteredNodes = this.rootNodes;
    this.updatePagination();
    this.computeRowTops();
    this.clampFocusAndRanges?.();
    this.notify();
  },
};
