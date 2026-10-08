// 헤더: 좌고정 / 중앙(가로 스크롤 동기화) / 우고정 + 그룹 헤더 행
import React, { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cx, resolveClassValue } from '../core/utils.js';
import { Checkbox, Icon, IconsContext } from './common.jsx';
import { stableElement } from './renderComponent.js';
import { PopupLayer } from './popup.jsx';
import { FloatingFilterCell } from './filters.jsx';
import { canDropInZone, dropIntoZone } from './columnDrop.jsx';

// 그룹이 없는(패딩) 레벨을 컬럼 헤더가 위로 덮는지 — AG 기본, colDef.suppressSpanHeaderHeight 로 끔
const spansHeaderHeight = col => !col.colDef.suppressSpanHeaderHeight;

function groupSegments(cols, level) {
  const segs = [];
  let prev = null;
  for (const col of cols) {
    const g = col.groupChain[level] || null;
    const skip = !g && spansHeaderHeight(col);
    const last = segs[segs.length - 1];
    const adjacent = last && last.cols[last.cols.length - 1] === prev;
    prev = col;
    if (skip) continue;
    if (adjacent && g && last.group === g) {
      last.cols.push(col);
      last.width += col.actualWidth;
    } else {
      segs.push({ group: g, cols: [col], left: col.left, width: col.actualWidth });
    }
  }
  return segs;
}

function HeaderGroupCell({ core, seg, level, height }) {
  const def = seg.group?.colGroupDef;
  const cls = def ? resolveClassValue(def.headerClass, { colDef: def, api: core.api, context: core.gos.context }) : '';
  return (
    <div
      className={cx(
        'r2-header-group-cell r2-focus-managed',
        seg.group && core.headerFocus?.rowIndex === level && core.getColumn(core.headerFocus.colId)?.groupChain?.[level] === seg.group && 'r2-header-cell-focus',
        seg.group ? 'r2-header-group-cell-with-group' : 'r2-header-group-cell-no-group',
        cls,
      )}
      role="columnheader"
      col-id={seg.group?.groupId}
      style={{ ...core.colPos(seg.left), width: seg.width, height }}
      data-r2-tooltip={headerTooltipOf(core, def, null, seg.group)}
    >
      {seg.group && def.headerGroupComponent && (
        <div className="r2-header-group-cell-label" role="presentation">
          {stableElement(core, `hgroup:${seg.group.groupId}`, typeof def.headerGroupComponent === 'string' ? core.gos.components?.[def.headerGroupComponent] : def.headerGroupComponent, {
            displayName: def.headerName ?? '',
            columnGroup: seg.group,
            setExpanded: v => core.setColumnGroupOpened(seg.group, !!v, 'uiColumnExpanded'),
            api: core.api,
            context: core.gos.context,
            ...(def.headerGroupComponentParams || {}),
          })}
        </div>
      )}
      {seg.group && !def.headerGroupComponent && (
        <div className="r2-header-group-cell-label" role="presentation">
          <span className="r2-header-group-text" role="presentation">
            {def.headerName ?? ''}
          </span>
          {seg.group.expandable && (
            <span
              className={cx(
                'r2-header-icon r2-header-expand-icon',
                seg.group.expanded ? 'r2-header-expand-icon-expanded' : 'r2-header-expand-icon-collapsed',
              )}
              onClick={e => {
                e.stopPropagation();
                core.setColumnGroupOpened(seg.group, !seg.group.expanded, 'uiColumnExpanded');
              }}
            >
              <Icon name={seg.group.expanded ? 'expanded' : 'contracted'} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// 헤더 툴팁: headerTooltipValueGetter 우선 (AG v33+)
function headerTooltipOf(core, def, column, columnGroup) {
  if (!def) return undefined;
  if (typeof def.headerTooltipValueGetter === 'function') {
    const v = def.headerTooltipValueGetter({ colDef: def, column, columnGroup, location: 'header', api: core.api, context: core.gos.context });
    return v == null || v === '' ? undefined : String(v);
  }
  return def.headerTooltip;
}

function SortIndicator({ col, multi }) {
  const s = col.sort;
  const unSortIcon = !!col.colDef.unSortIcon && !s;
  return (
    <span className="r2-sort-indicator-container" role="presentation">
      <span className={cx('r2-sort-indicator-icon r2-sort-order', !(multi && s) && 'r2-hidden')} aria-hidden="true">
        {s && multi ? col.sortIndex + 1 : ''}
      </span>
      <span className={cx('r2-sort-indicator-icon r2-sort-ascending-icon', s !== 'asc' && 'r2-hidden')} aria-hidden="true">
        <Icon name="asc" />
      </span>
      <span className={cx('r2-sort-indicator-icon r2-sort-descending-icon', s !== 'desc' && 'r2-hidden')} aria-hidden="true">
        <Icon name="desc" />
      </span>
      <span className="r2-sort-indicator-icon r2-sort-mixed-icon r2-hidden" aria-hidden="true">
        <Icon name="none" />
      </span>
      <span className={cx('r2-sort-indicator-icon r2-sort-none-icon', !unSortIcon && 'r2-hidden')} aria-hidden="true">
        <Icon name="none" />
      </span>
    </span>
  );
}

function HeaderCell({ core, col, height: rowHeight, groupHeaderHeight, multiSortActive, drag }) {
  const cd = col.colDef;
  // 위쪽 패딩 그룹 레벨만큼 셀을 위로 늘림
  const spanLevels = spansHeaderHeight(col) ? Math.max(0, core.headerGroupDepth - col.groupChain.length) : 0;
  const spanPx = spanLevels * (groupHeaderHeight || 0);
  const height = rowHeight + spanPx;
  const legacy = core.gos.columnMenu === 'legacy';
  const sortable = col.isSortable();
  const s = col.sort;
  const headerCls = resolveClassValue(cd.headerClass, { colDef: cd, column: col, api: core.api, context: core.gos.context });
  const style = { ...core.colPos(col.left), width: col.actualWidth, height, ...(spanPx ? { top: -spanPx } : null), ...(typeof cd.headerStyle === 'function' ? cd.headerStyle({ column: col, colDef: cd, api: core.api }) : cd.headerStyle) };
  const name = core.getDisplayName(col);
  const isSelection = col.autoType === 'selection';
  const rs = core.rsOpts;
  const resizable = col.isResizable() && !isSelection;
  const popup = core.popup;
  const menuOpen = popup && popup.column === col && popup.type === 'columnMenu';
  const filterOpen = popup && popup.column === col && popup.type === 'filter';

  const onResizeDown = e => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const startX = e.clientX;
    const startW = col.actualWidth;
    const dir = core.isRtl() ? -1 : 1;
    // Shift 리사이즈 (colResizeDefault: 'shift' 면 기본, Shift 누르면 반대): 오른쪽 이웃 컬럼과 폭을 주고받음 (합계 유지)
    const shiftMode = (core.gos.colResizeDefault === 'shift') !== !!e.shiftKey;
    const section = col.pinned === 'left' ? core.displayedLeft : col.pinned === 'right' ? core.displayedRight : core.displayedCenter;
    const next = shiftMode ? section[section.indexOf(col) + 1] : null;
    const nextW = next?.actualWidth ?? 0;
    const resizeTo = (x, finished) => {
      let w = startW + (x - startX) * dir;
      if (next) {
        const minW = col.colDef.minWidth ?? 20;
        const nextMin = next.colDef.minWidth ?? 20;
        w = Math.max(minW, Math.min(w, startW + nextW - nextMin));
        core.setColumnWidth(next, startW + nextW - w, finished, 'uiColumnResized');
      }
      core.setColumnWidth(col, w, finished, 'uiColumnResized');
    };
    core.dispatch('dragStarted', { target: el });
    const onMove = ev => resizeTo(ev.clientX, false);
    const onUp = ev => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      resizeTo(ev.clientX, true);
      core.dispatch(ev.type === 'pointercancel' ? 'dragCancelled' : 'dragStopped', { target: el });
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const showMenuBtn = !isSelection && !col.autoType && !cd.suppressHeaderMenuButton && !cd.suppressMenu;
  // 플로팅 필터가 있으면 필터 버튼은 플로팅 필터 쪽에 (AG 동일)
  const showFilterBtn =
    !legacy && !!cd.filter && !cd.floatingFilter && !cd.suppressHeaderFilterButton && !col.autoType && !core.isAdvancedFilterEnabled();
  const toggleMenu = e => {
    e.stopPropagation();
    if (menuOpen) core.closePopup();
    else {
      core.openPopup({ type: 'columnMenu', column: col, anchorEl: legacy ? e.currentTarget.closest('.r2-header-cell') : e.currentTarget });
      core.dispatch('columnMenuVisibleChanged', { visible: true, switchingTab: false, key: null, column: col });
    }
  };
  const toggleFilter = e => {
    e.stopPropagation();
    if (filterOpen) core.closePopup();
    else core.openPopup({ type: 'filter', column: col, anchorColId: col.colId });
  };

  const onClick = e => {
    if (drag.current.suppressClick) {
      drag.current.suppressClick = false;
      return;
    }
    if (isSelection || !sortable) return;
    if (e.target instanceof Element && e.target.closest('.r2-header-cell-menu-button,.r2-header-cell-filter-button,.r2-header-cell-resize,.r2-header-select-all')) return;
    const multiKey = core.gos.multiSortKey === 'ctrl' ? e.ctrlKey || e.metaKey : e.shiftKey;
    core.toggleColumnSort(col, multiKey && !core.gos.suppressMultiSort);
  };

  const onPointerDown = e => {
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('.r2-header-cell-resize,.r2-header-cell-menu-button,.r2-header-cell-filter-button,.r2-header-select-all,input')) return;
    if (cd.suppressMovable || cd.lockPosition || core.gos.suppressMovableColumns || col.isAuto) return;
    drag.current.begin(e, col);
  };

  let content;
  if (cd.headerComponent) {
    const impl = typeof cd.headerComponent === 'string' ? core.gos.components?.[cd.headerComponent] : cd.headerComponent;
    content = stableElement(core, `header:${col.colId}`, impl, {
      ...(cd.headerComponentParams || {}),
      column: col,
      displayName: name,
      enableSorting: sortable,
      enableMenu: showMenuBtn,
      enableFilterButton: showFilterBtn,
      enableFilterIcon: !!cd.filter,
      showColumnMenu: el => core.openPopup({ type: 'columnMenu', column: col, anchorEl: el }),
      showColumnMenuAfterMouseClick: ev => core.openPopup({ type: 'columnMenu', column: col, x: ev.clientX, y: ev.clientY }),
      showFilter: () => core.openPopup({ type: 'filter', column: col, anchorColId: col.colId }),
      progressSort: multi => core.toggleColumnSort(col, !!multi),
      setSort: (sort, multi) => core.setColumnSort(col, sort, !!multi, 'uiColumnSorted'),
      api: core.api,
      context: core.gos.context,
    });
  } else {
    const headerCheckbox =
      (isSelection && rs?.mode === 'multiRow' && rs.headerCheckbox !== false) ||
      (!isSelection && rs?.legacy && cd.headerCheckboxSelection);
    content = (
      <div
        className={cx('r2-cell-label-container', s ? `r2-header-cell-sorted-${s}` : 'r2-header-cell-sorted-none')}
        role="presentation"
      >
        {showMenuBtn && (
          <span
            className={cx('r2-header-icon r2-header-cell-menu-button', !legacy && 'r2-header-menu-icon', core.gos.suppressMenuHide !== false && !legacy && 'r2-header-menu-always-show')}
            aria-hidden="true"
            onClick={toggleMenu}
          >
            <Icon name="menu" />
          </span>
        )}
        {showFilterBtn && (
          <span
            className={cx('r2-header-icon r2-header-cell-filter-button', col.filterActive && 'r2-filter-active')}
            aria-hidden="true"
            onClick={toggleFilter}
          >
            <Icon name={col.filterActive ? 'filter-active' : 'filter'} />
          </span>
        )}
        <div className="r2-header-cell-label" role="presentation">
          {headerCheckbox && (
            <div className="r2-header-select-all r2-labeled r2-label-align-right" role="presentation">
              <Checkbox checked={core.getHeaderCheckboxState()} onToggle={() => core.toggleHeaderCheckbox()} ariaLabel="Toggle All Rows Selection" />
            </div>
          )}
          {!isSelection && (
            <span className="r2-header-cell-text" role="presentation">
              {name}
            </span>
          )}
          {!isSelection && (
            <span className={cx('r2-header-icon r2-header-label-icon r2-filter-icon', !(legacy && col.filterActive) && 'r2-hidden')} aria-hidden="true">
              <Icon name="filter" />
            </span>
          )}
          {!isSelection && sortable && <SortIndicator col={col} multi={multiSortActive} />}
        </div>
      </div>
    );
  }

  const cell = (
    <div
      className={cx(
        'r2-header-cell r2-focus-managed',
        sortable && 'r2-header-cell-sortable',
        s && 'r2-header-cell-sorted',
        s && `r2-header-cell-sorted-${s}`,
        col.filterActive && 'r2-header-cell-filtered',
        isSelection && 'r2-selection-column r2-header-selection-cell',
        col.autoType === 'rowNumbers' && 'r2-row-number-header',
        (menuOpen || filterOpen) && 'r2-header-active',
        cd.wrapHeaderText && 'r2-header-cell-wrap-text',
        cd.autoHeaderHeight && 'r2-header-cell-auto-height',
        core.headerFocus?.colId === col.colId && core.headerFocus.rowIndex === core.headerGroupDepth && 'r2-header-cell-focus',
        spanPx > 0 && 'r2-header-span-height',
        spanLevels > 0 && spanLevels === core.headerGroupDepth && 'r2-header-span-total',
        headerCls,
      )}
      col-id={col.colId}
      role="columnheader"
      aria-sort={s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : 'none'}
      style={style}
      data-r2-tooltip={headerTooltipOf(core, cd, col)}
      onClick={e => {
        core.dispatch('columnHeaderClicked', { column: col });
        if (!core.gos.suppressHeaderFocus && !(e.target instanceof Element && e.target.closest('input'))) {
          core.setHeaderFocus(core.headerGroupDepth, col.colId, 'ui');
          core.eFocusSink?.focus?.({ preventScroll: true });
        }
        onClick(e);
      }}
      onPointerDown={onPointerDown}
      onMouseEnter={() => core.dispatch('columnHeaderMouseOver', { column: col })}
      onMouseLeave={() => core.dispatch('columnHeaderMouseLeave', { column: col })}
      onContextMenu={e => {
        core.dispatch('columnHeaderContextMenu', { column: col, event: e });
        if (cd.suppressHeaderContextMenu) return;
        if (!legacy && showMenuBtn) {
          e.preventDefault();
          core.openPopup({ type: 'columnMenu', column: col, x: e.clientX, y: e.clientY });
        }
      }}
    >
      {resizable && (
        <div
          className="r2-header-cell-resize"
          role="presentation"
          onPointerDown={onResizeDown}
          onDoubleClick={e => {
            e.stopPropagation();
            core.autoSizeColumns([col]);
          }}
        />
      )}
      <div className="r2-header-cell-comp-wrapper" role="presentation">
        {content}
      </div>
    </div>
  );
  // colDef.icons: 이 컬럼 헤더 아이콘만 교체
  return cd.icons ? <IconsContextMerge icons={cd.icons}>{cell}</IconsContextMerge> : cell;
}

function IconsContextMerge({ icons, children }) {
  const parent = React.useContext(IconsContext);
  return <IconsContext.Provider value={{ ...(parent || {}), ...icons }}>{children}</IconsContext.Provider>;
}

function HeaderRows({ core, cols, width, headerHeight, groupHeaderHeight, floatingHeight, drag }) {
  const depth = core.headerGroupDepth;
  const multi = core.allColumns.filter(c => c.sort).length > 1;
  const rows = [];
  for (let level = 0; level < depth; level++) {
    const segs = groupSegments(cols, level);
    rows.push(
      <div
        key={`g${level}`}
        className="r2-header-row r2-header-row-column-group"
        role="row"
        aria-rowindex={level + 1}
        style={{ top: level * groupHeaderHeight, height: groupHeaderHeight, width }}
      >
        {segs.map((seg, i) => (
          <HeaderGroupCell key={seg.group ? `${seg.group.groupId}#${i}` : `pad${i}`} core={core} seg={seg} level={level} height={groupHeaderHeight} />
        ))}
      </div>,
    );
  }
  rows.push(
    <div
      key="cols"
      className={cx('r2-header-row r2-header-row-column', depth > 0 && 'r2-header-row-spanning')}
      role="row"
      aria-rowindex={depth + 1}
      style={{ top: depth * groupHeaderHeight, height: headerHeight, width }}
    >
      {cols.map(col => (
        <HeaderCell key={col.colId} core={core} col={col} height={headerHeight} groupHeaderHeight={groupHeaderHeight} multiSortActive={multi} drag={drag} />
      ))}
    </div>,
  );
  if (floatingHeight) {
    rows.push(
      <div
        key="ff"
        className="r2-header-row r2-header-row-column-filter"
        role="row"
        aria-rowindex={depth + 2}
        style={{ top: depth * groupHeaderHeight + headerHeight, height: floatingHeight, width }}
      >
        {cols.map(col => (
          <FloatingFilterCell key={col.colId} core={core} col={col} height={floatingHeight} />
        ))}
      </div>,
    );
  }
  return rows;
}

// 컬럼 드래그 이동 (실시간 이동 + 그리드 밖에서 놓으면 숨김)
function useColumnDrag(core) {
  const state = useRef({ suppressClick: false });
  const ghostRef = useRef(null);
  const [, force] = React.useReducer(x => x + 1, 0);
  state.current.begin = (e, col) => {
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    const onMove = ev => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < 5 && Math.abs(ev.clientY - startY) < 5) return;
        dragging = true;
        core.dispatch('dragStarted', { target: e.target });
        state.current.ghost = { name: core.getDisplayName(col), x: ev.clientX, y: ev.clientY, hidden: false };
        document.body.classList.add('r2-dnd-dragging');
      }
      const rootRect = core.eRoot?.getBoundingClientRect();
      const outside =
        rootRect && (ev.clientY < rootRect.top - 30 || ev.clientY > rootRect.bottom + 30 || ev.clientX < rootRect.left - 30 || ev.clientX > rootRect.right + 30);
      // 드롭 영역(행 그룹/값/열 레이블) 위 — 해당 역할 허용 컬럼만 (enableRowGroup/enableValue/enablePivot, AG 동일)
      const hit = document.elementFromPoint(ev.clientX, ev.clientY);
      const zoneEl = !outside && hit?.closest?.('.r2-column-drop[data-kind]');
      const zone = zoneEl && core.eRoot.contains(zoneEl) && canDropInZone(col, zoneEl.dataset.kind) ? zoneEl.dataset.kind : null;
      state.current.ghost = { ...state.current.ghost, x: ev.clientX, y: ev.clientY, hidden: outside, zone, zoneEl: zone ? zoneEl : null };
      force();
      if (outside || zone) return;
      // 포인터 아래 헤더 셀 → 이동 위치 계산
      // 보이는(높이 있는) 컬럼 헤더 행의 아래쪽 — 빈 고정 영역 행(높이 0)이나 위로 늘린 셀 영향 없음
      const headerRow = [...(core.eRoot?.querySelectorAll('.r2-header-row-column') || [])].find(r => r.offsetHeight > 0 && r.closest('.r2-root') === core.eRoot.querySelector('.r2-root'));
      const y = headerRow ? headerRow.getBoundingClientRect().bottom - 5 : ev.clientY;
      const under = document.elementFromPoint(ev.clientX, y)?.closest?.('.r2-header-cell[col-id]');
      if (!under || !core.eRoot.contains(under)) return;
      const targetId = under.getAttribute('col-id');
      if (targetId === col.colId) return;
      const target = core.getColumn(targetId);
      if (!target || target.pinned !== col.pinned || target.colDef.lockPosition || target.isAuto) return;
      const r = under.getBoundingClientRect();
      const before = core.isRtl() ? ev.clientX > r.left + r.width / 2 : ev.clientX < r.left + r.width / 2;
      const rest = core.allColumns.filter(c => c !== col);
      let idx = rest.indexOf(target) + (before ? 0 : 1);
      const curIdx = core.allColumns.indexOf(col);
      // suppressMoveWhenColumnDragging: 놓을 위치만 표시하고 놓을 때 이동
      if (core.gos.suppressMoveWhenColumnDragging) {
        state.current.pendingMove = idx === curIdx ? null : idx;
        state.current.ghost = { ...state.current.ghost, insertX: before ? r.left : r.right, insertTop: r.top, insertH: r.height };
        force();
        return;
      }
      if (idx === curIdx) return;
      core.moveColumns([col], idx, 'uiColumnMoved');
    };
    const onUp = ev => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.classList.remove('r2-dnd-dragging');
      if (!dragging) return;
      state.current.suppressClick = true;
      setTimeout(() => {
        state.current.suppressClick = false;
      }, 0);
      const g = state.current.ghost;
      state.current.ghost = null;
      force();
      const pending = state.current.pendingMove;
      state.current.pendingMove = null;
      if (pending != null && !g?.zone && !g?.hidden) core.moveColumns([col], pending, 'uiColumnMoved');
      if (g?.zone) {
        // 놓은 위치 기준 삽입 순서
        const chips = [...(g.zoneEl?.querySelectorAll('.r2-column-drop-cell') || [])];
        const horizontal = g.zoneEl?.classList.contains('r2-column-drop-horizontal');
        let idx = chips.findIndex(ch => {
          const r = ch.getBoundingClientRect();
          return horizontal ? ev.clientX < r.left + r.width / 2 : ev.clientY < r.top + r.height / 2;
        });
        if (idx < 0) idx = chips.length;
        dropIntoZone(core, g.zone, col, idx);
      } else if (g?.hidden && !core.gos.suppressDragLeaveHidesColumns && !col.colDef.lockVisible) {
        core.setColumnsVisible([col], false, 'uiColumnDragged');
      }
      core.dispatch('dragStopped', { target: ev.target });
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };
  const g = state.current.ghost;
  const ghost = g
    ? createPortal(
        <PopupLayer core={core}>
          <div ref={ghostRef} className="r2-dnd-ghost r2-unselectable" style={{ position: 'fixed', left: g.x + 12, top: g.y + 12 }}>
            <span className="r2-dnd-ghost-icon r2-shake-left-to-right">
              <Icon name={g.zone === 'rowGroup' ? 'group' : g.zone === 'values' ? 'aggregation' : g.zone === 'pivot' ? 'pivot' : g.hidden ? 'eye-slash' : 'arrows'} />
            </span>
            <div className="r2-dnd-ghost-label">{g.name}</div>
          </div>
          {g.insertX != null && !g.zone && !g.hidden && <div className="r2-column-move-indicator" style={{ position: 'fixed', left: g.insertX - 1, top: g.insertTop, height: g.insertH }} />}
        </PopupLayer>,
        document.body,
      )
    : null;
  return [state, ghost];
}

// autoHeaderHeight 컬럼 헤더의 실제 글자 높이를 재서 헤더 행 높이로 (바뀌면 다시 그림)
function useAutoHeaderHeight(core, ref) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const cells = root.querySelectorAll('.r2-header-cell-auto-height');
    let need = 0;
    cells.forEach(cell => {
      const text = cell.querySelector('.r2-header-cell-text');
      const label = cell.querySelector('.r2-header-cell-label');
      if (!text || !label) return;
      const cs = getComputedStyle(cell);
      const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      need = Math.max(need, Math.ceil(text.scrollHeight + pad + 8));
    });
    const next = cells.length ? need : 0;
    if (next !== (core.autoHeaderPx || 0)) {
      core.autoHeaderPx = next;
      core.notify();
    }
  });
}

export function GridHeader({ core, headerHeight, groupHeaderHeight, scrollbarWidth, registerHeaderViewport }) {
  const autoRef = useRef(null);
  useAutoHeaderHeight(core, autoRef);
  const depth = core.headerGroupDepth;
  const floatingHeight = core.getFloatingFiltersHeight(headerHeight);
  const total = depth * groupHeaderHeight + headerHeight + floatingHeight;
  const [drag, ghost] = useColumnDrag(core);
  if (core.gos.headerHeight === 0) return null;
  return (
    <div ref={autoRef} className="r2-header r2-pivot-off r2-header-allow-overflow" role="presentation" style={{ height: total, minHeight: total }}>
      <div className={cx('r2-pinned-left-header', !core.leftWidth && 'r2-hidden')} role="rowgroup" style={{ width: core.leftWidth, minWidth: core.leftWidth, maxWidth: core.leftWidth }}>
        <HeaderRows core={core} cols={core.displayedLeft} width={core.leftWidth} headerHeight={headerHeight} groupHeaderHeight={groupHeaderHeight} floatingHeight={floatingHeight} drag={drag} />
      </div>
      <div className="r2-header-viewport" role="presentation" ref={registerHeaderViewport}>
        <div className="r2-header-container" role="rowgroup" style={{ width: core.centerWidth }}>
          <HeaderRows core={core} cols={core.displayedCenter} width={core.centerWidth} headerHeight={headerHeight} groupHeaderHeight={groupHeaderHeight} floatingHeight={floatingHeight} drag={drag} />
        </div>
      </div>
      <div className={cx('r2-pinned-right-header', !core.rightWidth && 'r2-hidden')} role="rowgroup" style={{ width: core.rightWidth, minWidth: core.rightWidth, maxWidth: core.rightWidth }}>
        <HeaderRows core={core} cols={core.displayedRight} width={core.rightWidth} headerHeight={headerHeight} groupHeaderHeight={groupHeaderHeight} floatingHeight={floatingHeight} drag={drag} />
      </div>
      {scrollbarWidth > 0 && <div className="r2-header-scrollbar-spacer" style={{ width: scrollbarWidth, minWidth: scrollbarWidth }} />}
      {ghost}
    </div>
  );
}
