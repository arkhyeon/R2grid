// 행 데이터: setRowData(getRowId 갱신)·applyTransaction·노드 데이터 교체
//  GridCore.prototype 에 합쳐짐 (this = GridCore)
import { RowNode } from './RowNode.js';
import { getFieldValue } from './utils.js';

export const rowDataMethods = {
  // 노드 데이터가 바뀌었을 때 공통: 다시 그리기 버전 올림 + 빠른 검색 문장·값 캐시 버림
  markDataChanged(node) {
    this.dataEpoch = (this.dataEpoch || 0) + 1;
    node.__version++;
    node.__quickFilterText = null;
    this.bumpValueCache();
  },

  // ── 행 데이터 ─────────────────────────────────────────────
  makeRowId(data, level = 0) {
    const fn = this.gos.getRowId;
    if (typeof fn === 'function') {
      return String(fn({ data, level, parentKeys: [], api: this.api, context: this.gos.context }));
    }
    return String(this.nextId++);
  },

  setRowData(rowData, initial) {
    if (this.isSsrm() || this.isViewportModel()) return;
    this.bumpValueCache();
    // treeDataChildrenField: 중첩된 children 배열을 펼친 목록으로 (부모는 treeChildParent 에 기억, v33.1+)
    this.treeChildParent = null;
    if (rowData && this.gos.treeData && this.gos.treeDataChildrenField && typeof this.gos.getDataPath !== 'function') {
      const f = this.gos.treeDataChildrenField;
      const parentOf = new Map();
      const flat = [];
      const walk = (list, parent) => {
        for (const d of list || []) {
          flat.push(d);
          if (parent) parentOf.set(d, parent);
          const kids = getFieldValue(d, f);
          if (Array.isArray(kids)) walk(kids, d);
        }
      };
      walk(rowData, null);
      this.treeChildParent = parentOf;
      rowData = flat;
    }
    const getRowId = this.gos.getRowId;
    let selectionChanged = false;
    this.editing = null;
    this.groupsDirty = true;
    // getRowId 없는 전체 교체면 맨 위로 (suppressScrollOnNewData 로 끔)
    // resetRowDataOnUpdate: getRowId 가 있어도 새 rowData 는 통째로 새 행 (선택·펼침 등 행 상태 초기화)
    const reset = !!this.gos.resetRowDataOnUpdate;
    const isDelta = typeof getRowId === 'function' && this.rootNodes.length > 0 && !reset;
    if (!initial && !isDelta && !this.gos.suppressScrollOnNewData && this.viewport) {
      this.viewport.setScrollTop(0);
    }
    let freshNodes = null; // getRowId 갱신 시 새로 생긴 노드 (나머지는 기존 노드 재사용)
    if (rowData == null) {
      this.rowDataSet = false;
      if (this.selected.size) selectionChanged = true;
      this.clearSelectionSilently();
      this.rootNodes = [];
      this.nodeById = new Map();
    } else {
      this.rowDataSet = true;
      if (isDelta) {
        const oldById = this.nodeById;
        const newById = new Map();
        freshNodes = [];
        const nodes = new Array(rowData.length);
        for (let i = 0; i < rowData.length; i++) {
          const data = rowData[i];
          const id = this.makeRowId(data);
          let node = oldById.get(id);
          if (node) {
            if (node.data !== data) {
              node.data = data;
              this.markDataChanged(node);
            }
          } else {
            node = new RowNode(this, data, id);
            freshNodes.push(node);
          }
          node.sourceRowIndex = i;
          nodes[i] = node;
          newById.set(id, node);
        }
        for (const [id, node] of [...this.selected]) {
          if (newById.get(id) !== node) {
            node.selected = false;
            this.selected.delete(id);
            selectionChanged = true;
          }
        }
        // suppressMaintainUnsortedOrder: 새 rowData 순서를 따르지 않고 기존 행 순서 유지, 새 행은 끝에
        if (this.gos.suppressMaintainUnsortedOrder) {
          const kept = this.rootNodes.filter(n => newById.get(n.id) === n);
          const fresh = new Set(freshNodes);
          const ordered = [...kept, ...nodes.filter(n => fresh.has(n))];
          ordered.forEach((n, i) => (n.sourceRowIndex = i));
          this.rootNodes = ordered;
        } else this.rootNodes = nodes;
        this.nodeById = newById;
      } else {
        if (this.selected.size) selectionChanged = true;
        this.clearSelectionSilently();
        this.nextId = 0;
        const nodes = new Array(rowData.length);
        const byId = new Map();
        for (let i = 0; i < rowData.length; i++) {
          const data = rowData[i];
          const node = new RowNode(this, data, this.makeRowId(data));
          node.sourceRowIndex = i;
          nodes[i] = node;
          byId.set(node.id, node);
        }
        this.rootNodes = nodes;
        this.nodeById = byId;
      }
    }
    this.updateSelectableAll();
    this.updateMasterFlags(this.rootNodes);
    this.initRowPinning(freshNodes || this.rootNodes, !freshNodes);
    if (this.rootNodes.length) this.inferDataTypes();
    this.quickFilterVersion++;
    this.refreshModel({ newData: true, silent: initial });
    if (initial) {
      if (this.rowDataSet) this.pendingInitialEvents.push(['rowDataUpdated', {}]);
      return;
    }
    this.dispatch('rowDataUpdated', {});
    if (selectionChanged) {
      this.dispatch('selectionChanged', { source: 'rowDataChanged', selectedNodes: this.getSelectedNodes() });
    }
  },

  clearSelectionSilently() {
    for (const n of this.selected.values()) n.selected = false;
    this.selected.clear();
    this.lastSelectedNode = null;
  },

  applyTransaction(tx = {}) {
    const result = { add: [], update: [], remove: [] };
    if (this.isSsrm()) return result;
    this.groupsDirty = true;
    const hasId = typeof this.gos.getRowId === 'function';
    let byData = null;
    const findNode = data => {
      if (hasId) return this.nodeById.get(this.makeRowId(data)) || null;
      if (!byData) byData = new Map(this.rootNodes.map(n => [n.data, n]));
      return byData.get(data) || null;
    };
    let selectionChanged = false;
    if (tx.remove?.length) {
      const removeSet = new Set();
      tx.remove.forEach(d => {
        const node = findNode(d);
        if (node) removeSet.add(node);
      });
      if (removeSet.size) {
        this.rootNodes = this.rootNodes.filter(n => !removeSet.has(n));
        removeSet.forEach(n => {
          this.nodeById.delete(n.id);
          if (n.selected) {
            n.selected = false;
            this.selected.delete(n.id);
            selectionChanged = true;
          }
          result.remove.push(n);
        });
      }
    }
    if (tx.update?.length) {
      tx.update.forEach(d => {
        const node = findNode(d);
        if (!node) return;
        const before = this.flashCandidates(node);
        node.data = d;
        this.markDataChanged(node);
        this.flashChangedCells(node, before);
        result.update.push(node);
      });
    }
    if (tx.add?.length) {
      const newNodes = tx.add.map(d => {
        const node = new RowNode(this, d, this.makeRowId(d));
        this.nodeById.set(node.id, node);
        result.add.push(node);
        return node;
      });
      this.updateMasterFlags(newNodes);
      this.initRowPinning(newNodes, false);
      const idx = tx.addIndex;
      if (idx != null && idx >= 0 && idx < this.rootNodes.length) {
        this.rootNodes = [...this.rootNodes.slice(0, idx), ...newNodes, ...this.rootNodes.slice(idx)];
      } else {
        this.rootNodes = [...this.rootNodes, ...newNodes];
      }
    }
    this.rootNodes.forEach((n, i) => {
      n.sourceRowIndex = i;
    });
    this.rowDataSet = true;
    this.updateSelectableAll();
    if (!this.columnsTypedOnce && this.rootNodes.length) this.inferDataTypes();
    this.quickFilterVersion++;
    // suppressModelUpdateAfterUpdateTransaction: 수정만 있는 트랜잭션은 정렬·필터·그룹을 다시 하지 않음 (값·집계만 갱신)
    if (this.gos.suppressModelUpdateAfterUpdateTransaction && result.update.length && !result.add.length && !result.remove.length) {
      this.spanEpoch = (this.spanEpoch || 0) + 1;
      if (this.isClientSide() && (this.groupMode || this.isPivotActive() || this.gos.alwaysAggregateAtRootLevel)) {
        this.aggDirty ||= new Set();
        result.update.forEach(n => this.aggDirty.add(n));
        this.flushAggDirty();
      }
      this.notify();
    } else this.refreshModel({ keepRenderedRows: true });
    this.dispatch('rowDataUpdated', {});
    if (selectionChanged) {
      this.dispatch('selectionChanged', { source: 'rowDataChanged', selectedNodes: this.getSelectedNodes() });
    }
    return result;
  },

  // enableCellChangeFlash 컬럼의 이전 값 스냅샷
  flashCandidates(node) {
    const cols = this.allColumns.filter(c => c.colDef.enableCellChangeFlash);
    if (!cols.length) return null;
    return cols.map(c => [c, this.getCellValue(node, c)]);
  },

  flashChangedCells(node, before) {
    if (!before) return;
    const changed = before.filter(([c, v]) => this.getCellValue(node, c) !== v).map(([c]) => c);
    if (changed.length) this.flashCells({ rowNodes: [node], columns: changed });
  },

  setNodeData(node, data, isUpdate) {
    this.spanEpoch = (this.spanEpoch || 0) + 1;
    const before = isUpdate ? this.flashCandidates(node) : null;
    node.data = data;
    this.markDataChanged(node);
    this.updateSelectable(node);
    if (before) this.flashChangedCells(node, before);
    node.__dispatchLocal('dataChanged', { oldData: null, newData: data, update: isUpdate });
    this.notify();
  },

  updateMasterFlags(nodes) {
    const md = this.gos.masterDetail;
    const isRowMaster = this.gos.isRowMaster;
    const expandDefault = this.gos.groupDefaultExpanded;
    nodes.forEach(n => {
      const wasMaster = n.master;
      n.master = !!md && (typeof isRowMaster === 'function' ? !!isRowMaster(n.data) : true);
      if (n.master && !wasMaster && expandDefault != null && (expandDefault === -1 || expandDefault >= 1)) {
        n.expanded = true;
      }
      if (!n.master) n.expanded = false;
    });
  },

  setNodeExpanded(node, expanded) {
    if (node?.__ssrmGroup) {
      this.ssrmSetExpanded(node, !!expanded);
      return;
    }
    const expandable = node.master || (node.group && !!node.childrenAll?.length);
    if (!expandable || node.expanded === expanded) return;
    node.expanded = expanded;
    this.refreshModel({ keepRenderedRows: true, skipFilter: true, reuseAgg: true });
    node.__dispatchLocal('expandedChanged', { expanded });
    this.dispatch('rowGroupOpened', { node, data: node.data, rowIndex: node.rowIndex, expanded });
  },

  // keepDetailRows: 닫힌 상세 그리드 상태 보관 (keepDetailRowsCount 개, 기본 10 — 오래된 것부터 버림)
  keepDetail(id, entry) {
    const m = (this.keptDetails ||= new Map());
    m.delete(id);
    m.set(id, entry);
    const max = this.gos.keepDetailRowsCount ?? 10;
    while (m.size > Math.max(0, max)) m.delete(m.keys().next().value);
  },

  takeKeptDetail(id) {
    const m = this.keptDetails;
    if (!this.gos.keepDetailRows || !m?.has(id)) return null;
    const e = m.get(id);
    m.delete(id);
    return e;
  },

  getDetailNode(master) {
    if (!master.detailNode) {
      const d = new RowNode(this, master.data, `detail_${master.id}`);
      d.detail = true;
      d.parent = master;
      d.selectable = false;
      master.detailNode = d;
    }
    master.detailNode.data = master.data;
    return master.detailNode;
  },
};
