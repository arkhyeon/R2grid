// 행 드래그: rowDragManaged / rowDragEntireRow / rowDragMultiRow / colDef.rowDrag
// 이벤트: rowDragEnter / rowDragMove / rowDragLeave / rowDragEnd / rowDragCancel
import { getFieldValue, setFieldValue } from './utils.js';

export const rowDragMethods = {
  isRowDragEnabled() {
    const g = this.gos;
    if (g.suppressRowDrag) return false;
    return !!g.rowDragEntireRow || this.allColumns.some(c => !!c.colDef.rowDrag);
  },

  // 셀에 드래그 핸들을 그릴지
  showRowDragHandle(node, column) {
    if (this.gos.suppressRowDrag || node.rowPinned || node.detail || node.stub) return false;
    const rd = column.colDef.rowDrag;
    if (!rd) return false;
    if (typeof rd === 'function') return !!rd({ ...this.makeValueParams(node, column), rowIndex: node.rowIndex });
    return true;
  },

  // managed 이동 가능 여부 (정렬/필터/그룹 중에는 managed 이동 안 함)
  isManagedMoveAllowed() {
    if (!this.gos.rowDragManaged) return false;
    if (!this.isClientSide()) return false;
    if (this.isGroupMode() && !this.isTreeDragManaged()) return false;
    if (this.allColumns.some(c => c.sort)) return false;
    if (this.isAnyFilterPresent()) return false;
    return true;
  },

  // 트리 데이터 managed 이동: 부모가 데이터에 있는 방식(treeDataParentIdField · treeDataChildrenField)만
  //  (getDataPath 는 경로가 데이터에서 계산되므로 rowDragEnd 에서 직접 데이터를 바꿔야 함)
  isTreeDragManaged() {
    const g = this.gos;
    return this.groupMode === 'tree' && typeof g.getDataPath !== 'function' && !!(g.treeDataParentIdField || g.treeDataChildrenField);
  },

  // 트리 놓을 자리: 위 1/4 = above, 아래 1/4 = below, 가운데 = inside(그 행의 자식으로)
  treeDropPosition(overNode, y, pi) {
    const top = this.rowTopAt(pi);
    const h = this.rowHeightAt(pi);
    if (y < top + h / 4) return 'above';
    if (y > top + (h * 3) / 4) return 'below';
    return 'inside';
  },

  // a 가 b 의 조상(또는 자신)인지
  isTreeAncestor(a, b) {
    for (let n = b; n; n = n.parent) if (n === a) return true;
    return false;
  },

  // 끄는 행을 overNode 의 위/아래/안으로 옮김. 부모 링크(필드 또는 children 링크)와 형제 순서(rootNodes 순서)를 바꿈
  moveTreeNodes(nodes, overNode, position) {
    const g = this.gos;
    // 함께 끄는 조상이 있으면 그 자손은 따로 옮기지 않음
    const movers = nodes.filter(n => !nodes.some(o => o !== n && this.isTreeAncestor(o, n)));
    if (movers.some(n => this.isTreeAncestor(n, overNode))) return null;
    const newParent = position === 'inside' ? overNode : overNode.parent && overNode.parent.data ? overNode.parent : null;
    // 부모 id 값 타입은 데이터에 이미 있는 부모 id 를 따름 (숫자 id 면 숫자로)
    let pidValue = null;
    if (newParent && g.treeDataParentIdField) {
      const sample = this.rootNodes.map(n => getFieldValue(n.data, g.treeDataParentIdField)).find(v => v != null && v !== '');
      pidValue = typeof sample === 'number' && /^-?\d+(\.\d+)?$/.test(newParent.id) ? Number(newParent.id) : newParent.id;
    }
    for (const n of movers) {
      if (g.treeDataParentIdField) setFieldValue(n.data, g.treeDataParentIdField, pidValue);
      else {
        const map = (this.treeChildParent ||= new Map());
        if (newParent) map.set(n.data, newParent.data);
        else map.delete(n.data);
      }
    }
    // 형제 순서: rootNodes 에서 옮길 행을 대상 앞/뒤(안쪽이면 맨 뒤 = 마지막 자식)로
    const rest = this.rootNodes.filter(n => !movers.includes(n));
    const moving = this.rootNodes.filter(n => movers.includes(n));
    let at = rest.length;
    if (position !== 'inside') {
      const i = rest.indexOf(overNode);
      at = i < 0 ? rest.length : position === 'above' ? i : i + 1;
    }
    rest.splice(at, 0, ...moving);
    rest.forEach((n, i) => {
      n.sourceRowIndex = i;
    });
    this.rootNodes = rest;
    if (position === 'inside' && !overNode.expanded) overNode.expanded = true;
    this.groupsDirty = true;
    this.refreshModel({ keepRenderedRows: true });
    return newParent;
  },

  rowDragText(node, nodes, column) {
    const fn = column?.colDef.rowDragText || this.gos.rowDragText;
    // 기본: 드래그를 시작한 셀(없으면 첫 컬럼)의 값
    const src = column && !column.isAuto ? column : this.displayedColumns.find(c => !c.isAuto);
    const defaultTextValue = nodes.length > 1 ? `${nodes.length} rows` : src ? this.getCellText(node, src) : '';
    if (typeof fn === 'function') {
      return fn({ rowNode: node, rowNodes: nodes, defaultTextValue, rowIndex: node.rowIndex, column }, nodes.length);
    }
    return defaultTextValue;
  },

  dragEventParams(type, overIndex, y, event, vDirection) {
    const d = this.rowDragState;
    const overNode = overIndex != null && overIndex >= 0 ? this.displayedNodes[overIndex] : undefined;
    return { node: d.node, nodes: d.nodes, overIndex: overIndex ?? -1, overNode, y, vDirection, event };
  },

  rowDragStart(node, event, column) {
    const multi = this.gos.rowDragMultiRow && node.selected && this.selected.size > 1;
    const nodes = multi
      ? this.getSelectedNodes().filter(n => n.displayed).sort((a, b) => a.rowIndex - b.rowIndex)
      : [node];
    this.rowDragState = { node, nodes, lastY: event.clientY, overIndex: node.rowIndex, column };
    nodes.forEach(n => {
      n.__dragging = true;
    });
    this.notify();
    this.dispatch('rowDragEnter', this.dragEventParams('rowDragEnter', node.rowIndex, 0, event, null));
    return this.rowDragText(node, nodes, column);
  },

  rowDragMove(overIndex, y, event) {
    const d = this.rowDragState;
    if (!d) return;
    const vDirection = event.clientY > d.lastY ? 'down' : event.clientY < d.lastY ? 'up' : null;
    d.lastY = event.clientY;
    d.overIndex = overIndex;
    const overNode = this.displayedNodes[overIndex];
    // 트리: 위/아래/안 자리를 표시해 두고 놓을 때 이동. 접힌 행 안쪽에 rowDragInsertDelay(기본 500ms) 머무르면 펼침
    if (overNode && !overNode.detail && !overNode.footer && this.isManagedMoveAllowed() && this.isTreeDragManaged()) {
      const pi = overIndex - this.pageFirstRow;
      const position = this.treeDropPosition(overNode, y, pi);
      const bad = d.nodes.some(n => this.isTreeAncestor(n, overNode)) || !this.rowDropAllowed(d.nodes, overNode, position, position === 'inside' ? overNode : overNode.parent?.data ? overNode.parent : null);
      if (bad) {
        d.pending = null;
        this.setRowDropPositionIndicator(null);
      } else {
        d.pending = { overNode, position };
        this.setRowDropPositionIndicator({ row: overNode, dropIndicatorPosition: position });
      }
      const hoverKey = position === 'inside' ? overNode : null;
      if (d.hoverNode !== hoverKey) {
        d.hoverNode = hoverKey;
        clearTimeout(d.hoverTimer);
        if (hoverKey && !bad && overNode.group && !overNode.expanded) {
          d.hoverTimer = setTimeout(() => {
            if (this.rowDragState === d && d.hoverNode === overNode) overNode.setExpanded(true);
          }, this.gos.rowDragInsertDelay ?? 500);
        }
      }
      this.dispatch('rowDragMove', this.dragEventParams('rowDragMove', overIndex, y, event, vDirection));
      return;
    }
    if (overNode && !overNode.detail && !d.nodes.includes(overNode) && this.isManagedMoveAllowed()) {
      // 놓을 위치: 행의 위쪽 절반이면 위, 아래쪽 절반이면 아래
      const pi = overIndex - this.pageFirstRow;
      const top = this.rowTopAt(pi);
      const position = y < top + this.rowHeightAt(pi) / 2 ? 'above' : 'below';
      if (!this.rowDropAllowed(d.nodes, overNode, position)) {
        d.pending = null;
        this.setRowDropPositionIndicator(null);
      } else if (this.gos.suppressMoveWhenRowDragging) {
        // 끄는 동안은 자리만 표시하고 놓을 때 이동
        d.pending = { overNode, position };
        this.setRowDropPositionIndicator({ row: overNode, dropIndicatorPosition: position });
      } else {
        this.moveNodesManaged(d.nodes, overNode);
      }
    }
    this.dispatch('rowDragMove', this.dragEventParams('rowDragMove', overIndex, y, event, vDirection));
  },

  // isRowValidDropPosition: false 를 돌려주면 그 자리로는 이동하지 않음
  rowDropAllowed(nodes, target, position, newParent) {
    const fn = this.gos.isRowValidDropPosition;
    if (typeof fn !== 'function') return true;
    return fn({ source: nodes[0], rows: nodes, target, position, newParent: newParent !== undefined ? newParent : target?.parent ?? null, api: this.api, context: this.gos.context }) !== false;
  },

  // 드롭 위치 표시줄 (setRowDropPositionIndicator / getRowDropPositionIndicator)
  setRowDropPositionIndicator(params) {
    const next = params?.row && params.dropIndicatorPosition && params.dropIndicatorPosition !== 'none' ? { row: params.row, dropIndicatorPosition: params.dropIndicatorPosition } : null;
    const prev = this.rowDropIndicator;
    if (prev?.row === next?.row && prev?.dropIndicatorPosition === next?.dropIndicatorPosition) return;
    this.rowDropIndicator = next;
    this.notify();
  },

  getRowDropPositionIndicator() {
    return this.rowDropIndicator ? { ...this.rowDropIndicator } : { row: null, dropIndicatorPosition: 'none' };
  },

  // 놓을 자리(위/아래) 지정 이동
  moveNodesManagedTo(nodes, overNode, position) {
    const set = new Set(nodes);
    const rest = this.rootNodes.filter(n => !set.has(n));
    const overIdx = rest.indexOf(overNode);
    if (overIdx < 0) return;
    rest.splice(position === 'above' ? overIdx : overIdx + 1, 0, ...nodes);
    rest.forEach((n, i) => {
      n.sourceRowIndex = i;
    });
    this.rootNodes = rest;
    this.refreshModel({ keepRenderedRows: true, silent: true });
  },

  moveNodesManaged(nodes, overNode) {
    const set = new Set(nodes);
    const origOver = this.rootNodes.indexOf(overNode);
    const origFirst = this.rootNodes.indexOf(nodes[0]);
    const rest = this.rootNodes.filter(n => !set.has(n));
    const overIdx = rest.indexOf(overNode);
    if (overIdx < 0) return;
    const insertAt = origOver > origFirst ? overIdx + 1 : overIdx;
    rest.splice(insertAt, 0, ...nodes);
    rest.forEach((n, i) => {
      n.sourceRowIndex = i;
    });
    this.rootNodes = rest;
    this.refreshModel({ keepRenderedRows: true, silent: true });
  },

  rowDragLeave(event) {
    if (!this.rowDragState) return;
    this.dispatch('rowDragLeave', this.dragEventParams('rowDragLeave', -1, 0, event, null));
  },

  // ── 행 드롭 영역 (다른 그리드/임의 요소로 행 끌어 놓기 — addRowDropZone) ──
  //  params: { getContainer(): HTMLElement, onDragEnter?, onDragLeave?, onDragging?, onDragStop?, onDragCancel? }
  addRowDropZone(params) {
    if (!params || typeof params.getContainer !== 'function') return;
    if (!this.rowDropZones) this.rowDropZones = [];
    if (this.rowDropZones.some(z => z.params === params)) return;
    this.rowDropZones.push({ params, inside: false });
  },

  removeRowDropZone(params) {
    if (!this.rowDropZones) return;
    const el = params?.getContainer?.();
    this.rowDropZones = this.rowDropZones.filter(z => z.params !== params && (!el || z.params.getContainer() !== el));
  },

  // 이 그리드를 드롭 대상으로 쓰는 파라미터 — 콜백 인자에 이 그리드 기준 overIndex/overNode/y 를 채움
  getRowDropZoneParams(events = {}) {
    const core = this;
    const wrap = fn => (typeof fn === 'function' ? p => fn({ ...p, ...core.rowDropTargetInfo(p.event) }) : undefined);
    return {
      getContainer: () => core.eRoot?.querySelector('.r2-body-viewport') || core.eRoot,
      onDragEnter: wrap(events.onDragEnter),
      onDragLeave: wrap(events.onDragLeave),
      onDragging: wrap(events.onDragging),
      onDragStop: wrap(events.onDragStop),
      onDragCancel: wrap(events.onDragCancel),
    };
  },

  rowDropTargetInfo(event) {
    const vp = this.eRoot?.querySelector('.r2-body-viewport');
    if (!vp || !event) return { overIndex: -1, overNode: undefined, y: 0 };
    const r = vp.getBoundingClientRect();
    const y = (this.viewport?.getScrollTop() ?? vp.scrollTop) + Math.max(0, event.clientY - r.top);
    const count = this.getRowCountInPage?.() ?? this.displayedNodes.length;
    const inside = y < (this.pageHeight || 0);
    const overIndex = count && inside ? this.pageFirstRow + this.indexAtPixel(y) : -1;
    return { overIndex, overNode: overIndex >= 0 ? this.displayedNodes[overIndex] : undefined, y };
  },

  // 드래그 중 포인터 위치로 드롭 영역 진입/이탈/이동/놓기 콜백 (phase: move | end | cancel)
  updateRowDropZones(event, phase) {
    const zones = this.rowDropZones;
    const d = this.rowDragState;
    if (!zones?.length || !d) return;
    for (const z of zones) {
      const el = z.params.getContainer?.();
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      const base = { type: '', event, node: d.node, nodes: d.nodes, overIndex: -1, overNode: undefined, y: 0, vDirection: null, api: this.api, context: this.gos.context };
      if (phase === 'move') {
        if (inside && !z.inside) z.params.onDragEnter?.({ ...base, type: 'rowDragEnter' });
        if (!inside && z.inside) z.params.onDragLeave?.({ ...base, type: 'rowDragLeave' });
        if (inside) z.params.onDragging?.({ ...base, type: 'rowDragMove' });
        z.inside = inside;
      } else {
        if (z.inside || inside) {
          if (phase === 'cancel') z.params.onDragCancel?.({ ...base, type: 'rowDragCancel' });
          else z.params.onDragStop?.({ ...base, type: 'rowDragEnd' });
        }
        z.inside = false;
      }
    }
  },

  rowDragEnd(event, overIndex, y, cancelled = false) {
    const d = this.rowDragState;
    if (!d) return;
    clearTimeout(d.hoverTimer);
    let treeMove = null;
    if (d.pending && !cancelled) {
      if (this.isTreeDragManaged()) treeMove = { newParent: this.moveTreeNodes(d.nodes, d.pending.overNode, d.pending.position), position: d.pending.position };
      else this.moveNodesManagedTo(d.nodes, d.pending.overNode, d.pending.position);
    }
    if (this.rowDropIndicator) this.setRowDropPositionIndicator(null);
    this.rowDragState = null;
    d.nodes.forEach(n => {
      n.__dragging = false;
    });
    this.notify();
    this.rowDragState = d;
    const params = this.dragEventParams(cancelled ? 'rowDragCancel' : 'rowDragEnd', overIndex ?? d.overIndex, y, event, null);
    // 트리 이동 결과: 새 부모 행(최상위면 null)·놓은 자리
    if (treeMove) Object.assign(params, { newParent: treeMove.newParent, dropPosition: treeMove.position });
    this.rowDragState = null;
    this.dispatch(cancelled ? 'rowDragCancel' : 'rowDragEnd', params);
  },
};
