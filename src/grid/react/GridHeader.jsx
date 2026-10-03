// 헤더: 좌고정 / 중앙(가로 스크롤 동기화) / 우고정 + 그룹 헤더 행
import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { cx, resolveClassValue } from '../core/utils.js';
import { Checkbox, Icon } from './common.jsx';
import { stableElement } from './renderComponent.js';
import { PopupLayer } from './popup.jsx';
import { FloatingFilterCell } from './filters.jsx';

function groupSegments(cols, level) {
  const segs = [];
  for (const col of cols) {
    const g = col.groupChain[level] || null;
    const last = segs[segs.length - 1];
    if (last && g && last.group === g) {
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
        seg.group ? 'r2-header-group-cell-with-group' : 'r2-header-group-cell-no-group',
        cls,
      )}
      role="columnheader"
      col-id={seg.group?.groupId}
      style={{ ...core.colPos(seg.left), width: seg.width, height }}
      data-r2-tooltip={def?.headerTooltip}
    >
      {seg.group && (
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

function SortIndicator({ col, multi }) {
  const s = col.sort;
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
      <span className="r2-sort-indicator-icon r2-sort-none-icon r2-hidden" aria-hidden="true">
        <Icon name="none" />
      </span>
    </span>
  );
}

function HeaderCell({ core, col, height, multiSortActive, drag }) {
  const cd = col.colDef;
  const legacy = core.gos.columnMenu === 'legacy';
  const sortable = col.isSortable();
  const s = col.sort;
  const headerCls = resolveClassValue(cd.headerClass, { colDef: cd, column: col, api: core.api, context: core.gos.context });
  const style = { ...core.colPos(col.left), width: col.actualWidth, height, ...(typeof cd.headerStyle === 'function' ? cd.headerStyle({ column: col, colDef: cd, api: core.api }) : cd.headerStyle) };
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
    const onMove = ev => core.setColumnWidth(col, startW + (ev.clientX - startX) * dir, false, 'uiColumnResized');
    const onUp = ev => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      core.setColumnWidth(col, startW + (ev.clientX - startX) * dir, true, 'uiColumnResized');
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };

  const showMenuBtn = !isSelection && !col.autoType && !cd.suppressHeaderMenuButton && !cd.suppressMenu;
  // 플로팅 필터가 있으면 필터 버튼은 플로팅 필터 쪽에 (AG 동일)
  const showFilterBtn = !legacy && !!cd.filter && !cd.floatingFilter && !cd.suppressHeaderFilterButton && !col.autoType;
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

  return (
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
        headerCls,
      )}
      col-id={col.colId}
      role="columnheader"
      aria-sort={s === 'asc' ? 'ascending' : s === 'desc' ? 'descending' : 'none'}
      style={style}
      data-r2-tooltip={cd.headerTooltip}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onContextMenu={e => {
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
      className="r2-header-row r2-header-row-column"
      role="row"
      aria-rowindex={depth + 1}
      style={{ top: depth * groupHeaderHeight, height: headerHeight, width }}
    >
      {cols.map(col => (
        <HeaderCell key={col.colId} core={core} col={col} height={headerHeight} multiSortActive={multi} drag={drag} />
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
        state.current.ghost = { name: core.getDisplayName(col), x: ev.clientX, y: ev.clientY, hidden: false };
        document.body.classList.add('r2-dnd-dragging');
      }
      const rootRect = core.eRoot?.getBoundingClientRect();
      const outside =
        rootRect && (ev.clientY < rootRect.top - 30 || ev.clientY > rootRect.bottom + 30 || ev.clientX < rootRect.left - 30 || ev.clientX > rootRect.right + 30);
      // 행 그룹 패널 위 (enableRowGroup 컬럼만 — AG 동일)
      const overPanel =
        !outside &&
        !!col.colDef.enableRowGroup &&
        !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.r2-row-group-panel') &&
        core.eRoot.contains(document.elementFromPoint(ev.clientX, ev.clientY));
      state.current.ghost = { ...state.current.ghost, x: ev.clientX, y: ev.clientY, hidden: outside, group: overPanel };
      force();
      if (outside || overPanel) return;
      // 포인터 아래 헤더 셀 → 이동 위치 계산
      const headerRow = core.eRoot?.querySelector('.r2-header-row-column');
      const y = headerRow ? headerRow.getBoundingClientRect().top + 5 : ev.clientY;
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
      if (g?.group) {
        if (!core.rowGroupColumns().includes(col)) core.api.addRowGroupColumns([col]);
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
              <Icon name={g.group ? 'group' : g.hidden ? 'eye-slash' : 'arrows'} />
            </span>
            <div className="r2-dnd-ghost-label">{g.name}</div>
          </div>
        </PopupLayer>,
        document.body,
      )
    : null;
  return [state, ghost];
}

export function GridHeader({ core, headerHeight, groupHeaderHeight, scrollbarWidth, registerHeaderViewport }) {
  const depth = core.headerGroupDepth;
  const floatingHeight = core.getFloatingFiltersHeight(headerHeight);
  const total = depth * groupHeaderHeight + headerHeight + floatingHeight;
  const [drag, ghost] = useColumnDrag(core);
  if (core.gos.headerHeight === 0) return null;
  return (
    <div className="r2-header r2-pivot-off r2-header-allow-overflow" role="presentation" style={{ height: total, minHeight: total }}>
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
