// 그리드 주변 UI: 사이드바 / 오버레이 / 페이지 패널 / 툴팁
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { localeText } from '../core/locale.js';
import { cx } from '../core/utils.js';
import { Icon } from './common.jsx';
import { stableElement } from './renderComponent.js';
import { ColumnChooserList } from './menus.jsx';
import { FiltersToolPanel } from './filters.jsx';
import { PopupLayer } from './popup.jsx';
import { ColumnDropZone, PivotModeToggle } from './columnDrop.jsx';

// ── 사이드바 ───────────────────────────────────────────────
function ToolPanelContent({ core, tp }) {
  const comp = tp.toolPanel;
  if (comp === 'r2ColumnsToolPanel') {
    // 컬럼 툴패널: 피벗 모드 토글 / 컬럼 목록 / 행 그룹·값·열 레이블 드롭 영역 (toolPanelParams 로 개별 숨김)
    const p = tp.toolPanelParams || {};
    const pivot = core.isPivotActive();
    return (
      <div className="r2-column-panel">
        {!p.suppressPivotMode && <PivotModeToggle core={core} />}
        <ColumnChooserList core={core} toolPanel showSearch={!p.suppressColumnFilter} />
        {!p.suppressRowGroups && <ColumnDropZone core={core} kind="rowGroup" />}
        {!p.suppressValues && <ColumnDropZone core={core} kind="values" />}
        {pivot && !p.suppressPivots && <ColumnDropZone core={core} kind="pivot" />}
      </div>
    );
  }
  if (comp === 'r2FiltersToolPanel') return <FiltersToolPanel core={core} />;
  const impl = typeof comp === 'string' ? core.gos.components?.[comp] : comp;
  if (!impl) return null;
  return stableElement(core, `toolPanel:${tp.id}`, impl, {
    ...(tp.toolPanelParams || {}),
    api: core.api,
    context: core.gos.context,
    initialState: undefined,
    onStateUpdated: () => {},
  });
}

export function SideBar({ core }) {
  const def = core.sideBarDef;
  if (!def || !core.sideBarVisible || !def.toolPanels.length) return null;
  const open = core.sideBarOpenId;
  return (
    <div
      className={cx('r2-side-bar r2-focus-managed r2-unselectable', `r2-side-bar-${core.sideBarPosition}`)}
      role="presentation"
      onKeyDown={e => e.stopPropagation()}
    >
      <div className="r2-side-buttons" role="tablist">
        {def.toolPanels.map(tp => {
          const label = (tp.labelKey && core.gos.localeText?.[tp.labelKey]) || tp.labelDefault || tp.id;
          return (
            <div key={tp.id} className={cx('r2-side-button', open === tp.id && 'r2-selected')} role="presentation">
              <button
                type="button"
                className="r2-button r2-side-button-button"
                role="tab"
                aria-expanded={open === tp.id}
                onClick={() => core.onSideButtonClick(tp.id)}
              >
                <div className="r2-side-button-icon-wrapper" aria-hidden="true">
                  <Icon name={tp.iconKey || 'menu'} />
                </div>
                <span className="r2-side-button-label">{label}</span>
              </button>
            </div>
          );
        })}
      </div>
      {def.toolPanels.map(tp => (
        <ToolPanelWrapper key={tp.id} hidden={open !== tp.id} tp={tp}>
          {core.mountedPanels.has(tp.id) && <ToolPanelContent core={core} tp={tp} />}
        </ToolPanelWrapper>
      ))}
    </div>
  );
}

// r2-hidden 은 classList 로만 토글. className prop 으로 바꾸면 리렌더 시
// 외부에서 붙인 클래스(CLM: r2-visible / r2-animation-slideOut)가 지워진다.
function ToolPanelWrapper({ hidden, tp, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    ref.current?.classList.toggle('r2-hidden', hidden);
  }, [hidden]);
  return (
    <div
      ref={ref}
      className="r2-tool-panel-wrapper r2-hidden"
      role="tabpanel"
      style={{ width: tp.width, minWidth: tp.minWidth, maxWidth: tp.maxWidth }}
    >
      {children}
    </div>
  );
}

// ── 행 그룹 패널 (rowGroupPanelShow: 'always' | 'onlyWhenGrouping') ──
// pivotPanelShow: 'always' | 'onlyWhenPivoting' — 피벗 모드일 때 같은 줄에 열 레이블 영역
export function RowGroupPanel({ core }) {
  const show = core.gos.rowGroupPanelShow;
  const pshow = core.gos.pivotPanelShow;
  const cols = core.isClientSide() ? core.rowGroupColumns() : [];
  const pivot = core.isPivotActive();
  const showGroups = show === 'always' || (show === 'onlyWhenGrouping' && cols.length > 0);
  const showPivots = pivot && (pshow === 'always' || (pshow === 'onlyWhenPivoting' && core.pivotColumns().length > 0));
  if (!showGroups && !showPivots) return null;
  return (
    <div className="r2-column-drop-wrapper" role="presentation">
      {showGroups && <ColumnDropZone core={core} kind="rowGroup" horizontal />}
      {showPivots && <ColumnDropZone core={core} kind="pivot" horizontal />}
    </div>
  );
}

// ── 상태 표시줄 (statusBar) ───────────────────────────────
const STATUS_PANEL_CLASS = {
  r2TotalAndFilteredRowCountComponent: 'r2-status-panel-total-and-filtered-row-count',
  r2TotalRowCountComponent: 'r2-status-panel-total-row-count',
  r2FilteredRowCountComponent: 'r2-status-panel-filtered-row-count',
  r2SelectedRowCountComponent: 'r2-status-panel-selected-row-count',
  r2AggregationComponent: 'r2-status-panel-aggregations',
};

function NameValue({ name, value, className }) {
  return (
    <div className={cx('r2-status-name-value', className)}>
      <span>{name}</span>:&nbsp;<span className="r2-status-name-value-value">{value}</span>
    </div>
  );
}

function BuiltinStatusPanel({ core, def }) {
  const t = k => localeText(core, k);
  const fmt = n => (typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 4 }) : n);
  const p = def.statusPanelParams || {};
  const c = core.getStatusCounts();
  switch (def.statusPanel) {
    case 'r2TotalAndFilteredRowCountComponent':
      return <NameValue name={t('totalAndFilteredRows')} value={c.filtered === c.total ? fmt(c.total) : `${fmt(c.filtered)} ${t('of')} ${fmt(c.total)}`} />;
    case 'r2TotalRowCountComponent':
      return <NameValue name={t('totalRows')} value={fmt(c.total)} />;
    case 'r2FilteredRowCountComponent':
      return c.filtered === c.total ? null : <NameValue name={t('filteredRows')} value={fmt(c.filtered)} />;
    case 'r2SelectedRowCountComponent':
      return c.selected ? <NameValue name={t('selectedRows')} value={fmt(c.selected)} /> : null;
    case 'r2AggregationComponent': {
      const agg = core.getStatusAggregation();
      if (!agg) return null;
      const funcs = p.aggFuncs || ['count', 'sum', 'min', 'max', 'avg'];
      const vf = p.valueFormatter;
      return funcs
        .filter(f => (f === 'count' ? agg.count > 1 : agg.numCount > 0))
        .map(f => {
          const v = agg[f];
          return (
            <NameValue
              key={f}
              className={`r2-status-name-value-${f}`}
              name={t(f)}
              value={typeof vf === 'function' ? vf({ value: v, key: f, api: core.api, context: core.gos.context }) : fmt(v)}
            />
          );
        });
    }
    default:
      return null;
  }
}

export function StatusBar({ core }) {
  const sb = core.gos.statusBar;
  const panels = sb?.statusPanels;
  if (!Array.isArray(panels) || !panels.length) return null;
  const groups = { left: [], center: [], right: [] };
  panels.forEach((def, i) => {
    const align = def.align === 'left' || def.align === 'center' ? def.align : 'right';
    groups[align].push({ def, i });
  });
  const renderPanel = ({ def, i }) => {
    const key = def.key ?? `${def.statusPanel}-${i}`;
    const biName = typeof def.statusPanel === 'string' && !core.gos.components?.[def.statusPanel] ? def.statusPanel : null;
    const builtin = biName && STATUS_PANEL_CLASS[biName];
    let content;
    if (builtin) content = <BuiltinStatusPanel core={core} def={{ ...def, statusPanel: biName }} />;
    else {
      const impl = typeof def.statusPanel === 'string' ? core.gos.components?.[def.statusPanel] : def.statusPanel;
      content = impl
        ? stableElement(core, `status:${key}`, impl, {
            ...(def.statusPanelParams || {}),
            api: core.api,
            context: core.gos.context,
            ref: inst => core.registerStatusPanel(key, inst),
          })
        : null;
    }
    return (
      <div key={key} className={cx('r2-status-panel', builtin || 'r2-status-panel-custom')}>
        {content}
      </div>
    );
  };
  return (
    <div className="r2-status-bar">
      <div className="r2-status-bar-left">{groups.left.map(renderPanel)}</div>
      <div className="r2-status-bar-center">{groups.center.map(renderPanel)}</div>
      <div className="r2-status-bar-right">{groups.right.map(renderPanel)}</div>
    </div>
  );
}

// ── 오버레이 ───────────────────────────────────────────────
export function Overlay({ core, type }) {
  if (!type) return null;
  const loading = type === 'loading';
  const g = core.gos;
  const comp = loading ? g.loadingOverlayComponent : g.noRowsOverlayComponent;
  const params = loading ? g.loadingOverlayComponentParams : g.noRowsOverlayComponentParams;
  const template = loading ? g.overlayLoadingTemplate : g.overlayNoRowsTemplate;
  let content;
  const impl = typeof comp === 'string' ? g.components?.[comp] : comp;
  if (impl) {
    content = stableElement(core, `overlay:${type}`, impl, { ...(params || {}), api: core.api, context: g.context });
  } else if (template) {
    content = <span dangerouslySetInnerHTML={{ __html: template }} />;
  } else if (loading) {
    content = (
      <span className="r2-overlay-loading-center" aria-live="polite">
        <span className="r2-loading-icon">
          <Icon name="loading" />
        </span>
        <span className="r2-loading-text">{localeText(core, 'loadingOoo')}</span>
      </span>
    );
  } else {
    content = <span className="r2-overlay-no-rows-center">{localeText(core, 'noRowsToShow')}</span>;
  }
  return (
    <div className={cx('r2-overlay', loading && 'r2-overlay-modal')} aria-hidden="false">
      <div className="r2-overlay-panel" role="presentation">
        <div
          className={cx(
            'r2-overlay-wrapper r2-layout-normal',
            loading ? 'r2-overlay-loading-wrapper' : 'r2-overlay-no-rows-wrapper',
          )}
          role="presentation"
        >
          {content}
        </div>
      </div>
    </div>
  );
}

// ── 페이지 패널 ────────────────────────────────────────────
export function PagingPanel({ core }) {
  const g = core.gos;
  if (!g.pagination || g.suppressPaginationPanel) return null;
  const t = k => localeText(core, k);
  const size = core.getPageSize();
  const total = core.paginationRowCount ?? core.displayedNodes.length;
  const page = core.currentPage;
  const pages = core.totalPages;
  const startRow = total ? page * size + 1 : 0;
  const endRow = Math.min(total, (page + 1) * size);
  // paginationNumberFormatter: 페이지 표시줄 숫자 형식
  const fmt = n => (typeof core.gos.paginationNumberFormatter === 'function' ? core.gos.paginationNumberFormatter({ value: n, api: core.api, context: core.gos.context }) : n.toLocaleString());
  let selector = g.paginationPageSizeSelector ?? true;
  if (g.paginationAutoPageSize) selector = false;
  let options = Array.isArray(selector) ? selector : [20, 50, 100];
  if (selector && !options.includes(size)) options = [...options, size].sort((a, b) => a - b);
  const btn = (name, disabled, onClick, label) => (
    <div
      className={cx('r2-button r2-paging-button', disabled && 'r2-disabled')}
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onClick()}
    >
      <Icon name={name} />
    </div>
  );
  return (
    <div className="r2-paging-panel r2-unselectable" role="presentation">
      {selector && (
        <span className="r2-paging-page-size">
          <span className="r2-paging-page-size-label">{t('pageSizeSelectorLabel')}</span>
          <select
            className="r2-picker-field-wrapper"
            value={size}
            onChange={e => core.setGridOption('paginationPageSize', Number(e.target.value))}
          >
            {options.map(o => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </span>
      )}
      <span className="r2-paging-row-summary-panel" role="status">
        <span className="r2-paging-row-summary-panel-number">{fmt(startRow)}</span>
        <span> {t('to')} </span>
        <span className="r2-paging-row-summary-panel-number">{fmt(endRow)}</span>
        <span> {t('of')} </span>
        <span className="r2-paging-row-summary-panel-number">{fmt(total)}</span>
      </span>
      <span className="r2-paging-page-summary-panel" role="presentation">
        {btn('first', page <= 0, () => core.api.paginationGoToFirstPage(), t('first'))}
        {btn('previous', page <= 0, () => core.api.paginationGoToPreviousPage(), t('previous'))}
        <span className="r2-paging-description" role="status">
          <span>{t('page')} </span>
          <span className="r2-paging-number">{pages ? fmt(page + 1) : 0}</span>
          <span> {t('of')} </span>
          <span className="r2-paging-number">{fmt(pages)}</span>
        </span>
        {btn('next', page >= pages - 1, () => core.api.paginationGoToNextPage(), t('next'))}
        {btn('last', page >= pages - 1, () => core.api.paginationGoToLastPage(), t('last'))}
      </span>
    </div>
  );
}

// ── 툴팁 ───────────────────────────────────────────────────
// 셀/헤더의 data-r2-tooltip 을 지연 표시 (기본 tooltipShowDelay 2000ms)
//  tooltipShowMode 'whenTruncated' (잘린 글자만), tooltipMouseTrack (마우스 따라감), tooltipInteraction (툴팁 위에 올려도 유지),
//  tooltipTrigger 'focus' (키보드로 셀에 포커스하면 표시), colDef.tooltipComponent / tooltipComponentSelector / tooltipComponentParams
function tooltipTarget(core, el) {
  const cell = el.closest('.r2-cell[col-id], .r2-header-cell[col-id], .r2-header-group-cell[col-id]');
  if (!cell) return null;
  const colId = cell.getAttribute('col-id');
  if (cell.classList.contains('r2-cell')) {
    const row = cell.closest('.r2-row[row-index]');
    const node = row ? core.nodeFromRowKey(row.getAttribute('row-index')) : null;
    const column = core.getColumn(colId);
    return node && column ? { location: 'cell', node, column, colDef: column.colDef } : null;
  }
  const column = core.getColumn(colId);
  if (column) return { location: 'header', column, colDef: column.colDef };
  const group = core.groupById?.get(colId);
  return group ? { location: 'headerGroup', columnGroup: group, colDef: group.colGroupDef } : null;
}

export function useTooltip(core) {
  const [tip, setTip] = useState(null);
  const timer = useRef(null);
  const hideTimer = useRef(null);
  const overTip = useRef(false);
  const g = () => core.gos;
  const hide = () => {
    clearTimeout(timer.current);
    clearTimeout(hideTimer.current);
    setTip(prev => {
      if (prev) core.dispatch('tooltipHide', { parentGui: prev.el });
      return null;
    });
  };
  const show = (el, x, y) => {
    const text = el.getAttribute('data-r2-tooltip');
    if (!text) return;
    // 잘린 경우에만 (tooltipShowMode: 'whenTruncated')
    if (g().tooltipShowMode === 'whenTruncated') {
      const box = el.querySelector('.r2-cell-wrapper, .r2-header-cell-text, .r2-group-value') || el;
      if (box.scrollWidth <= box.clientWidth && box.scrollHeight <= box.clientHeight + 1) return;
    }
    const target = tooltipTarget(core, el);
    const cd = target?.colDef || {};
    const sel = typeof cd.tooltipComponentSelector === 'function' ? cd.tooltipComponentSelector({ ...target, value: text, api: core.api, context: g().context }) : null;
    let comp = sel?.component ?? cd.tooltipComponent;
    if (typeof comp === 'string') comp = g().components?.[comp];
    const params = comp
      ? {
          ...target,
          value: text,
          valueFormatted: text,
          data: target?.node?.data,
          rowIndex: target?.node?.rowIndex,
          api: core.api,
          context: g().context,
          hideTooltipCallback: hide,
          ...(cd.tooltipComponentParams || {}),
          ...(sel?.params || {}),
        }
      : null;
    setTip({ text, x, y: y + 20, el, comp, params });
    core.dispatch('tooltipShow', { parentGui: el });
    clearTimeout(hideTimer.current);
    if (!g().tooltipInteraction) hideTimer.current = setTimeout(hide, g().tooltipHideDelay ?? 10000);
  };
  const onOver = e => {
    if (g().enableBrowserTooltips || g().tooltipTrigger === 'focus') return;
    const el = e.target instanceof Element ? e.target.closest('[data-r2-tooltip]') : null;
    if (!el || !el.getAttribute('data-r2-tooltip')) return;
    if (tip && tip.el === el) return;
    clearTimeout(timer.current);
    const { clientX, clientY } = e;
    timer.current = setTimeout(() => show(el, clientX, clientY), g().tooltipShowDelay ?? 2000);
  };
  const onOut = e => {
    const el = e.target instanceof Element ? e.target.closest('[data-r2-tooltip]') : null;
    if (!el) return;
    if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
    clearTimeout(timer.current);
    // 상호작용: 툴팁으로 옮겨가는 동안 잠시 유지
    if (g().tooltipInteraction && tip) {
      setTimeout(() => !overTip.current && hide(), 200);
      return;
    }
    hide();
  };
  const onMove = e => {
    if (!g().tooltipMouseTrack || !tip) return;
    setTip(t => (t ? { ...t, x: e.clientX, y: e.clientY + 20 } : t));
  };
  // tooltipTrigger 'focus': 셀 포커스 시 바로 표시
  useEffect(() => {
    if (g().tooltipTrigger !== 'focus') return undefined;
    const onFocus = ev => {
      setTimeout(() => {
        const root = core.eRoot;
        const col = ev.column?.colId;
        if (!root || !col || ev.rowIndex == null) return hide();
        const key = ev.rowPinned ? `${ev.rowPinned[0]}-${ev.rowIndex}` : String(ev.rowIndex);
        const el = root.querySelector(`.r2-row[row-index="${key}"] .r2-cell[col-id="${CSS.escape(col)}"][data-r2-tooltip]`);
        if (!el) return hide();
        const r = el.getBoundingClientRect();
        show(el, r.left + 8, r.bottom - 14);
      }, 0);
    };
    core.events.addEventListener('cellFocused', onFocus);
    return () => core.events.removeEventListener('cellFocused', onFocus);
  });
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(hideTimer.current);
    },
    [],
  );
  const node = tip
    ? createPortal(
        <PopupLayer core={core}>
          <div
            className={cx('r2-tooltip r2-popup-child', tip.comp && 'r2-tooltip-custom', g().tooltipInteraction && 'r2-tooltip-interactive')}
            style={{ position: 'fixed', left: tip.x, top: tip.y }}
            onMouseEnter={() => (overTip.current = true)}
            onMouseLeave={() => {
              overTip.current = false;
              if (g().tooltipInteraction) hide();
            }}
          >
            {tip.comp ? React.createElement(tip.comp, tip.params) : tip.text}
          </div>
        </PopupLayer>,
        document.body,
      )
    : null;
  return { onOver, onOut, onMove, node };
}
