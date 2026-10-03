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

// ── 사이드바 ───────────────────────────────────────────────
function ToolPanelContent({ core, tp }) {
  const comp = tp.toolPanel;
  if (comp === 'agColumnsToolPanel') {
    return (
      <div className="ag-column-panel">
        <ColumnChooserList core={core} />
      </div>
    );
  }
  if (comp === 'agFiltersToolPanel') return <FiltersToolPanel core={core} />;
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
      className={cx('ag-side-bar ag-focus-managed ag-unselectable', `ag-side-bar-${core.sideBarPosition}`)}
      role="presentation"
      onKeyDown={e => e.stopPropagation()}
    >
      <div className="ag-side-buttons" role="tablist">
        {def.toolPanels.map(tp => {
          const label = (tp.labelKey && core.gos.localeText?.[tp.labelKey]) || tp.labelDefault || tp.id;
          return (
            <div key={tp.id} className={cx('ag-side-button', open === tp.id && 'ag-selected')} role="presentation">
              <button
                type="button"
                className="ag-button ag-side-button-button"
                role="tab"
                aria-expanded={open === tp.id}
                onClick={() => core.onSideButtonClick(tp.id)}
              >
                <div className="ag-side-button-icon-wrapper" aria-hidden="true">
                  <Icon name={tp.iconKey || 'menu'} />
                </div>
                <span className="ag-side-button-label">{label}</span>
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

// ag-hidden 은 classList 로만 토글 (AG 동일). className prop 으로 바꾸면 리렌더 시
// 외부에서 붙인 클래스(CLM: ag-visible / ag-animation-slideOut)가 지워진다.
function ToolPanelWrapper({ hidden, tp, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    ref.current?.classList.toggle('ag-hidden', hidden);
  }, [hidden]);
  return (
    <div
      ref={ref}
      className="ag-tool-panel-wrapper ag-hidden"
      role="tabpanel"
      style={{ width: tp.width, minWidth: tp.minWidth, maxWidth: tp.maxWidth }}
    >
      {children}
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
      <span className="ag-overlay-loading-center" aria-live="polite">
        <span className="ag-loading-icon">
          <Icon name="loading" />
        </span>
        <span className="ag-loading-text">{localeText(core, 'loadingOoo')}</span>
      </span>
    );
  } else {
    content = <span className="ag-overlay-no-rows-center">{localeText(core, 'noRowsToShow')}</span>;
  }
  return (
    <div className={cx('ag-overlay', loading && 'ag-overlay-modal')} aria-hidden="false">
      <div className="ag-overlay-panel" role="presentation">
        <div
          className={cx(
            'ag-overlay-wrapper ag-layout-normal',
            loading ? 'ag-overlay-loading-wrapper' : 'ag-overlay-no-rows-wrapper',
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
  const total = core.sortedNodes.length;
  const page = core.currentPage;
  const pages = core.totalPages;
  const startRow = total ? page * size + 1 : 0;
  const endRow = Math.min(total, (page + 1) * size);
  const fmt = n => n.toLocaleString();
  let selector = g.paginationPageSizeSelector ?? true;
  if (g.paginationAutoPageSize) selector = false;
  let options = Array.isArray(selector) ? selector : [20, 50, 100];
  if (selector && !options.includes(size)) options = [...options, size].sort((a, b) => a - b);
  const btn = (name, disabled, onClick, label) => (
    <div
      className={cx('ag-button ag-paging-button', disabled && 'ag-disabled')}
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
    <div className="ag-paging-panel ag-unselectable" role="presentation">
      {selector && (
        <span className="ag-paging-page-size">
          <span className="ag-paging-page-size-label">{t('pageSizeSelectorLabel')}</span>
          <select
            className="ag-picker-field-wrapper"
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
      <span className="ag-paging-row-summary-panel" role="status">
        <span className="ag-paging-row-summary-panel-number">{fmt(startRow)}</span>
        <span> {t('to')} </span>
        <span className="ag-paging-row-summary-panel-number">{fmt(endRow)}</span>
        <span> {t('of')} </span>
        <span className="ag-paging-row-summary-panel-number">{fmt(total)}</span>
      </span>
      <span className="ag-paging-page-summary-panel" role="presentation">
        {btn('first', page <= 0, () => core.api.paginationGoToFirstPage(), t('first'))}
        {btn('previous', page <= 0, () => core.api.paginationGoToPreviousPage(), t('previous'))}
        <span className="ag-paging-description" role="status">
          <span>{t('page')} </span>
          <span className="ag-paging-number">{pages ? fmt(page + 1) : 0}</span>
          <span> {t('of')} </span>
          <span className="ag-paging-number">{fmt(pages)}</span>
        </span>
        {btn('next', page >= pages - 1, () => core.api.paginationGoToNextPage(), t('next'))}
        {btn('last', page >= pages - 1, () => core.api.paginationGoToLastPage(), t('last'))}
      </span>
    </div>
  );
}

// ── 툴팁 ───────────────────────────────────────────────────
// 셀/헤더에서 data-ag-tooltip 속성을 읽어 지연 표시 (AG 기본 tooltipShowDelay 2000ms)
export function useTooltip(core) {
  const [tip, setTip] = useState(null);
  const timer = useRef(null);
  const hideTimer = useRef(null);
  const onOver = e => {
    if (core.gos.enableBrowserTooltips) return;
    const el = e.target instanceof Element ? e.target.closest('[data-ag-tooltip]') : null;
    if (!el) return;
    const text = el.getAttribute('data-ag-tooltip');
    if (!text) return;
    clearTimeout(timer.current);
    const delay = core.gos.tooltipShowDelay ?? 2000;
    const { clientX, clientY } = e;
    timer.current = setTimeout(() => {
      setTip({ text, x: clientX, y: clientY + 20, el });
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setTip(null), core.gos.tooltipHideDelay ?? 10000);
    }, delay);
  };
  const onOut = e => {
    const el = e.target instanceof Element ? e.target.closest('[data-ag-tooltip]') : null;
    if (!el) return;
    if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
    clearTimeout(timer.current);
    setTip(null);
  };
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
          <div className="ag-tooltip ag-popup-child" style={{ position: 'fixed', left: tip.x, top: tip.y }}>
            {tip.text}
          </div>
        </PopupLayer>,
        document.body,
      )
    : null;
  return { onOver, onOut, node };
}
