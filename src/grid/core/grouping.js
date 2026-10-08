// 행 그룹핑(rowGroup) / 트리데이터(treeData + getDataPath) / 집계(aggFunc) / 그룹 선택
// GridCore.prototype 에 합쳐지는 mixin. (this = GridCore)
import { RowNode } from './RowNode.js';
import { getFieldValue, toText } from './utils.js';
import { localeText } from './locale.js';

export const AUTO_GROUP_COL_ID = 'r2-Grid-AutoColumn';

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
    if (g.treeData && (typeof g.getDataPath === 'function' || g.treeDataChildrenField || g.treeDataParentIdField)) return 'tree';
    if (this.allColumns.some(c => c.rowGroup)) return 'group';
    return null;
  },

  wantsAutoGroupColumn(leaves) {
    const g = this.gos;
    if (g.pivotSuppressAutoColumn && this.isPivotActive?.()) return false;
    if (g.groupDisplayType === 'custom' || g.groupDisplayType === 'groupRows') return false;
    if (g.treeData && (typeof g.getDataPath === 'function' || g.treeDataChildrenField || g.treeDataParentIdField || (g.rowModelType === 'serverSide' && typeof g.isServerSideGroup === 'function'))) return true;
    // 컬럼 상태 기준 (api/패널로 바뀐 그룹 반영)
    if (leaves) return leaves.some(c => c.rowGroup);
    return (g.columnDefs || []).some(function hasGroup(d) {
      if (!d) return false;
      if (Array.isArray(d.children)) return d.children.some(hasGroup);
      return !!d.rowGroup || d.rowGroupIndex != null || !!d.initialRowGroup;
    });
  },

  // groupDisplayType 'multipleColumns' (groupHideOpenParents 는 multipleColumns 를 함께 켬 — AG 동일)
  isMultipleGroupColumns() {
    const g = this.gos;
    return g.groupDisplayType === 'multipleColumns' || !!g.groupHideOpenParents;
  },

  isGroupRowsDisplay() {
    return this.gos.groupDisplayType === 'groupRows' && this.groupMode === 'group';
  },

  isFirstDisplayedDescendant(node, anc) {
    return anc.__firstDisplayed === node;
  },

  // 행의 레벨 lvl 조상 그룹 (자기 자신 포함)
  ancestorAtLevel(node, lvl) {
    let n = node.group ? node : node.parent;
    while (n && n.level > lvl) n = n.parent;
    return n && n.level === lvl ? n : null;
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
    return (this.isGroupMode() || this.ssrmTreeMode?.()) && this.groupSelectsMode() !== 'self';
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

  // 트리 경로: getDataPath 또는 (AG v33+) treeDataParentIdField / treeDataChildrenField 에서 id 경로를 만듦
  treeDataPathFn() {
    const g = this.gos;
    if (typeof g.getDataPath === 'function') return g.getDataPath;
    const idOf = new Map(this.rootNodes.map(n => [n.data, n.id]));
    if (g.treeDataParentIdField) {
      const byId = new Map(this.rootNodes.map(n => [String(n.id), n.data]));
      const f = g.treeDataParentIdField;
      return data => {
        const path = [];
        const seen = new Set();
        for (let d = data; d && !seen.has(d); ) {
          seen.add(d);
          path.unshift(String(idOf.get(d)));
          const pid = getFieldValue(d, f);
          d = pid == null || pid === '' ? null : byId.get(String(pid));
        }
        return path;
      };
    }
    // treeDataChildrenField: setRowData 에서 펼친 부모 링크 사용
    const parentOf = this.treeChildParent || new Map();
    return data => {
      const path = [];
      for (let d = data; d; d = parentOf.get(d)) path.unshift(String(idOf.get(d)));
      return path;
    };
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
      const getDataPath = this.treeDataPathFn();
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
          if (key == null && this.gos.groupAllowUnbalanced) break;
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
        leaf.level = parentNode ? parentNode.level + 1 : 0;
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

  // 합계 행 위치: groupTotalRow / grandTotalRow (레거시 groupIncludeFooter / groupIncludeTotalFooter)
  groupTotalPosition(node) {
    const g = this.gos;
    const v = g.groupTotalRow ?? (g.groupIncludeFooter ? 'bottom' : undefined);
    if (typeof v === 'function') return v({ node, api: this.api, context: g.context });
    return v;
  },

  grandTotalPosition() {
    const g = this.gos;
    return g.grandTotalRow ?? (g.groupIncludeTotalFooter ? 'bottom' : undefined);
  },

  // 합계(footer) 노드: 그룹 노드와 같은 aggData/key 를 갖는 별도 행 (id: rowGroupFooter_<그룹 id>)
  getFooterNode(group) {
    if (!this.footerCache) this.footerCache = new Map();
    const id = `rowGroupFooter_${group ? group.id : 'ROOT_NODE_ID'}`;
    let f = this.footerCache.get(id);
    if (!f) {
      f = new RowNode(this, undefined, id);
      this.footerCache.set(id, f);
    }
    f.group = true;
    f.footer = true;
    f.sibling = group;
    f.key = group ? group.key : null;
    f.level = group ? group.level : -1;
    f.parent = group ? group.parent : null;
    f.rowGroupColumn = group ? group.rowGroupColumn : null;
    f.groupValue = group ? group.groupValue : null;
    f.childrenAll = null;
    f.selectable = false;
    f.allChildrenCount = group ? group.allChildrenCount : null;
    return f;
  },

  aggregateNode(n, aggCols, recurse = true) {
    if (!n.group || !n.childrenAfterFilter) return;
    // suppressAggFilteredOnly: 필터와 무관하게 전체 자식으로 집계
    const all = this.gos.suppressAggFilteredOnly && n.childrenAll ? n.childrenAll : null;
    if (recurse) for (const c of all || n.childrenAfterFilter) this.aggregateNode(c, aggCols);
    if (all) {
      const saved = n.childrenAfterFilter;
      n.childrenAfterFilter = all;
      try {
        this.aggregateOwn(n, aggCols);
      } finally {
        n.childrenAfterFilter = saved;
      }
      return;
    }
    this.aggregateOwn(n, aggCols);
  },

  aggregateOwn(n, aggCols) {
    // getGroupRowAgg: 그룹 행 집계를 직접 (AG 동일 — 다른 컬럼 값을 함께 써야 할 때)
    if (typeof this.gos.getGroupRowAgg === 'function') {
      n.aggData = this.gos.getGroupRowAgg({ nodes: n.childrenAfterFilter, api: this.api, context: this.gos.context }) || null;
      return;
    }
    if (!aggCols.length) {
      n.aggData = null;
      return;
    }
    const agg = {};
    for (const col of aggCols) {
      const af = col.colDef.aggFunc;
      // 피벗 결과 컬럼: 피벗 키가 일치하는 리프만 대상 (값은 원본 값 컬럼에서)
      const pk = col.pivotKeyString;
      const prefix = col.pivotKeyPrefix;
      const leafOk = prefix
        ? ch => {
            if (!prefix.length) return true;
            const arr = this.pivotKeyArrOf(ch);
            for (let i = 0; i < prefix.length; i++) if (arr[i] !== prefix[i]) return false;
            return true;
          }
        : ch => pk == null || this.pivotKeyOf(ch) === pk;
      const valueCol = col.pivotValueColumn || col;
      const kids = n.childrenAfterFilter.filter(ch => ch.group || leafOk(ch));
      // 자식 그룹은 표시값(합계행 때문에 비울 수 있음)이 아닌 aggData 를 직접 사용
      const values = kids
        .map(ch => (ch.group ? (ch.aggData && col.colId in ch.aggData ? ch.aggData[col.colId] : pk != null ? undefined : this.getCellValue(ch, col)) : this.getCellValue(ch, valueCol)))
        .filter(v => pk == null || v !== undefined);
      let fn = typeof af === 'function' ? af : this.gos.aggFuncs?.[af] || BUILTIN_AGG[af];
      if (af === 'count') {
        agg[col.colId] = kids.reduce((s, ch) => s + (ch.group ? (ch.aggData ? ch.aggData[col.colId] || 0 : 0) : 1), 0);
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
          // excludeChildrenWhenTreeDataFiltering: 통과한 부모의 자식도 각자 필터 (기본은 자식 전부 포함)
          if (!this.gos.excludeChildrenWhenTreeDataFiltering) {
            includeAll(n);
            return true;
          }
          passed.push(n);
          const kids = [];
          for (const c of n.childrenAll) if (filterNode(c)) kids.push(c);
          n.childrenAfterFilter = kids;
          return true;
        }
        // groupAggFiltering: 그룹 행의 집계값으로 필터 — 통과하면 자식 전부 포함
        if (aggFilter && pass && aggFilter(n) && pass(n)) {
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
    // groupAggFiltering: 필터 전에 전체로 집계해 그룹 행 값으로 거를 수 있게
    const gaf = this.gos.groupAggFiltering;
    const aggFilter = gaf && !tree ? (typeof gaf === 'function' ? n => !!gaf({ node: n }) : () => true) : null;
    if (aggFilter && pass) {
      const aggColsPre = this.allColumns.filter(c => c.colDef.aggFunc);
      const prep = n => {
        if (!n.childrenAll) return;
        n.childrenAfterFilter = n.childrenAll;
        n.childrenAll.forEach(prep);
      };
      this.groupTop.forEach(prep);
      this.groupTop.forEach(n => this.aggregateNode(n, aggColsPre));
    }
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
    // groupMaintainOrder: 그룹 컬럼이 아닌 컬럼으로 정렬하면 그룹 순서는 그대로
    const sortsGroups = this.allColumns.some(c => c.sort && (c.autoType === 'group' || c.rowGroup));
    const keepGroupOrder = !!this.gos.groupMaintainOrder && !sortsGroups;
    const initCmp = this.gos.initialGroupOrderComparator;
    const sortList = list => {
      const allGroups = list.length > 0 && list.every(x => x.group);
      let arr = list;
      if (sortCmp && !(keepGroupOrder && allGroups)) arr = list.slice().sort(sortCmp);
      else if (!sortCmp && allGroups && typeof initCmp === 'function') arr = list.slice().sort((a, b) => initCmp({ nodeA: a, nodeB: b, api: this.api, context: this.gos.context }));
      for (const c of arr) if (c.group && c.childrenAfterFilter) c.childrenAfterSort = sortList(c.childrenAfterFilter);
      return arr;
    };
    const sortedTop = sortList(top);
    const out = [];
    const hideOpen = !!this.gos.groupHideOpenParents;
    const pivot = this.isPivotActive?.();
    const flatten = list => {
      for (const n of list) {
        // 피벗 모드: 리프(데이터) 행은 표시하지 않음
        if (pivot && !n.group) continue;
        // groupHideParentOfSingleChild: 자식이 하나뿐인 그룹은 그룹 행 대신 자식을 바로 (true | 'leafGroupsOnly')
        const hps = this.gos.groupHideParentOfSingleChild;
        if (hps && n.group && n.childrenAfterSort?.length === 1 && (hps === true || !n.childrenAfterSort[0].group) && !pivot) {
          flatten(n.childrenAfterSort);
          continue;
        }
        // groupHideOpenParents: 펼친 그룹 행 자체는 숨기고 자식만 (값은 첫 자식의 그룹 컬럼에 표시)
        const hidden = hideOpen && n.group && n.expanded && n.childrenAfterSort?.length;
        if (!hidden) out.push(n);
        n.__firstDisplayed = null;
        n.__footerShown = false;
        if (n.group && n.expanded && n.childrenAfterSort) {
          flatten(n.childrenAfterSort);
          if (this.groupTotalPosition(n) === 'bottom') {
            const f = this.getFooterNode(n);
            f.aggData = n.aggData;
            out.push(f);
            n.__footerShown = true;
          }
        }
      }
    };
    flatten(sortedTop);
    // 각 그룹의 첫 표시 자손 (groupHideOpenParents 값 표시 위치)
    if (hideOpen) {
      for (const r of out) {
        let a = r.parent;
        while (a) {
          if (a.__firstDisplayed == null) a.__firstDisplayed = r;
          a = a.parent;
        }
      }
    }
    // 총합계 행
    const grandPos = this.grandTotalPosition();
    this.grandTotalPinned = null;
    if (grandPos) {
      const root = this.getFooterNode(null);
      root.childrenAfterFilter = top;
      this.aggregateNode(root, aggCols, false);
      root.allChildrenCount = top.reduce((s, n) => s + (n.group ? n.allChildrenCount || 0 : 1), 0);
      if (grandPos === 'top') out.unshift(root);
      else if (grandPos === 'bottom') out.push(root);
      else if (grandPos === 'pinnedTop' || grandPos === 'pinnedBottom') {
        root.rowPinned = grandPos === 'pinnedTop' ? 'top' : 'bottom';
        this.grandTotalPinned = root;
      }
    }
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
    if (this.footerCache) {
      for (const n of this.footerCache.values()) {
        if (n.rowPinned) continue;
        n.rowIndex = null;
        n.displayed = false;
      }
    }
    for (let i = 0; i < out.length; i++) {
      out[i].rowIndex = i;
      out[i].displayed = true;
      out[i].uiLevel = Math.max(0, out[i].level);
    }
    this.mergePinnedRows?.();
    this.groupSortedTop = sortedTop;
    this.filteredNodes = passed;
    this.sortedNodes = out;
    this.displayedNodes = out;
  },

  // 자동 그룹 컬럼 값: 그룹=키, 트리 리프=키, 그룹핑 리프=autoGroupColumnDef.field
  getAutoGroupValue(node, col) {
    if (node.footer) {
      const total = localeText(this, 'footerTotal', 'Total');
      return node.sibling ? `${total} ${node.key ?? ''}` : total;
    }
    // multipleColumns: 이 컬럼이 담당하는 레벨의 그룹 키만 표시
    if (col.groupIndex != null) {
      const lvl = col.groupIndex;
      if (node.group && node.level === lvl) return node.key;
      const anc = this.ancestorAtLevel(node, lvl);
      if (!anc || anc === node) return undefined;
      // showOpenedGroup: 펼친 그룹의 키를 하위 모든 행에 / groupHideOpenParents: 숨겨진 부모 키를 첫 자식에
      if (this.gos.showOpenedGroup) return anc.key;
      if (this.gos.groupHideOpenParents && this.isFirstDisplayedDescendant(node, anc)) return anc.key;
      return undefined;
    }
    const cd = col.colDef;
    // 트리: autoGroupColumnDef 에 field / valueGetter 를 주면 키 대신 그 값 (treeDataChildrenField · ParentIdField 에서 주로 사용)
    const agd = this.gos.autoGroupColumnDef;
    if ((this.groupMode === 'tree' || node.__ssrmTree) && node.data !== undefined && (agd?.field || agd?.valueGetter)) {
      if (typeof cd.valueGetter === 'function') return cd.valueGetter(this.makeValueParams(node, col));
      if (cd.field) return getFieldValue(node.data, cd.field);
    }
    if (node.group || this.groupMode === 'tree' || node.__ssrmTree) return node.key;
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
    if (node.__ssrmGroup) return this.ssrmGroupState(node);
    const list = this.groupDescendantsForSelection(node);
    if (!list.length) return false;
    let sel = 0;
    for (const n of list) if (n.selected) sel++;
    if (!sel) return false;
    return sel === list.length ? true : null;
  },

  setGroupSelected(node, value, source = 'api') {
    if (node.__ssrmGroup) {
      this.ssrmSetGroupSelected(node, value, source);
      return;
    }
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
