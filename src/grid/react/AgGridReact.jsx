// ag-grid-react AgGridReact 호환 컴포넌트
//  <AgGridReact ref={ref} columnDefs rowData gridOptions ... onGridReady ... />  → ref.current.api
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { GridCore, DEFAULT_HEADER_HEIGHT } from '../core/GridCore.js';
import { copySelectionToEvent } from '../core/clipboard.js';
import { cx } from '../core/utils.js';
import { GridHeader } from './GridHeader.jsx';
import { GridBody } from './GridBody.jsx';
import { Overlay, PagingPanel, SideBar, useTooltip } from './chrome.jsx';
import { Popups } from './menus.jsx';
import '../styles/quartz.css';

function isEditableEl(t) {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

function GridView({ core }) {
  const g = core.gos;
  const rootRef = useRef(null);
  const agRootRef = useRef(null);
  const headerVpRef = useRef(null);
  const [sbw, setSbw] = useState(0);
  const tooltip = useTooltip(core);

  useLayoutEffect(() => {
    core.eRoot = rootRef.current;
    core.eFocusSink = agRootRef.current;
  });

  const headerHeight = g.headerHeight ?? DEFAULT_HEADER_HEIGHT;
  const groupHeaderHeight = g.groupHeaderHeight ?? headerHeight;
  const headerTotal = g.headerHeight === 0 ? 0 : core.headerGroupDepth * groupHeaderHeight + headerHeight;
  const rowHeight = core.getDefaultRowHeight();
  const autoLayout = g.domLayout === 'autoHeight' || g.domLayout === 'print';
  const overlay = core.getOverlayType();

  // 이 그리드의 이벤트인지 (중첩 디테일 그리드 제외, body 포털의 팝업 에디터는 포함)
  const owns = e => {
    const t = e.target;
    if (!(t instanceof Element)) return false;
    if (t.closest('.ag-root') === agRootRef.current) return true;
    return !!core.editing && !!t.closest('.ag-popup-editor') && !t.closest('.ag-root');
  };

  const onKeyDown = e => {
    if (!owns(e)) return;
    const t = e.target;
    const inEditor = !!core.editing && t instanceof Element && !!t.closest('.ag-cell-inline-editing,.ag-popup-editor');
    if (!core.editing && t !== agRootRef.current && isEditableEl(t)) return;
    if (core.editing && !inEditor && t !== agRootRef.current && isEditableEl(t)) return;
    if (core.handleKeyDown(e.nativeEvent)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const canClipboard = e => owns(e) && !core.editing && !(isEditableEl(e.target) && e.target !== agRootRef.current);

  return (
    <div
      ref={rootRef}
      className={cx(
        'ag-root-wrapper ag-ltr ag-theme-vars ag-theme-quartz',
        core.theme?.className,
        autoLayout ? 'ag-layout-auto-height' : 'ag-layout-normal',
      )}
      role="presentation"
      grid-id={core.gridId}
      style={{
        '--ag-row-height': `${rowHeight}px`,
        '--ag-header-height': `${headerHeight}px`,
        ...(autoLayout ? { height: 'auto' } : null),
      }}
      onMouseOver={tooltip.onOver}
      onMouseOut={tooltip.onOut}
    >
      <div className={cx('ag-root-wrapper-body ag-focus-managed', autoLayout ? 'ag-layout-auto-height' : 'ag-layout-normal')} role="presentation">
        {core.sideBarPosition === 'left' && <SideBar core={core} />}
        <div
          ref={agRootRef}
          className={cx(
            'ag-root',
            !g.enableCellTextSelection && 'ag-unselectable',
            g.enableCellTextSelection && 'ag-selectable',
            autoLayout ? 'ag-layout-auto-height' : 'ag-layout-normal',
          )}
          role="treegrid"
          tabIndex={0}
          aria-rowcount={core.displayedNodes.length + 1}
          aria-colcount={core.displayedColumns.length}
          onKeyDown={onKeyDown}
          onCopy={e => {
            if (canClipboard(e) && copySelectionToEvent(core, e, false)) e.preventDefault();
          }}
          onCut={e => {
            if (canClipboard(e) && copySelectionToEvent(core, e, true)) e.preventDefault();
          }}
          onPaste={e => {
            if (!canClipboard(e)) return;
            const text = e.clipboardData?.getData('text/plain');
            if (text != null) {
              e.preventDefault();
              core.pasteText(text);
            }
          }}
          onBlur={e => {
            if (!core.editing || !g.stopEditingWhenCellsLoseFocus) return;
            const next = e.relatedTarget;
            if (next instanceof Element && (agRootRef.current?.contains(next) || next.closest('[data-ag-popup]'))) return;
            // 팝업 에디터로 포커스 이동 중일 수 있어 한 틱 뒤 재확인
            setTimeout(() => {
              if (!core.editing) return;
              const a = document.activeElement;
              if (a instanceof Element && (agRootRef.current?.contains(a) || a.closest('[data-ag-popup]'))) return;
              core.stopEditing(false);
            }, 0);
          }}
        >
          <GridHeader
            core={core}
            headerHeight={headerHeight}
            groupHeaderHeight={groupHeaderHeight}
            scrollbarWidth={sbw}
            registerHeaderViewport={el => {
              headerVpRef.current = el;
            }}
          />
          <GridBody core={core} headerVpRef={headerVpRef} focusSinkRef={agRootRef} onScrollbarWidth={setSbw} />
          {overlay && (
            <div className="ag-overlay-host" style={{ top: headerTotal }}>
              <Overlay core={core} type={overlay} />
            </div>
          )}
        </div>
        {core.sideBarPosition !== 'left' && <SideBar core={core} />}
      </div>
      <PagingPanel core={core} />
      <Popups core={core} />
      {tooltip.node}
    </div>
  );
}

export const AgGridReact = forwardRef(function AgGridReact(props, ref) {
  const coreRef = useRef(null);
  if (coreRef.current === null) coreRef.current = new GridCore(props);
  const core = coreRef.current;
  core.__AgGridReact = AgGridReact;
  useSyncExternalStore(core.subscribe, core.getVersion, core.getVersion);

  const mounted = useRef(false);
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    core.applyProps(props);
  });

  useImperativeHandle(ref, () => ({ api: core.api, eGridDiv: core.eRoot }), [core]);

  useEffect(() => {
    core.onMounted();
    return () => core.destroy();
  }, [core]);

  useEffect(() => {
    core.maybeFireFirstDataRendered();
  });

  return <GridView core={core} />;
});

export default AgGridReact;
