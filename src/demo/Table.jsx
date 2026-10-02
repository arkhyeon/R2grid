// CLM30 src/components/PageTemplate/Table.jsx 를 거의 그대로 이식 (emotion/router/zustand 의존만 제거)
// → 자체 그리드가 CLM 래퍼 사용 방식 그대로 동작하는지 검증용
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { AG_GRID_LOCALE_KR, AgGridReact } from '../grid/index.js';

const alertError = msg => window.alert(msg);

function NoRowsOverlayComponent(props) {
  return <div className="flex-cc h-100">{props?.overlayNoRowsTemplate ?? '조회된 데이터가 없습니다.'}</div>;
}
function LoadingOverlayComponent() {
  return (
    <div className="flex-cc" style={{ height: '100%' }}>
      <div className="clm-loader" />
    </div>
  );
}

export default function Table({ width, height, ref, gridOptions, menuRole = 2, ...props }) {
  const wrapperRef = useRef(null);
  const mergedGridOptions = useMemo(
    () => ({ cellSelection: true, copyHeadersToClipboard: true, ...gridOptions }),
    [gridOptions],
  );
  const cellSelectionEnabled = !!mergedGridOptions?.cellSelection;
  useEffect(() => {
    if (!cellSelectionEnabled) return undefined;
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    const handler = e => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('.ag-pinned-left-cols-container') ||
        target.closest('.ag-selection-column') ||
        target.closest('.ag-row-number')
      ) {
        e.stopImmediatePropagation();
      }
    };
    wrapper.addEventListener('pointerdown', handler, true);
    return () => wrapper.removeEventListener('pointerdown', handler, true);
  }, [cellSelectionEnabled]);

  const onToolPanelVisibleChanged = useCallback(params => {
    const handleClickOutside = event => {
      const gridElement = document.querySelector('.ag-root');
      const sidebarElement = document.querySelector('.ag-side-bar');
      if (sidebarElement?.contains(event.target) || !sidebarElement?.offsetParent || gridElement?.contains(event.target)) return;
      if (params.api.isSideBarVisible()) {
        document.removeEventListener('mousedown', handleClickOutside);
        params.api.closeToolPanel();
      }
    };
    const { source, api, visible } = params;
    if (!visible) return;
    if (props?.onToolPanelVisibleChanged) props.onToolPanelVisibleChanged(params);
    const openedPanel = api.getSideBar()?.toolPanels?.find(tp => tp.id === params.key);
    if (!openedPanel?.ignoreSelectedRowGuard) {
      const mustHaveSelectedRow = api.getSideBar().toolPanels[0].mustHaveSelectedRow;
      if (mustHaveSelectedRow && !api.getSelectedRows()[0]) {
        alertError('먼저 행을 선택해 주세요.');
        api.closeToolPanel();
        return;
      }
    }
    const target = document.querySelector('.ag-tool-panel-wrapper');
    if (source) {
      setTimeout(() => target?.classList.add('ag-visible'), 300);
      document.addEventListener('mousedown', handleClickOutside);
    }
  }, []);

  const getContextMenuItems = params => {
    if (!props?.getContextMenuItems) return [];
    return props.getContextMenuItems(params);
  };

  const processedColDefs = useMemo(() => {
    if (!props.columnDefs) return [];
    if (menuRole !== 2) return props.columnDefs.map(colDef => ({ ...colDef, editable: false }));
    return props.columnDefs;
  }, [props.columnDefs, menuRole]);

  const defaultColDef = useMemo(
    () => ({
      resizable: true,
      sortable: true,
      flex: 1,
      filter: true,
      menuTabs: ['filterMenuTab', 'generalMenuTab', 'columnsMenuTab'],
      filterParams: {
        valueFormatter: p => {
          if (typeof p.colDef.valueFormatter === 'function') return p.colDef.valueFormatter(p);
          return typeof p?.value === 'string' ? p.value.replace(/\s*<br>\s*/gi, ' | ').replace(/[\n\r]/g, '') : p?.value;
        },
      },
      ...props.defaultColDef,
    }),
    [props.defaultColDef],
  );

  return (
    <div ref={wrapperRef} className="ag-theme-alpine clm-table-wrapper" style={{ width: width ?? '100%', height: height ?? '300px' }}>
      <AgGridReact
        {...props}
        gridOptions={mergedGridOptions}
        columnDefs={processedColDefs}
        localeText={AG_GRID_LOCALE_KR}
        ref={ref}
        defaultColDef={defaultColDef}
        onCellKeyDown={({ event, api }) => {
          if (!event) return;
          if (api.getSideBar()) {
            switch (event.key) {
              case 'Escape':
                api.closeToolPanel();
                break;
              case '1':
              case '2':
              case '3':
              case '4':
                if (event.altKey) api.openToolPanel(api.getSideBar().toolPanels[event.key - 1]?.id);
                break;
              default:
                break;
            }
          }
        }}
        columnMenu="legacy"
        onGridReady={e => props?.onGridReady?.(e)}
        headerHeight={33}
        rowHeight={30}
        stopEditingWhenCellsLoseFocus
        onToolPanelVisibleChanged={onToolPanelVisibleChanged}
        getContextMenuItems={getContextMenuItems}
        noRowsOverlayComponent={() => NoRowsOverlayComponent(props)}
        loadingOverlayComponent={LoadingOverlayComponent}
        loadingCellRenderer={() => ''}
        detailCellRendererParams={{
          ...props?.detailCellRendererParams,
          detailGridOptions: {
            ...(props?.detailCellRendererParams?.detailGridOptions || {}),
            headerHeight: 33,
            rowHeight: 30,
            suppressContextMenu: true,
          },
        }}
        onRowDataUpdated={e => {
          e.api.setGridOption('loading', false);
          props?.onRowDataUpdated?.(e);
        }}
      />
    </div>
  );
}
