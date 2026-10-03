// 피벗 (pivotMode + colDef.pivot / pivotIndex + aggFunc 값 컬럼)
//  - 피벗 컬럼 값 조합 × 값 컬럼마다 결과 컬럼 생성 (colId: pivot_<키..>_<값컬럼>), 헤더는 피벗 키 단계별 그룹
//  - 피벗 모드: 그룹 행만 표시(리프 숨김), 행 그룹이 없으면 전체 합계 1행
import { Column, ColumnGroup } from './Column.js';
import { RowNode } from './RowNode.js';
import { defaultComparator, toText } from './utils.js';

export const pivotMethods = {
  isPivotActive() {
    const on = this.pivotModeOverride ?? this.gos.pivotMode;
    return !!on && this.isClientSide();
  },

  pivotColumns() {
    return this.allColumns
      .filter(c => c.pivot && !c.isPivotResult)
      .sort((a, b) => (a.pivotIndex ?? 1e9) - (b.pivotIndex ?? 1e9));
  },

  valueColumns() {
    return this.allColumns.filter(c => !c.isPivotResult && !c.autoType && c.colDef.aggFunc);
  },

  // 리프 행의 피벗 키 문자열 (파이프라인마다 캐시)
  pivotKeyOf(node) {
    if (node.__pivotEpoch === this.pivotEpoch) return node.__pivotKey;
    const cols = this.__pivotColsCache || this.pivotColumns();
    const parts = cols.map(c => {
      const v = this.getCellValue(node, c);
      return v == null || v === '' ? '' : toText(v);
    });
    node.__pivotKey = JSON.stringify(parts);
    node.__pivotEpoch = this.pivotEpoch;
    return node.__pivotKey;
  },

  // 피벗 결과 컬럼 재구성 (데이터/피벗 설정이 바뀌었을 때만)
  applyPivotResultColumns(force = false) {
    const active = this.isPivotActive();
    const pcols = active ? this.pivotColumns() : [];
    this.pivotEpoch = (this.pivotEpoch || 0) + 1;
    this.__pivotColsCache = pcols;
    const vcols = this.valueColumns();
    // 키 수집 (필터 무관, 전체 행 기준)
    const keySet = new Map();
    if (pcols.length) {
      for (const n of this.rootNodes) {
        const k = this.pivotKeyOf(n);
        if (!keySet.has(k)) keySet.set(k, JSON.parse(k));
      }
    }
    const comparator = (a, b) => {
      for (let i = 0; i < pcols.length; i++) {
        const cmp = pcols[i].colDef.pivotComparator;
        const r = typeof cmp === 'function' ? cmp(a[i], b[i]) : defaultComparator(a[i], b[i]);
        if (r) return r;
      }
      return 0;
    };
    const keys = [...keySet.values()].sort(comparator);
    const sig = active && pcols.length ? JSON.stringify([pcols.map(c => c.colId), vcols.map(c => c.colId + c.colDef.aggFunc), keys]) : '';
    if (!force && sig === this.__pivotSig) return false;
    this.__pivotSig = sig;

    // 이전 결과 컬럼 제거
    const old = new Set(this.pivotResultColumns || []);
    if (old.size) {
      this.allColumns = this.allColumns.filter(c => !old.has(c));
      old.forEach(c => this.columnById.delete(c.colId));
      this.columnTree = this.columnTree.filter(x => !x.__pivotTree);
    }
    this.pivotResultColumns = [];
    if (!sig) {
      this.headerGroupDepth = this.allColumns.reduce((m, c) => Math.max(m, c.groupChain.length), 0);
      return true;
    }
    // 키 경로별 그룹 트리 생성
    const groupMap = new Map();
    const rootList = [];
    const suppressAgg = this.gos.suppressAggFuncInHeader;
    const prevById = this.__pivotPrevById || new Map();
    for (const key of keys) {
      const chain = [];
      let siblings = rootList;
      for (let lvl = 0; lvl < pcols.length; lvl++) {
        const gid = `pivot_${JSON.stringify(key.slice(0, lvl + 1))}`;
        let grp = groupMap.get(gid);
        if (!grp) {
          grp = new ColumnGroup({ headerName: key[lvl] === '' ? '(빈 값)' : key[lvl], pivotKeys: key.slice(0, lvl + 1) }, gid, lvl);
          grp.parent = chain[chain.length - 1] || null;
          if (lvl === 0) grp.__pivotTree = true;
          groupMap.set(gid, grp);
          siblings.push(grp);
        }
        chain.push(grp);
        siblings = grp.children;
      }
      for (const vc of vcols) {
        const colId = `pivot_${key.join('_')}_${vc.colId}`;
        const af = vc.colDef.aggFunc;
        const name = vc.colDef.headerName ?? vc.colId;
        const def = {
          colId,
          headerName: suppressAgg || typeof af !== 'string' ? name : `${af}(${name})`,
          aggFunc: af,
          valueFormatter: vc.colDef.valueFormatter,
          cellClass: vc.colDef.cellClass,
          cellStyle: vc.colDef.cellStyle,
          type: vc.colDef.type,
          pivotKeys: key,
          pivotValueColumn: vc.colId,
          sortable: true,
          resizable: true,
          width: vc.colDef.width ?? 150,
        };
        const prev = prevById.get(colId);
        const col = new Column(this, def, def, colId, chain.slice());
        if (prev) {
          col.width = prev.width;
          col.actualWidth = prev.actualWidth;
          col.sort = prev.sort;
          col.sortIndex = prev.sortIndex;
        }
        col.isPivotResult = true;
        col.pivotKeyString = JSON.stringify(key);
        col.pivotValueColumn = vc;
        siblings.push(col);
        this.pivotResultColumns.push(col);
        this.columnById.set(colId, col);
      }
    }
    this.__pivotPrevById = new Map(this.pivotResultColumns.map(c => [c.colId, c]));
    this.allColumns = [...this.allColumns, ...this.pivotResultColumns];
    this.columnTree = [...this.columnTree, ...rootList];
    this.headerGroupDepth = this.allColumns.reduce((m, c) => Math.max(m, c.groupChain.length), 0);
    return true;
  },

  // 피벗 모드에서 컬럼 표시 여부 (layoutColumns 에서 사용)
  isShownInPivot(col) {
    if (!this.isPivotActive()) return !col.isPivotResult;
    if (col.autoType) return true;
    if (col.isPivotResult) return true;
    // 피벗 컬럼이 없으면 값 컬럼을 그대로 표시
    return !this.pivotResultColumns?.length && !!col.colDef.aggFunc;
  },

  applyPivotModeChange() {
    this.groupsDirty = true;
    this.applyPivotResultColumns(true);
    this.columnsVersion++;
    this.layoutColumns();
    this.refreshModel({});
    this.notify();
    this.dispatch('columnPivotModeChanged', {});
    this.dispatch('displayedColumnsChanged', { source: 'api' });
  },

  setPivotMode(on) {
    this.pivotModeOverride = !!on;
    this.applyPivotModeChange();
  },

  setPivotColumns(keys, source = 'api') {
    const cols = this.getColumnsFromKeys(keys).filter(c => !c.isPivotResult);
    this.allColumns.forEach(c => {
      if (c.isPivotResult) return;
      const i = cols.indexOf(c);
      c.pivot = i >= 0;
      c.pivotIndex = i >= 0 ? i : null;
    });
    this.applyPivotResultColumns(true);
    this.columnsVersion++;
    this.layoutColumns();
    this.refreshModel({});
    this.notify();
    this.dispatch('columnPivotChanged', { columns: cols, source });
    this.dispatch('displayedColumnsChanged', { source });
  },

  // 행 그룹 없는 피벗: 전체 합계 1행
  runPivotTotalsOnly(preds) {
    const pass = preds.length ? n => preds.every(p => p(n)) : null;
    const leaves = pass ? this.rootNodes.filter(pass) : this.rootNodes;
    if (!this.pivotRootNode) {
      this.pivotRootNode = new RowNode(this, undefined, 'ROOT_NODE_ID');
    }
    const root = this.pivotRootNode;
    root.group = true;
    root.level = 0;
    root.key = null;
    root.childrenAfterFilter = leaves;
    root.childrenAll = leaves;
    root.allChildrenCount = leaves.length;
    root.selectable = false;
    this.aggregateNode(root, this.allColumns.filter(c => c.colDef.aggFunc), false);
    for (const n of this.rootNodes) {
      n.rowIndex = null;
      n.displayed = false;
    }
    root.rowIndex = 0;
    root.displayed = true;
    root.uiLevel = 0;
    this.filteredNodes = leaves;
    this.sortedNodes = [root];
    this.displayedNodes = [root];
  },
};
