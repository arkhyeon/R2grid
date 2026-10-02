// 행 그룹핑(rowGroup) / 트리데이터(treeData + getDataPath) / 집계(aggFunc) / 그룹 선택
// GridCore.prototype 에 합쳐지는 mixin. (this = GridCore)
import { RowNode } from './RowNode.js';
import { getFieldValue, toText } from './utils.js';

export const AUTO_GROUP_COL_ID = 'ag-Grid-AutoColumn';

const isNum = v => typeof v === 'number' && !Number.isNaN(v);

const BUILTIN_AGG = {
  sum: ({ values }) => {
    let s = 0;
    let any = false;
    for (const v of values) {
      if (isNum(v)) {
        s += v;
        any = true;
      }
    }
    return any ? s : null;
  },
  min: ({ values }) => {
    let m = null;
    for (const v of values) if (v != null && (m == null || v < m)) m = v;
    return m;
  },
  max: ({ values }) => {
    let m = null;
    for (const v of values) if (v != null && (m == null || v > m)) m = v;
    return m;
  },
  avg: ({ values }) => {
    let s = 0;
    let c = 0;
    for (const v of values) {
      if (isNum(v)) {
        s += v;
        c++;
      }
    }
    return c ? s / c : null;
  },
  first: ({ values }) => values[0] ?? null,
  last: ({ values }) => values[values.length - 1] ?? null,
};

export const groupingMethods = {
  isGroupMode() {
    return this.groupMode != null;
  },

  computeGroupMode() {
    if (!this.isClientSide()) return null;
    const g = this.gos;
    if (g.treeData && typeof g.getDataPath === 'function') return 'tree';
    if (this.allColumns.some(c => c.rowGroup)) return 'group';
    return null;
  },

  wantsAutoGroupColumn() {
    const g = this.gos;
    if (g.groupDisplayType === 'custom' || g.groupDisplayType === 'groupRows') return false;
    if (g.treeData && typeof g.getDataPath === 'function') return true;
    return (g.columnDefs || []).some(function hasGroup(d) {
      if (!d) return false;
      if (Array.isArray(d.children)) return d.children.some(hasGroup);
      return !!d.rowGroup || d.rowGroupIndex != null || !!d.initialRowGroup;
    });
  },

  rowGroupColumns() {
    const order = new Map(this.allColumns.map((c, i) => [c, i]));
    return this.allColumns
      .filter(c => c.rowGroup)
      .sort((a, b) => (a.rowGroupIndex ?? 1e9) - (b.rowGroupIndex ?? 1e9) || order.get(a) - order.get(b));
  },

  groupSelectsMode() {
    const rs = this.gos.rowSelection;
    const gs = rs && typeof rs === 'object' ? rs.groupSelects : null;
    return gs || (this.gos.groupSelectsChildren ? 'descendants' : 'self');
  },

  isGroupSelectsDescendants() {
    return this.isGroupMode() && this.groupSelectsMode() !== 'self';
  },

  defaultExpandedFor(node) {
    const fn = this.gos.isGroupOpenByDefault;
    if (typeof fn === 'function') {
      return !!fn({
        rowNode: node,
        field: node.field,
        key: node.key,
        level: node.level,
        rowGroupColumn: node.rowGroupColumn,
        api: this.api,
        context: this.gos.context,
      });
    }
    const d = this.gos.groupDefaultExpanded ?? 0;
    return d === -1 || node.level < d;
  },

  reuseGroupNode(cache, id, key, level, parent, field, col) {
    let node = this.groupNodeCache?.get(id);
    const isNew = !node;
    if (!node) node = new RowNode(this, undefined, id);
    node.group = true;
    node.key = key;
    node.level = level;
    node.parent = parent;
    node.field = field;
    node.rowGroupColumn = col;
    node.childrenAll = [];
    node.__filler = true;
    if (isNew) node.expanded = this.defaultExpandedFor(node);
    cache.set(id, node);
    return node;
  },

  buildGroups() {
    if (!this.groupNodeCache) this.groupNodeCache = new Map();
    const cache = new Map();
    let top = [];
    // 이전 그룹 노드 id 제거
    if (this.groupIds) this.groupIds.forEach(id => this.nodeById.delete(id));
    for (const n of this.rootNodes) {
      n.parent = null;
      n.childrenAll = null;
      n.group = false;
      n.level = 0;
    }
    if (this.groupMode === 'tree') {
      const getDataPath = this.gos.getDataPath;
      const ROOT = { childrenAll: [] };
      const childMap = new Map([[ROOT, new Map()]]);
      const kidsOf = n => {
        if (!n.childrenAll) n.childrenAll = [];
        return n.childrenAll;
      };
      const mapOf = n => {
        let m = childMap.get(n);
        if (!m) {
          m = new Map();
          childMap.set(n, m);
        }
        return m;
      };
      for (const node of this.rootNodes) {
        const path = getDataPath(node.data) || [];
        let parent = ROOT;
        for (let d = 0; d < path.length; d++) {
          const key = path[d];
          const map = mapOf(parent);
          const existing = map.get(key);
          const parentNode = parent === ROOT ? null : parent;
          if (d === path.length - 1) {
            if (existing && existing.__filler) {
              // 데이터 노드가 filler 그룹 자리를 차지 — 자식 승계
              node.childrenAll = existing.childrenAll;
              node.childrenAll.forEach(k => {
                k.parent = node;
              });
              childMap.set(node, childMap.get(existing) || new Map());
              const sib = kidsOf(parent);
              sib[sib.indexOf(existing)] = node;
              cache.delete(existing.id);
              map.set(key, node);
              if (node.__expInit !== true) {
                node.level = d;
                node.expanded = existing.expanded;
                node.__expInit = true;
              }
            } else {
              if (!existing) map.set(key, node);
              kidsOf(parent).push(node);
            }
            node.key = key;
            node.level = d;
            node.parent = parentNode;
          } else {
            let g = existing;
            if (!g) {
              const id = `row-group-${path.slice(0, d + 1).join('-')}`;
              g = this.reuseGroupNode(cache, id, key, d, parentNode, null, null);
              map.set(key, g);
              kidsOf(parent).push(g);
            }
            parent = g;
          }
        }
      }
      top = ROOT.childrenAll;
      // 자식을 가진 데이터 노드는 그룹으로
      const finalize = list =>
        list.forEach(n => {
          if (n.childrenAll && n.childrenAll.length) {
            n.group = true;
            if (n.data !== undefined && !n.__expInit) {
              n.expanded = this.defaultExpandedFor(n);
              n.__expInit = true;
            }
            finalize(n.childrenAll);
          } else if (n.data !== undefined) {
            n.childrenAll = null;
            n.group = false;
          }
        });
      finalize(top);
    } else {
      const cols = this.rowGroupColumns();
      const byId = new Map();
      for (const leaf of this.rootNodes) {
        let parentNode = null;
        let siblings = top;
        let prefix = 'row-group';
        for (let lvl = 0; lvl < cols.length; lvl++) {
          const col = cols[lvl];
          const v = this.getCellValue(leaf, col);
          const key = typeof col.colDef.keyCreator === 'function'
            ? col.colDef.keyCreator({ value: v, node: leaf, data: leaf.data, colDef: col.colDef, column: col, api: this.api, context: this.gos.context })
            : v == null || v === ''
              ? null
              : toText(v);
          const id = `${prefix}-${col.colId}-${key}`;
          let g = byId.get(id);
          if (!g) {
            g = this.reuseGroupNode(cache, id, key, lvl, parentNode, col.colDef.field, col);
            g.groupValue = v;
            siblings.push(g);
            byId.set(id, g);
          }
          parentNode = g;
          siblings = g.childrenAll;
          prefix = id;
        }
        leaf.level = cols.length;
        leaf.parent = parentNode;
        siblings.push(leaf);
      }
    }
    this.groupNodeCache = cache;
    this.groupIds = [...cache.keys()];
    cache.forEach((n, id) => this.nodeById.set(id, n));
    this.groupTop = top;
    this.groupsDirty = false;
  },

  aggregateNode(n, aggCols) {
    if (!n.group || !n.childrenAfterFilter) return;
    for (const c of n.childrenAfterFilter) this.aggregateNode(c, aggCols);
    if (!aggCols.length) {
      n.aggData = null;
      return;
    }
    const agg = {};
    for (const col of aggCols) {
      const af = col.colDef.aggFunc;
      const values = n.childrenAfterFilter.map(ch => this.getCellValue(ch, col));
      let fn = typeof af === 'function' ? af : this.gos.aggFuncs?.[af] || BUILTIN_AGG[af];
      if (af === 'count') {
        agg[col.colId] = n.childrenAfterFilter.reduce((s, ch) => s + (ch.group && ch.aggData ? ch.aggData[col.colId] || 0 : 1), 0);
        continue;
      }
      if (!fn) {
        agg[col.colId] = null;
        continue;
      }
      agg[col.colId] = fn({
        values,
        column: col,
        colDef: col.colDef,
        rowNode: n,
        data: n.data,
        api: this.api,
        context: this.gos.context,
      });
    }
    n.aggData = agg;
  },

  // 그룹 모드 파이프라인: 필터(조상 유지) → 집계 → 형제 정렬 → 펼침 상태로 평탄화
  runGroupPipeline(preds, sortCmp) {
    if (this.groupsDirty || !this.groupTop) this.buildGroups();
    const tree = this.groupMode === 'tree';
    const pass = preds.length ? n => preds.every(p => p(n)) : null;
    const passed = [];
    const includeAll = n => {
      if (n.data !== undefined) passed.push(n);
      if (n.childrenAll) {
        n.childrenAfterFilter = n.childrenAll;
        n.childrenAll.forEach(includeAll);
      }
    };
    const filterNode = n => {
      if (n.childrenAll && n.group) {
        if (tree && n.data !== undefined && (!pass || pass(n))) {
          includeAll(n);
          return true;
        }
        const kids = [];
        for (const c of n.childrenAll) if (filterNode(c)) kids.push(c);
        n.childrenAfterFilter = kids;
        return kids.length > 0;
      }
      const ok = !pass || pass(n);
      if (ok) passed.push(n);
      return ok;
    };
    const top = this.groupTop.filter(filterNode);
    const countLeaves = n => {
      if (!n.group || !n.childrenAfterFilter) return 1;
      let c = 0;
      for (const ch of n.childrenAfterFilter) c += ch.group ? countLeaves(ch) + (ch.data !== undefined ? 1 : 0) : 1;
      n.allChildrenCount = c;
      return c;
    };
    top.forEach(countLeaves);
    const aggCols = this.allColumns.filter(c => c.colDef.aggFunc);
    top.forEach(n => this.aggregateNode(n, aggCols));
    const sortList = list => {
      const arr = sortCmp ? list.slice().sort(sortCmp) : list;
      for (const c of arr) if (c.group && c.childrenAfterFilter) c.childrenAfterSort = sortList(c.childrenAfterFilter);
      return arr;
    };
    const sortedTop = sortList(top);
    const out = [];
    const flatten = list => {
      for (const n of list) {
        out.push(n);
        if (n.group && n.expanded && n.childrenAfterSort) flatten(n.childrenAfterSort);
      }
    };
    flatten(sortedTop);
    for (const n of this.rootNodes) {
      n.rowIndex = null;
      n.displayed = false;
    }
    if (this.groupNodeCache) {
      for (const n of this.groupNodeCache.values()) {
        n.rowIndex = null;
        n.displayed = false;
      }
    }
    for (let i = 0; i < out.length; i++) {
      out[i].rowIndex = i;
      out[i].displayed = true;
      out[i].uiLevel = out[i].level;
    }
    this.groupSortedTop = sortedTop;
    this.filteredNodes = passed;
    this.sortedNodes = out;
    this.displayedNodes = out;
  },

  // 자동 그룹 컬럼 값: 그룹=키, 트리 리프=키, 그룹핑 리프=autoGroupColumnDef.field
  getAutoGroupValue(node, col) {
    if (node.group || this.groupMode === 'tree') return node.key;
    const cd = col.colDef;
    if (typeof cd.valueGetter === 'function') return cd.valueGetter(this.makeValueParams(node, col));
    if (cd.field) return getFieldValue(node.data, cd.field);
    return undefined;
  },

  // forEachNode: 그룹 모드면 그룹 + 리프 깊이우선 (AG 동일)
  forEachNodeAll(cb) {
    if (!this.isGroupMode() || !this.groupTop) {
      this.rootNodes.forEach((n, i) => cb(n, i));
      return;
    }
    let i = 0;
    const walk = list =>
      list.forEach(n => {
        cb(n, i++);
        if (n.childrenAll) walk(n.childrenAll);
      });
    walk(this.groupTop);
  },

  groupDescendantsForSelection(node) {
    const filtered = this.groupSelectsMode() === 'filteredDescendants';
    const out = [];
    const walk = n => {
      const kids = filtered ? n.childrenAfterFilter : n.childrenAll;
      for (const c of kids || []) {
        if (c.data !== undefined && c.selectable) out.push(c);
        if (c.group) walk(c);
      }
    };
    if (node.data !== undefined && node.selectable) out.push(node);
    walk(node);
    return out;
  },

  getGroupSelectionState(node) {
    const list = this.groupDescendantsForSelection(node);
    if (!list.length) return false;
    let sel = 0;
    for (const n of list) if (n.selected) sel++;
    if (!sel) return false;
    return sel === list.length ? true : null;
  },

  setGroupSelected(node, value, source = 'api') {
    const list = this.groupDescendantsForSelection(node);
    if (!list.length) return;
    if (!value) {
      this.setNodesSelected(list, false, source);
      return;
    }
    if (this.rsOpts?.mode === 'singleRow') {
      this.setNodeSelected(list[0], true, true, source);
      return;
    }
    this.setNodesSelected(list, true, source);
  },
};
