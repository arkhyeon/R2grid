// 바디: 세로 스크롤 뷰포트 안에 좌고정 / 중앙(가로 스크롤) / 우고정 컨테이너 + 전체폭(디테일) 행
// - 세로/가로 가상화, 1000만 px 초과 시 높이 스트레칭(브라우저 div 높이 한계 회피)
// - 상단/하단 고정행(floating), 그룹/트리 셀, 행 드래그, SSRM 블록 로드
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clamp, cx, docOf, winOf } from '../core/utils.js';
import { Icon } from './common.jsx';
import { DragImage, PopupLayer } from './popup.jsx';
import { isEditableEl } from './bodyCells.jsx';
import { rowProps, Row, GroupFullRow, LoadingFullRow, FullWidthRow, DetailRow } from './bodyRows.jsx';

const MAX_DIV_HEIGHT = 10_000_000;

// ── 바디 ───────────────────────────────────────────────────
export function GridBody({ core, headerVpRef, focusSinkRef, onScrollbarWidth }) {
  const bodyVpRef = useRef(null);
  const centerVpRef = useRef(null);
  const hScrollRef = useRef(null);
  const floatTopRef = useRef(null);
  const floatBottomRef = useRef(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [size, setSize] = useState({ h: 0, w: 0, cw: 0, sbw: 0 });
  const [dragGhost, setDragGhost] = useState(null);
  const rafRef = useRef(0);
  const metrics = useRef({ ratio: 1 });
  const g = core.gos;
  const autoLayout = g.domLayout === 'autoHeight' || g.domLayout === 'print';

  const schedule = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const top = bodyVpRef.current?.scrollTop ?? 0;
      const left = hScrollRef.current?.scrollLeft ?? 0;
      setScroll(p => (p.top === top && p.left === left ? p : { top, left }));
    });
  };

  const syncLeft = left => {
    if (centerVpRef.current) centerVpRef.current.scrollLeft = left;
    if (headerVpRef.current) headerVpRef.current.scrollLeft = left;
    if (floatTopRef.current) floatTopRef.current.scrollLeft = left;
    if (floatBottomRef.current) floatBottomRef.current.scrollLeft = left;
  };

  // 크기 측정
  useLayoutEffect(() => {
    const el = bodyVpRef.current;
    const cvp = centerVpRef.current;
    if (!el) return undefined;
    const measure = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      const sbw = el.offsetWidth - el.clientWidth;
      const cw = cvp ? cvp.clientWidth : w;
      setSize(p => (p.h === h && p.w === w && p.cw === cw && p.sbw === sbw ? p : { h, w, cw, sbw }));
      onScrollbarWidth?.(sbw);
      core.setViewportSize(w, h);
    };
    measure();
    // RO 콜백에서 동기 측정 → flex 재계산·스크롤바 변화로 같은 프레임에 다시 리사이즈되면
    // "ResizeObserver loop completed with undelivered notifications" 발생 → 다음 프레임으로 미룸
    let roRaf = 0;
    const ro = new ResizeObserver(() => {
      if (roRaf) return;
      roRaf = requestAnimationFrame(() => {
        roRaf = 0;
        measure();
      });
    });
    ro.observe(el);
    if (cvp) ro.observe(cvp);
    return () => {
      ro.disconnect();
      if (roRaf) cancelAnimationFrame(roRaf);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // core 가 사용할 스크롤 API
  useLayoutEffect(() => {
    core.viewport = {
      getScrollTop: () => (bodyVpRef.current?.scrollTop ?? 0) * metrics.current.ratio,
      setScrollTop: v => {
        if (bodyVpRef.current) bodyVpRef.current.scrollTop = v / metrics.current.ratio;
      },
      getClientHeight: () => bodyVpRef.current?.clientHeight ?? 0,
      // RTL: 브라우저 scrollLeft 는 시작(오른쪽)에서 음수로 감 → 논리 위치는 절대값
      getScrollLeft: () => Math.abs(hScrollRef.current?.scrollLeft ?? 0),
      setScrollLeft: v => {
        const hs = hScrollRef.current;
        if (!hs) return;
        hs.scrollLeft = core.isRtl() ? -v : v;
        syncLeft(hs.scrollLeft);
        schedule();
      },
      getCenterWidth: () => centerVpRef.current?.clientWidth ?? 0,
    };
    return () => {
      core.viewport = null;
    };
  }, []);

  // 가로 휠/쉬프트휠 → 가짜 가로 스크롤바로 전달
  useEffect(() => {
    const el = bodyVpRef.current;
    if (!el) return undefined;
    const onWheel = ev => {
      if (ev.target instanceof Element && ev.target.closest('.r2-root') !== focusSinkRef.current) return;
      if (core.gos.suppressScrollWhenPopupsAreOpen && core.popup) {
        ev.preventDefault();
        return;
      }
      let dx = ev.deltaX;
      if (!dx && ev.shiftKey) dx = ev.deltaY;
      if (!dx) return;
      const hs = hScrollRef.current;
      if (!hs) return;
      const before = hs.scrollLeft;
      hs.scrollLeft += dx;
      // suppressPreventDefaultOnMouseWheel: 휠을 브라우저에도 넘김 (페이지도 같이 스크롤)
      if (hs.scrollLeft !== before && !core.gos.suppressPreventDefaultOnMouseWheel) ev.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // bodyScrollEnd: 스크롤이 멈추고 100ms 뒤
  const scrollEndTimer = useRef(null);
  const scrollEnd = params => {
    clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => core.dispatch('bodyScrollEnd', params), 100);
  };
  useEffect(() => () => clearTimeout(scrollEndTimer.current), []);
  const onHScroll = e => {
    const left = e.currentTarget.scrollLeft;
    syncLeft(left);
    schedule();
    const params = { direction: 'horizontal', left: Math.abs(left), top: core.viewport?.getScrollTop() ?? 0 };
    core.dispatch('bodyScroll', params);
    scrollEnd(params);
  };
  const onCenterScroll = e => {
    const left = e.currentTarget.scrollLeft;
    const hs = hScrollRef.current;
    if (hs && hs.scrollLeft !== left) hs.scrollLeft = left;
  };
  const onBodyScroll = () => {
    schedule();
    const params = { direction: 'vertical', top: core.viewport?.getScrollTop() ?? 0, left: hScrollRef.current?.scrollLeft ?? 0 };
    core.dispatch('bodyScroll', params);
    scrollEnd(params);
  };

  // ── 범위 드래그 (+ 가장자리 자동 스크롤) ──
  const locateCell = (x, y) => {
    const vp = bodyVpRef.current;
    if (!vp) return null;
    const r = vp.getBoundingClientRect();
    const cxp = Math.min(Math.max(x, r.left + 1), r.left + vp.clientWidth - 2);
    const cyp = Math.min(Math.max(y, r.top + 1), r.top + vp.clientHeight - 2);
    const el = docOf(core).elementFromPoint(cxp, cyp);
    const cell = el?.closest?.('.r2-cell[col-id]');
    if (!cell || cell.closest('.r2-root') !== focusSinkRef.current) return null;
    const row = cell.closest('[row-index]');
    if (!row) return null;
    const rowIndex = Number(row.getAttribute('row-index'));
    if (Number.isNaN(rowIndex)) return null;
    const colId = cell.getAttribute('col-id');
    const col = core.getColumn(colId);
    if (!col || col.isAuto) return null;
    return { rowIndex, colId };
  };

  // 포인터가 가장자리 근처면 스크롤 (드래그 공통)
  const edgeScroll = (x, y) => {
    const vp = bodyVpRef.current;
    const hs = hScrollRef.current;
    if (!vp) return false;
    const r = vp.getBoundingClientRect();
    let scrolled = false;
    if (y < r.top + 8) {
      vp.scrollTop -= 30;
      scrolled = true;
    } else if (y > r.top + vp.clientHeight - 8) {
      vp.scrollTop += 30;
      scrolled = true;
    }
    if (hs) {
      const cr = centerVpRef.current?.getBoundingClientRect();
      if (cr && x < cr.left + 8) {
        hs.scrollLeft -= 30;
        scrolled = true;
      } else if (cr && x > cr.right - 8) {
        hs.scrollLeft += 30;
        scrolled = true;
      }
    }
    return scrolled;
  };

  const startRangeDrag = () => {
    let lastX = 0;
    let lastY = 0;
    let moved = false;
    const onMove = ev => {
      moved = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      const c = locateCell(lastX, lastY);
      if (c) core.rangeExtend(c.rowIndex, c.colId);
    };
    const timer = setInterval(() => {
      if (!moved) return;
      if (edgeScroll(lastX, lastY)) {
        const c = locateCell(lastX, lastY);
        if (c) core.rangeExtend(c.rowIndex, c.colId);
      }
    }, 50);
    const onUp = () => {
      docOf(core).removeEventListener('pointermove', onMove);
      docOf(core).removeEventListener('pointerup', onUp);
      docOf(core).removeEventListener('pointercancel', onUp);
      clearInterval(timer);
      core.rangeEnd();
    };
    docOf(core).addEventListener('pointermove', onMove);
    docOf(core).addEventListener('pointerup', onUp);
    docOf(core).addEventListener('pointercancel', onUp);
  };

  // ── 행 드래그 ──
  const overIndexAt = y => {
    const vp = bodyVpRef.current;
    const r = vp.getBoundingClientRect();
    const yIn = clamp(y - r.top, 0, Math.max(0, vp.clientHeight - 1));
    const virt = vp.scrollTop * metrics.current.ratio + yIn;
    const count = core.getRowCountInPage();
    if (!count) return { index: -1, y: virt };
    return { index: core.pageFirstRow + core.indexAtPixel(virt), y: virt };
  };
  const startRowDrag = (node, col, e) => {
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let lastX = startX;
    let lastY = startY;
    let left = false;
    const rootRect = () => core.eRoot?.getBoundingClientRect();
    const onMove = ev => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
        dragging = true;
        docOf(core).body.classList.add('r2-dnd-dragging');
        const text = core.rowDragStart(node, ev, col);
        setDragGhost({ text, x: ev.clientX, y: ev.clientY });
      }
      setDragGhost(gh => gh && { ...gh, x: ev.clientX, y: ev.clientY });
      core.updateRowDropZones(ev, 'move');
      const rr = rootRect();
      const outside = rr && (ev.clientX < rr.left || ev.clientX > rr.right || ev.clientY < rr.top || ev.clientY > rr.bottom);
      if (outside) {
        if (!left) core.rowDragLeave(ev);
        left = true;
        return;
      }
      left = false;
      const o = overIndexAt(ev.clientY);
      if (o.index >= 0) core.rowDragMove(o.index, o.y, ev);
    };
    const timer = setInterval(() => {
      if (!dragging || left) return;
      if (edgeScroll(lastX, lastY)) {
        const o = overIndexAt(lastY);
        if (o.index >= 0) core.rowDragMove(o.index, o.y, { clientX: lastX, clientY: lastY });
      }
    }, 50);
    const finish = ev => {
      docOf(core).removeEventListener('pointermove', onMove);
      docOf(core).removeEventListener('pointerup', finish);
      docOf(core).removeEventListener('pointercancel', finish);
      clearInterval(timer);
      if (!dragging) return;
      docOf(core).body.classList.remove('r2-dnd-dragging');
      setDragGhost(null);
      core.updateRowDropZones(ev, ev.type === 'pointercancel' ? 'cancel' : 'end');
      const o = overIndexAt(ev.clientY);
      core.rowDragEnd(ev, o.index, o.y, ev.type === 'pointercancel');
      core.__suppressRowClick = true;
      setTimeout(() => {
        core.__suppressRowClick = false;
      }, 0);
    };
    docOf(core).addEventListener('pointermove', onMove);
    docOf(core).addEventListener('pointerup', finish);
    docOf(core).addEventListener('pointercancel', finish);
  };

  const focusSink = target => {
    if (isEditableEl(target)) return;
    const sink = focusSinkRef.current;
    if (sink && docOf(core).activeElement !== sink) sink.focus({ preventScroll: true });
  };

  // 채우기/범위 핸들 드래그
  const startFillDrag = () => {
    let lastX = 0;
    let lastY = 0;
    let moved = false;
    const move = () => {
      const c = locateCell(lastX, lastY);
      if (c) core.fillMove(c.rowIndex, c.colId);
    };
    const onMove = ev => {
      moved = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      move();
    };
    const timer = setInterval(() => {
      if (moved && edgeScroll(lastX, lastY)) move();
    }, 50);
    const onKey = ev => {
      if (ev.key === 'Escape') finish(ev, true);
    };
    const finish = (ev, cancelled = false) => {
      docOf(core).removeEventListener('pointermove', onMove);
      docOf(core).removeEventListener('pointerup', onUp);
      docOf(core).removeEventListener('pointercancel', onUp);
      docOf(core).removeEventListener('keydown', onKey, true);
      clearInterval(timer);
      core.fillEnd(ev, cancelled);
    };
    const onUp = ev => finish(ev, ev.type === 'pointercancel');
    docOf(core).addEventListener('pointermove', onMove);
    docOf(core).addEventListener('pointerup', onUp);
    docOf(core).addEventListener('pointercancel', onUp);
    docOf(core).addEventListener('keydown', onKey, true);
  };

  const handlers = {
    fillHandleDown(e) {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      focusSink(e.target);
      if (core.fillStart()) startFillDrag();
    },
    dragHandleDown(node, col, e) {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      focusSink(e.target);
      startRowDrag(node, col, e);
    },
    // 행 번호 칸 아래 가장자리 드래그 → 행 높이 (rowResizeStarted / rowResizeEnded)
    rowResizeDown(node, e) {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const startY = e.clientY;
      const startH = node.rowHeight || core.getDefaultRowHeight();
      const min = 16;
      let h = startH;
      core.dispatch('rowResizeStarted', { node, event: e.nativeEvent, rowHeight: startH });
      const move = ev => {
        const nh = Math.max(min, Math.round(startH + ev.clientY - startY));
        if (nh === h) return;
        h = nh;
        node.setRowHeight(h);
      };
      const up = ev => {
        winOf(core).removeEventListener('pointermove', move);
        winOf(core).removeEventListener('pointerup', up);
        docOf(core).body.classList.remove('r2-row-resizing');
        core.__skipCellClick = true; // 드래그 끝의 click 은 무시 (행 범위 선택 안 함)
        setTimeout(() => (core.__skipCellClick = false), 0);
        core.dispatch('rowResizeEnded', { node, event: ev, rowHeight: h });
      };
      docOf(core).body.classList.add('r2-row-resizing');
      winOf(core).addEventListener('pointermove', move);
      winOf(core).addEventListener('pointerup', up);
    },
    cellPointerDown(node, col, e) {
      if (e.button !== 0) return;
      const ced = core.getEditingCell(node, col);
      if (ced) return;
      // 검사에 걸린 값이라 편집을 못 끝내면(invalidEditValueMode:'block') 다른 칸으로 가지 않음
      if (core.editing && !core.stopEditing(false)) {
        e.preventDefault();
        core.focusEditorInput();
        return;
      }
      core.dispatch('cellMouseDown', { ...core.cellEventParams(node, col, e) });
      if (col.autoType === 'rowNumbers' || node.stub) return;
      focusSink(e.target);
      const pinned = node.rowPinned || null;
      // 행 전체 드래그: 범위선택 대신 드래그 시작 (클릭은 그대로 동작)
      if (g.rowDragEntireRow && !pinned && !g.suppressRowDrag && !isEditableEl(e.target)) {
        core.setFocusedCell(node.rowIndex, col.colId);
        startRowDrag(node, col, e);
        return;
      }
      const extend = !pinned && e.shiftKey && core.ranges.length && core.cellSelectionOpts;
      if (!extend) core.setFocusedCell(node.rowIndex, col.colId, { rowPinned: pinned });
      if (!pinned && core.cellSelectionOpts && !col.isAuto) {
        core.rangeStart(node.rowIndex, col.colId, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
        startRangeDrag();
      } else if (pinned && core.ranges.length) {
        core.clearRanges();
      }
    },
    cellClick(node, col, e) {
      if (node.stub || core.__skipCellClick) return;
      // 편집을 못 끝낸 채(invalidEditValueMode:'block') 다른 칸을 누른 경우 — 편집 칸에 그대로
      if (core.editing && !core.getEditingCell(node, col)) return core.focusEditorInput();
      if (col.autoType === 'rowNumbers' && !node.rowPinned && !col.colDef.suppressCellSelectionIntegration) core.selectRowAsRange(node.rowIndex, e.shiftKey);
      else if (!core.isCellFocused(node, col.colId)) {
        if (!(e.shiftKey && core.ranges.length && !node.rowPinned)) core.setFocusedCell(node.rowIndex, col.colId, { rowPinned: node.rowPinned || null });
      }
      focusSink(e.target);
      core.dispatch('cellClicked', { ...core.cellEventParams(node, col, e) });
      const single = g.singleClickEdit || col.colDef.singleClickEdit;
      if (single && !g.suppressClickEdit && !core.getEditingCell(node, col) && core.isCellEditable(col, node)) {
        core.startEdit(node, col, null);
      }
    },
    // suppressMiddleClickScrolls: 가운데 클릭도 셀·행 클릭 이벤트로 (자동 스크롤 대신)
    cellMiddleClick(node, col, e) {
      if (e.button !== 1 || node.stub) return;
      e.preventDefault();
      core.dispatch('cellClicked', { ...core.cellEventParams(node, col, e) });
      core.dispatch('rowClicked', { node, data: node.data, rowIndex: node.rowIndex, rowPinned: node.rowPinned, event: e });
    },
    cellDblClick(node, col, e) {
      if (node.stub) return;
      core.dispatch('cellDoubleClicked', { ...core.cellEventParams(node, col, e) });
      if (core.getEditingCell(node, col)) return;
      if (!g.suppressClickEdit && !g.singleClickEdit && core.isCellEditable(col, node)) core.startEdit(node, col, null);
      else if (node.group && col.autoType === 'group' && !g.suppressGroupDoubleClickExpand && (node.childrenAll?.length || node.__ssrmGroup)) {
        node.setExpanded(!node.expanded);
      }
    },
    cellContextMenu(node, col, e) {
      if (g.allowContextMenuWithControlKey && (e.ctrlKey || e.metaKey)) return;
      if (g.suppressContextMenu && g.preventDefaultOnContextMenu) e.preventDefault();
      e.stopPropagation();
      if (node.stub) {
        e.preventDefault();
        return;
      }
      core.dispatch('cellContextMenu', { ...core.cellEventParams(node, col, e) });
      if (!node.rowPinned && core.cellSelectionOpts && !col.isAuto && !core.cellRangeInfo(node.rowIndex, col.colId)) {
        core.setSingleRange(node.rowIndex, col.colId);
      }
      if (!core.isCellFocused(node, col.colId)) core.setFocusedCell(node.rowIndex, col.colId, { rowPinned: node.rowPinned || null });
      if (core.openContextMenu({ node, column: col, x: e.clientX, y: e.clientY, event: e })) e.preventDefault();
    },
    rowClick(node, e) {
      if (node.stub || core.__suppressRowClick) return;
      if (core.editing && core.editing.node === node && e.target instanceof Element && e.target.closest('.r2-cell-inline-editing')) return;
      core.dispatch('rowClicked', { node, data: node.data, rowIndex: node.rowIndex, rowPinned: node.rowPinned, event: e });
      core.handleRowClickSelection(node, e);
    },
    rowDblClick(node, e) {
      if (node.stub) return;
      core.dispatch('rowDoubleClicked', { node, data: node.data, rowIndex: node.rowIndex, rowPinned: node.rowPinned, event: e });
    },
  };

  // 호버: 같은 row-index 의 모든 섹션에 r2-row-hover 를 DOM 으로 직접 토글 (재렌더 없음)
  const setHover = key => {
    if (key === core.hoveredRowIndex) return;
    const root = focusSinkRef.current;
    if (!root) return;
    const sel = k => root.querySelectorAll(`.r2-row[row-index="${k}"]`);
    if (core.hoveredRowIndex != null) sel(core.hoveredRowIndex).forEach(el => el.classList.remove('r2-row-hover'));
    core.hoveredRowIndex = key;
    if (key != null && !g.suppressRowHoverHighlight) {
      sel(key).forEach(el => {
        if (el.closest('.r2-root') === root && !el.classList.contains('r2-full-width-row')) el.classList.add('r2-row-hover');
      });
    }
  };
  // columnHoverHighlight: 같은 col-id 셀 + 헤더에 r2-column-hover (DOM 토글, 재렌더 없음)
  const setColHover = colId => {
    if (colId === core.hoveredColId) return;
    const root = focusSinkRef.current;
    const prev = core.hoveredColId;
    core.hoveredColId = colId;
    if (!root || !g.columnHoverHighlight) return;
    const sel = id => root.querySelectorAll(`.r2-cell[col-id="${CSS.escape(id)}"], .r2-header-cell[col-id="${CSS.escape(id)}"]`);
    if (prev != null) sel(prev).forEach(el => el.classList.remove('r2-column-hover'));
    if (colId != null) sel(colId).forEach(el => el.closest('.r2-root') === root && el.classList.add('r2-column-hover'));
  };
  // cellMouseOver / cellMouseOut (셀이 바뀔 때만)
  const setMouseCell = (rowKey, colId, e) => {
    const prev = core.__mouseCell;
    const key = rowKey != null && colId != null ? `${rowKey}|${colId}` : null;
    if ((prev?.key ?? null) === key) return;
    const fire = (type, c) => {
      const node = core.nodeFromRowKey(c.rowKey);
      const column = core.getColumn(c.colId);
      if (node && column) core.dispatch(type, { ...core.cellEventParams(node, column, e) });
    };
    if (prev) fire('cellMouseOut', prev);
    core.__mouseCell = key ? { key, rowKey, colId } : null;
    if (key) fire('cellMouseOver', core.__mouseCell);
  };
  const onMouseOver = e => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest('.r2-root') !== focusSinkRef.current) return;
    const row = t.closest('.r2-row[row-index]');
    const rowKey = row && !row.classList.contains('r2-full-width-row') ? row.getAttribute('row-index') : null;
    setHover(rowKey);
    const colId = t.closest('.r2-cell[col-id]')?.getAttribute('col-id') ?? null;
    setColHover(colId);
    setMouseCell(rowKey, colId, e);
  };
  const onMouseLeave = e => {
    setHover(null);
    setColHover(null);
    setMouseCell(null, null, e);
  };

  // ── 렌더 범위 계산 ──
  const rowCount = core.getRowCountInPage();
  const realH = core.pageHeight;
  const vh = size.h;
  const stretched = !autoLayout && realH > MAX_DIV_HEIGHT;
  const containerH = stretched ? MAX_DIV_HEIGHT : realH;
  const ratio = stretched && containerH > vh ? (realH - vh) / (containerH - vh) : 1;
  metrics.current.ratio = ratio;
  const physTop = scroll.top;
  const virtTop = physTop * ratio;
  const offset = virtTop - physTop;
  const buffer = g.rowBuffer ?? 10;
  let first = 0;
  let last = rowCount - 1;
  if (!autoLayout && rowCount && !g.suppressRowVirtualisation) {
    first = Math.max(0, core.indexAtPixel(virtTop) - buffer);
    last = Math.min(rowCount - 1, core.indexAtPixel(virtTop + (vh || 600)) + buffer);
  }
  core.renderedRange = rowCount ? { first: core.pageFirstRow + first, last: core.pageFirstRow + last } : { first: -1, last: -1 };

  const cw = size.cw || core.bodyWidth || 1200;
  const sl = Math.abs(scroll.left);
  let center = core.displayedCenter;
  if (!g.suppressColumnVirtualisation) {
    center = center.filter(c => c.left + c.actualWidth >= sl - 200 && c.left <= sl + cw + 200);
    if (core.editing) {
      for (const ced of core.editing.cells.values()) {
        const ec = ced.column;
        if (!ec.pinned && !center.includes(ec) && core.displayedCenter.includes(ec)) center = [...center, ec];
      }
    }
  }

  // 렌더 범위가 바뀌면 viewportChanged / virtualRowRemoved / virtualColumnsChanged (렌더 뒤 effect 에서)
  const renderedNow = useRef(null);
  renderedNow.current = { first: core.renderedRange.first, last: core.renderedRange.last, cols: center.map(c => c.colId).join('|') };
  const renderedPrev = useRef({ first: -1, last: -1, cols: '' });
  useEffect(() => {
    const now = renderedNow.current;
    const prev = renderedPrev.current;
    if (now.first !== prev.first || now.last !== prev.last) {
      if (prev.first >= 0 && core.hasEventListener('virtualRowRemoved')) {
        for (let i = prev.first; i <= prev.last; i++) {
          if (i >= now.first && i <= now.last) continue;
          const n = core.displayedNodes[i];
          if (n) core.dispatch('virtualRowRemoved', { node: n, rowIndex: i, data: n.data });
        }
      }
      core.dispatch('viewportChanged', { firstRow: now.first, lastRow: now.last });
    }
    if (now.cols !== prev.cols) core.dispatch('virtualColumnsChanged', { afterScroll: prev.cols !== '' });
    renderedPrev.current = now;
  });

  // 행 드롭 위치 표시줄 (suppressMoveWhenRowDragging · setRowDropPositionIndicator)
  const dropLine = width => {
    const ind = core.rowDropIndicator;
    const n = ind?.row;
    if (!n || n.rowIndex == null || n.rowPinned) return null;
    const pi = n.rowIndex - core.pageFirstRow;
    if (pi < 0 || pi >= rowCount) return null;
    const pos = ind.dropIndicatorPosition;
    // 안쪽(트리 자식으로): 행 전체 테두리
    if (pos === 'inside')
      return (
        <div
          className="r2-row-drop-indicator r2-row-drop-indicator-inside"
          style={{ top: core.rowTopAt(pi) - offset, height: core.rowHeightAt(pi), width }}
          aria-hidden="true"
        />
      );
    const t = core.rowTopAt(pi) - offset + (pos === 'below' ? core.rowHeightAt(pi) : 0);
    return <div className={`r2-row-drop-indicator r2-row-drop-indicator-${pos}`} style={{ top: t - 1, width }} aria-hidden="true" />;
  };

  const leftRows = [];
  const centerRows = [];
  const rightRows = [];
  const fullRows = [];
  const total = core.displayedNodes.length;
  // embedFullWidthRows: 전체 폭 행을 맨 위 층 대신 영역마다 넣어 가운데 부분이 가로 스크롤을 따라감
  const embed = !!g.embedFullWidthRows;
  // 일반 행: 왼쪽 고정·가운데·오른쪽 고정 영역마다 그 영역 컬럼으로
  const pushSections = (key, common) => {
    if (core.displayedLeft.length) leftRows.push(<Row key={key} cols={core.displayedLeft} sectionCols={core.displayedLeft} {...common} />);
    centerRows.push(<Row key={key} cols={center} sectionCols={core.displayedCenter} {...common} />);
    if (core.displayedRight.length) rightRows.push(<Row key={key} cols={core.displayedRight} sectionCols={core.displayedRight} {...common} />);
  };
  const pushFull = (Comp, key, common) => {
    if (!embed) {
      fullRows.push(<Comp key={key} {...common} />);
      return;
    }
    const secs = [core.displayedLeft.length ? 'left' : null, 'center', core.displayedRight.length ? 'right' : null].filter(Boolean);
    secs.forEach((sec, si) => {
      const el = <Comp key={`${key}:${sec}`} {...common} pinned={sec === 'center' ? null : sec} primary={si === 0} />;
      (sec === 'left' ? leftRows : sec === 'right' ? rightRows : centerRows).push(el);
    });
  };
  const pushRow = i => {
    const node = core.getPageNode(i);
    if (!node) return;
    const top = core.rowTopAt(i) - offset;
    const h = core.rowHeightAt(i);
    if (node.detail) {
      // 상세 그리드: embedFullWidthRows 면 가운데 영역에 (가로 스크롤 따라감)
      (embed ? centerRows : fullRows).push(<DetailRow key={node.id} core={core} node={node} top={top} height={h} />);
      return;
    }
    const rp = rowProps(core, node, total);
    const key = node.__redraw ? `${node.id}:${node.__redraw}` : node.id;
    const common = { core, node, top, height: h, rp, handlers };
    if (node.group && !node.footer && core.isGroupRowsDisplay()) {
      pushFull(GroupFullRow, key, common);
      return;
    }
    if (node.stub && g.rowModelType === 'serverSide' && !g.suppressServerSideFullWidthLoadingRow) {
      pushFull(LoadingFullRow, key, common);
      return;
    }
    if (!node.group && !node.stub && typeof g.isFullWidthRow === 'function' && g.isFullWidthRow({ rowNode: node, api: core.api, context: g.context })) {
      pushFull(FullWidthRow, key, common);
      return;
    }
    pushSections(key, common);
  };
  for (let i = first; i <= last; i++) pushRow(i);

  // 그룹 행 위에 붙이기: 스크롤해도 지금 보고 있는 행의 상위 그룹 행들이 본문 맨 위에 차례로 붙음.
  //  그룹이 끝나면 다음 행에 밀려 올라감 (suppressGroupRowsSticky 로 끔)
  const sticky = core.getStickyGroupRows(virtTop, rowCount, autoLayout);
  sticky.forEach((st, si) => {
    const node = st.node;
    const rp = rowProps(core, node, total);
    // 바깥 그룹이 위에 오도록 (안쪽 그룹이 밀려 올라갈 때 바깥 그룹 뒤로 들어감)
    const sp = { ...rp, className: cx(rp.className, 'r2-sticky-row', st.last && 'r2-sticky-row-last'), style: { ...rp.style, zIndex: 20 - si } };
    const common = { core, node, top: st.top - offset, height: st.height, rp: sp, handlers };
    const key = `sticky:${node.id}`;
    if (core.isGroupRowsDisplay()) {
      pushFull(GroupFullRow, key, common);
      return;
    }
    pushSections(key, common);
  });
  // 합계 행 아래에 붙이기
  const stickyTotals = core.getStickyTotalRows(virtTop, vh || 0, rowCount, autoLayout);
  stickyTotals.forEach((st, si) => {
    const node = st.node;
    const rp = rowProps(core, node, total);
    const sp = {
      ...rp,
      className: cx(rp.className, 'r2-sticky-row r2-sticky-total-row', st.first && 'r2-sticky-total-row-first'),
      style: { ...rp.style, zIndex: 20 - si },
    };
    const common = { core, node, top: st.top - offset, height: st.height, rp: sp, handlers };
    const key = `stickyTotal:${node.id}`;
    pushSections(key, common);
  });
  const edNode = core.editing?.node;
  if (edNode && edNode.rowIndex != null && !edNode.rowPinned) {
    const ei = edNode.rowIndex - core.pageFirstRow;
    if (ei >= 0 && ei < rowCount && (ei < first || ei > last)) pushRow(ei);
  }
  // 행 DOM 순서 고정: 정렬·필터로 자리가 바뀌어도 이미 있던 행 요소는 옮기지 않음 (DOM 을 옮기면 이동 애니메이션이 끊김).
  //  새 행은 끝에. ensureDomOrder 면 화면 순서 그대로 (화면 읽기 프로그램용, 대신 애니메이션 없음)
  if (core.isRowAnimationOn() && !g.ensureDomOrder) {
    const prev = core.__domSeq || new Map();
    const next = new Map();
    let n = core.__domSeqNext || 0;
    const seqOf = k => {
      let v = next.get(k);
      if (v === undefined) {
        v = prev.get(k);
        if (v === undefined) v = n++;
        next.set(k, v);
      }
      return v;
    };
    for (const list of [leftRows, centerRows, rightRows, fullRows]) {
      const keyed = list.map(el => [seqOf(el.key), el]);
      keyed.sort((a, b) => a[0] - b[0]);
      keyed.forEach(([, el], i) => (list[i] = el));
    }
    core.__domSeq = next;
    core.__domSeqNext = n;
  }

  // 고정 행
  const topH = core.pinnedTop.length ? core.pinnedTotalHeight('top') : 0;
  const bottomH = core.pinnedBottom.length ? core.pinnedTotalHeight('bottom') : 0;
  const pinnedRows = (list, cols) =>
    list.map(node => (
      <Row key={node.id} core={core} node={node} cols={cols} top={node.rowTop} height={node.rowHeight} rp={rowProps(core, node, total)} handlers={handlers} />
    ));
  const floating = (pos, height, ref) => {
    const list = pos === 'top' ? core.pinnedTop : core.pinnedBottom;
    if (!height) return null;
    return (
      <div className={`r2-floating-${pos}`} role="presentation" style={{ height, minHeight: height }} onMouseOver={onMouseOver} onMouseLeave={onMouseLeave}>
        <div
          className={cx(`r2-pinned-left-floating-${pos}`, !core.leftWidth && 'r2-hidden')}
          role="rowgroup"
          style={{ width: core.leftWidth, minWidth: core.leftWidth, maxWidth: core.leftWidth }}
        >
          {pinnedRows(list, core.displayedLeft)}
        </div>
        <div ref={ref} className={`r2-floating-${pos}-viewport`} role="presentation">
          <div className={`r2-floating-${pos}-container`} role="rowgroup" style={{ width: core.centerWidth }}>
            {pinnedRows(list, center)}
          </div>
        </div>
        <div
          className={cx(`r2-pinned-right-floating-${pos}`, !core.rightWidth && 'r2-hidden')}
          role="rowgroup"
          style={{ width: core.rightWidth, minWidth: core.rightWidth, maxWidth: core.rightWidth }}
        >
          {pinnedRows(list, core.displayedRight)}
        </div>
        {size.sbw > 0 && <div className="r2-floating-scrollbar-spacer" style={{ width: size.sbw, minWidth: size.sbw }} />}
      </div>
    );
  };

  // autoHeight 컬럼: 렌더 후 내용 높이 측정 → 행 높이 반영
  useLayoutEffect(() => {
    const autoCols = core.displayedColumns.filter(c => c.colDef.autoHeight);
    if (!autoCols.length) return;
    const vp = bodyVpRef.current;
    if (!vp) return;
    const def = core.getDefaultRowHeight();
    let changed = false;
    for (let i = first; i <= last; i++) {
      const node = core.getPageNode(i);
      if (!node || node.detail || node.stub) continue;
      let max = 0;
      for (const c of autoCols) {
        const cell = vp.querySelector(`.r2-row[row-index="${node.rowIndex}"] .r2-cell[col-id="${CSS.escape(c.colId)}"]`);
        if (cell) max = Math.max(max, cell.offsetHeight);
      }
      if (max && core.setAutoRowHeight(node, Math.max(def, Math.ceil(max)))) changed = true;
    }
    if (changed) core.onRowHeightChanged();
  });

  // SSRM: 화면에 걸린 블록 요청
  useEffect(() => {
    if (core.isSsrm() && core.renderedRange.first >= 0) core.ssrmEnsureRows(core.renderedRange.first, core.renderedRange.last);
    // viewport 행 모델: 보이는 범위를 데이터 소스에 알림
    if (core.isViewportModel() && core.renderedRange.first >= 0) core.vpEnsureRange(core.renderedRange.first, core.renderedRange.last);
  });

  // 가로 위치를 새로 생긴 floating 컨테이너에도 적용
  useLayoutEffect(() => {
    const left = hScrollRef.current?.scrollLeft ?? 0;
    if (floatTopRef.current) floatTopRef.current.scrollLeft = left;
    if (floatBottomRef.current) floatBottomRef.current.scrollLeft = left;
  }, [topH > 0, bottomH > 0]);

  const hScrollVisible = !core.gos.suppressHorizontalScroll && (!!core.gos.alwaysShowHorizontalScroll || core.centerWidth > (size.cw || 0) + 1);

  return (
    <>
      {floating('top', topH, floatTopRef)}
      <div className={cx('r2-body', autoLayout ? 'r2-layout-auto-height' : 'r2-layout-normal')} role="presentation">
        <div
          ref={bodyVpRef}
          className={cx(
            'r2-body-viewport',
            autoLayout ? 'r2-layout-auto-height' : 'r2-layout-normal',
            core.isRowAnimationOn() && !stretched ? 'r2-row-animation' : 'r2-row-no-animation',
          )}
          style={g.alwaysShowVerticalScroll && !autoLayout ? { overflowY: 'scroll' } : undefined}
          role="presentation"
          onScroll={onBodyScroll}
          onMouseOver={onMouseOver}
          onMouseLeave={onMouseLeave}
          onContextMenu={e => {
            if (e.target instanceof Element && e.target.closest('.r2-root') !== focusSinkRef.current) return;
            if (g.allowContextMenuWithControlKey && (e.ctrlKey || e.metaKey)) return;
            if (core.openContextMenu({ node: null, column: null, x: e.clientX, y: e.clientY, event: e })) e.preventDefault();
          }}
        >
          <div
            className={cx('r2-pinned-left-cols-container', !core.leftWidth && 'r2-hidden')}
            role="rowgroup"
            style={{ width: core.leftWidth, minWidth: core.leftWidth, maxWidth: core.leftWidth, height: containerH }}
          >
            {leftRows}
          </div>
          <div ref={centerVpRef} className="r2-center-cols-viewport" role="presentation" style={{ height: containerH }} onScroll={onCenterScroll}>
            <div className="r2-center-cols-container" role="rowgroup" style={{ width: core.centerWidth, height: containerH }}>
              {centerRows}
              {dropLine(core.centerWidth)}
            </div>
          </div>
          <div
            className={cx('r2-pinned-right-cols-container', !core.rightWidth && 'r2-hidden')}
            role="rowgroup"
            style={{ width: core.rightWidth, minWidth: core.rightWidth, maxWidth: core.rightWidth, height: containerH }}
          >
            {rightRows}
          </div>
          {fullRows.length > 0 && (
            <div className="r2-full-width-container" role="rowgroup" style={{ height: containerH }}>
              {fullRows}
            </div>
          )}
        </div>
      </div>
      {floating('bottom', bottomH, floatBottomRef)}
      <div className={cx('r2-body-horizontal-scroll', !hScrollVisible && 'r2-scrollbar-invisible r2-hidden')} aria-hidden="true">
        <div className="r2-horizontal-left-spacer" style={{ width: core.leftWidth, minWidth: core.leftWidth }} />
        <div ref={hScrollRef} className="r2-body-horizontal-scroll-viewport" onScroll={onHScroll}>
          <div className="r2-body-horizontal-scroll-container" style={{ width: core.centerWidth }} />
        </div>
        <div className="r2-horizontal-right-spacer" style={{ width: core.rightWidth + size.sbw, minWidth: core.rightWidth + size.sbw }} />
      </div>
      {dragGhost &&
        createPortal(
          <PopupLayer core={core}>
            <DragImage
              core={core}
              x={dragGhost.x}
              y={dragGhost.y}
              label={dragGhost.text}
              icon="move"
              dragSource={{ type: 'row' }}
              defaultIcon={<Icon name="grip" />}
            />
          </PopupLayer>,
          docOf(core).body,
        )}
    </>
  );
}
