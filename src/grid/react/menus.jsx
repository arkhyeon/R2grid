// 컨텍스트 메뉴 / 컬럼 메뉴(legacy 탭형 + new 리스트형) / 컬럼 선택기
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { localeText } from '../core/locale.js';
import { cx } from '../core/utils.js';
import { Checkbox, Icon } from './common.jsx';
import { PopupLayer, useClickOutside, usePopupPosition, visibleClipOf } from './popup.jsx';
import { FilterUI } from './filters.jsx';
import { AdvancedFilterBuilderPopup } from './advancedFilter.jsx';
import { CHART_TYPES } from '../core/charts.js';
import { DND_TYPE, dropIntoZone, removeFromZone, setDragColumn } from './columnDrop.jsx';

// ── 메뉴 아이템 정규화 ─────────────────────────────────────
function builtinItem(core, key, params) {
  const t = k => localeText(core, k);
  const col = params?.column;
  switch (key) {
    case 'copy':
      return { name: t('copy'), shortcut: t('ctrlC'), icon: 'copy', action: () => core.api.copyToClipboard() };
    case 'copyWithHeaders':
      return { name: t('copyWithHeaders'), icon: 'copy', action: () => core.api.copyToClipboard({ includeHeaders: true }) };
    case 'copyWithGroupHeaders':
      return { name: t('copyWithGroupHeaders'), icon: 'copy', action: () => core.api.copyToClipboard({ includeHeaders: true, includeGroupHeaders: true }) };
    case 'cut':
      return { name: t('cut'), shortcut: t('ctrlX'), icon: 'cut', action: () => core.api.cutToClipboard() };
    case 'paste':
      return {
        name: t('paste'),
        shortcut: t('ctrlV'),
        icon: 'paste',
        disabled: !navigator.clipboard?.readText,
        action: () => core.api.pasteFromClipboard(),
      };
    case 'export':
      return { name: t('export'), icon: 'save', subMenu: ['csvExport', 'excelExport'] };
    case 'csvExport':
      return { name: t('csvExport'), icon: 'csv', action: () => core.api.exportDataAsCsv() };
    case 'excelExport':
      return { name: t('excelExport'), icon: 'excel', action: () => core.api.exportDataAsExcel() };
    case 'autoSizeAll':
      return { name: t('autosizeAllColumns'), action: () => core.api.autoSizeAllColumns() };
    case 'autoSizeThis':
      return col ? { name: t('autosizeThiscolumn'), action: () => core.api.autoSizeColumns([col]) } : null;
    case 'resetColumns':
      return { name: t('resetColumns'), action: () => core.api.resetColumnState() };
    case 'expandAll':
      return { name: t('expandAll'), action: () => core.api.expandAll() };
    case 'contractAll':
      return { name: t('collapseAll'), action: () => core.api.collapseAll() };
    case 'pinSubMenu':
      if (!col || col.colDef.lockPinned) return null;
      return {
        name: t('pinColumn'),
        icon: 'pin',
        subMenu: [
          { name: t('noPin'), checked: !col.pinned, action: () => core.api.setColumnsPinned([col], null) },
          { name: t('pinLeft'), checked: col.pinned === 'left', action: () => core.api.setColumnsPinned([col], 'left') },
          { name: t('pinRight'), checked: col.pinned === 'right', action: () => core.api.setColumnsPinned([col], 'right') },
        ],
      };
    case 'pinRowSubMenu': {
      const node = params?.node;
      if (!node || !core.gos.enableRowPinning || !(node.manualPinned || core.isRowPinnableNode(node))) return null;
      const cur = core.manualPinPosition(node);
      const sub = [];
      if (core.rowPinningAllowed('top')) sub.push({ name: t('pinTop'), checked: cur === 'top', action: () => core.pinRowManual(node, 'top', 'contextMenu') });
      if (core.rowPinningAllowed('bottom')) sub.push({ name: t('pinBottom'), checked: cur === 'bottom', action: () => core.pinRowManual(node, 'bottom', 'contextMenu') });
      sub.push({ name: t('unpinRow'), checked: !cur, disabled: !cur, action: () => core.pinRowManual(node, null, 'contextMenu') });
      return { name: t('pinRow'), icon: 'pin', subMenu: sub };
    }
    case 'sortAscending':
      return col && col.isSortable() ? { name: t('sortAscending'), icon: 'asc', action: () => core.setColumnSort(col, 'asc', false, 'columnMenu') } : null;
    case 'sortDescending':
      return col && col.isSortable() ? { name: t('sortDescending'), icon: 'desc', action: () => core.setColumnSort(col, 'desc', false, 'columnMenu') } : null;
    case 'sortUnSort':
      return col && col.sort ? { name: t('sortUnSort'), icon: 'none', action: () => core.setColumnSort(col, null, false, 'columnMenu') } : null;
    case 'columnFilter':
      return col && col.colDef.filter && !core.isAdvancedFilterEnabled()
        ? { name: t('columnFilter'), icon: 'filter', action: () => setTimeout(() => core.openPopup({ type: 'filter', column: col, anchorColId: col.colId }), 0) }
        : null;
    case 'columnChooser':
      return { name: t('columnChooser'), icon: 'columns', action: () => setTimeout(() => core.openPopup({ type: 'columnChooser' }), 0) };
    case 'chartRange':
      return core.gos.enableCharts && core.ranges.length
        ? {
            name: t('chartRange', '범위 차트'),
            icon: 'chart',
            subMenu: CHART_TYPES.map(([k, label]) => ({ name: label, action: () => core.createRangeChart({ chartType: k }) })),
          }
        : null;
    case 'pivotChart':
      return core.gos.enableCharts && core.isPivotActive?.()
        ? {
            name: t('pivotChart', '피벗 차트'),
            icon: 'chart',
            subMenu: CHART_TYPES.map(([k, label]) => ({ name: label, action: () => core.createPivotChart({ chartType: k }) })),
          }
        : null;
    case 'separator':
      return 'separator';
    default:
      return null;
  }
}

function normalizeItems(core, items, params) {
  const out = [];
  (items || []).forEach(it => {
    const n = typeof it === 'string' ? builtinItem(core, it, params) : it;
    if (!n) return;
    if (n === 'separator') {
      if (out.length && out[out.length - 1] !== 'separator') out.push('separator');
      return;
    }
    out.push(n);
  });
  while (out[out.length - 1] === 'separator') out.pop();
  while (out[0] === 'separator') out.shift();
  return out;
}

function ItemIcon({ icon, checked }) {
  if (checked) return <Icon name="tick" />;
  if (!icon) return null;
  if (typeof icon === 'string') {
    if (/^[a-z-]+$/i.test(icon)) return <Icon name={icon} />;
    return <span dangerouslySetInnerHTML={{ __html: icon }} />;
  }
  if (icon instanceof Element) return <span ref={el => el && !el.firstChild && el.appendChild(icon.cloneNode(true))} />;
  return icon;
}

export function MenuList({ core, items, params, onClose, autoFocus = true }) {
  const list = useMemo(() => normalizeItems(core, items, params), [items]);
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState(null); // { index, rect }
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, []);
  const run = (item, i, e) => {
    if (item === 'separator' || item.disabled) return;
    if (item.subMenu) {
      setSub({ index: i, rect: e?.currentTarget?.getBoundingClientRect() });
      return;
    }
    item.action?.({ ...params });
    if (!item.suppressCloseOnSelect) onClose();
  };
  const move = dir => {
    let i = active;
    for (let k = 0; k < list.length; k++) {
      i = (i + dir + list.length) % list.length;
      if (list[i] !== 'separator' && !list[i].disabled) break;
    }
    setActive(i);
  };
  return (
    <div
      ref={ref}
      className="r2-menu-list r2-focus-managed"
      role="menu"
      tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'ArrowDown') move(1);
        else if (e.key === 'ArrowUp') move(-1);
        else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
          if (active >= 0) {
            const el = ref.current?.children[active];
            run(list[active], active, { currentTarget: el });
          }
        } else if (e.key === 'Escape' || e.key === 'ArrowLeft') onClose(e.key);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {list.map((item, i) => {
        if (item === 'separator') {
          return (
            <div key={`sep${i}`} className="r2-menu-separator" aria-hidden="true">
              <div className="r2-menu-separator-part" />
              <div className="r2-menu-separator-part" />
              <div className="r2-menu-separator-part" />
              <div className="r2-menu-separator-part" />
            </div>
          );
        }
        return (
          <div
            key={i}
            className={cx(
              'r2-menu-option',
              active === i && 'r2-menu-option-active',
              item.disabled && 'r2-menu-option-disabled',
              Array.isArray(item.cssClasses) ? item.cssClasses.join(' ') : item.cssClasses,
            )}
            role="menuitem"
            aria-disabled={!!item.disabled}
            title={item.tooltip}
            onMouseEnter={e => {
              setActive(i);
              if (item.subMenu && !item.disabled) setSub({ index: i, rect: e.currentTarget.getBoundingClientRect() });
              else setSub(null);
            }}
            onClick={e => run(item, i, e)}
          >
            <span className="r2-menu-option-part r2-menu-option-icon" role="presentation">
              <ItemIcon icon={item.icon} checked={item.checked} />
            </span>
            <span className="r2-menu-option-part r2-menu-option-text">{item.name}</span>
            <span className="r2-menu-option-part r2-menu-option-shortcut">{item.shortcut}</span>
            <span className="r2-menu-option-part r2-menu-option-popup-pointer">
              {item.subMenu ? <Icon name="small-right" /> : null}
            </span>
          </div>
        );
      })}
      {sub && list[sub.index]?.subMenu && (
        <SubMenu
          core={core}
          items={list[sub.index].subMenu}
          params={params}
          rect={sub.rect}
          onClose={reason => {
            setSub(null);
            if (reason !== 'ArrowLeft' && reason !== 'Escape') onClose();
            else ref.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
  );
}

function SubMenu({ core, items, params, rect, onClose }) {
  const ref = useRef(null);
  const pos = usePopupPosition(ref, () => (rect ? { x: rect.right, y: rect.top - 4, alignRight: rect.left } : null), [rect], core);
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        data-r2-subpopup-of=""
        className="r2-menu r2-ltr r2-popup-child r2-sub-menu"
        style={pos.style}
        onMouseDown={e => e.stopPropagation()}
      >
        <MenuList core={core} items={items} params={params} onClose={onClose} />
      </div>
    </PopupLayer>,
    core.getPopupParent(),
  );
}

export function ContextMenuPopup({ core, popup }) {
  const ref = useRef(null);
  const close = () => {
    core.closePopup();
    core.dispatch('contextMenuVisibleChanged', { visible: false, source: 'ui' });
    core.focusGrid();
  };
  useClickOutside(ref, close, { ignore: t => t instanceof Element && !!t.closest('[data-r2-subpopup-of]') });
  const pos = usePopupPosition(ref, () => ({ x: popup.x, y: popup.y, flipY: popup.y }), [popup], core);
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        className="r2-menu r2-ltr r2-popup-child r2-context-menu"
        style={pos.style}
        onContextMenu={e => e.preventDefault()}
      >
        <MenuList core={core} items={popup.items} params={popup.params} onClose={close} />
      </div>
    </PopupLayer>,
    core.getPopupParent(),
  );
}

// ── 컬럼 선택기 (columnsMenuTab / 컬럼 툴패널 / columnChooser 공용) ──
export function ColumnChooserList({ core, showSearch = true, toolPanel = false }) {
  const [search, setSearch] = useState('');
  const pivotUi = toolPanel && core.isPivotActive();
  const cols = core.allColumns.filter(c => !c.colDef.suppressColumnsToolPanel && !c.isAuto && !c.isPivotResult);
  // 피벗 모드: 체크 = 값/행 그룹/피벗 중 허용된 첫 역할에 넣기·빼기 (AG 컬럼 툴패널 동일)
  const pivotRole = c => (c.colDef.enableValue ? 'values' : c.colDef.enableRowGroup ? 'rowGroup' : c.colDef.enablePivot ? 'pivot' : null);
  // 어느 영역(값/행 그룹/열 레이블)에든 들어 있으면 체크
  const rolesOf = c => [
    !!c.colDef.aggFunc && 'values',
    core.rowGroupColumns().includes(c) && 'rowGroup',
    core.pivotColumns().includes(c) && 'pivot',
  ].filter(Boolean);
  const inRole = c => rolesOf(c).length > 0;
  const toggleRole = c => {
    const roles = rolesOf(c);
    if (roles.length) roles.forEach(r => removeFromZone(core, r, c));
    else if (pivotRole(c)) dropIntoZone(core, pivotRole(c), c);
  };
  const isOn = c => (pivotUi ? inRole(c) : c.visible);
  const toggle = c => (pivotUi ? toggleRole(c) : !c.colDef.lockVisible && core.setColumnsVisible([c], !c.visible, 'toolPanelUi'));
  // 끌기: 목록 안 순서 변경(suppressMovable·lockPosition 제외) 또는 드롭 영역으로 (AG 컬럼 툴패널 동일)
  const movable = c => !c.colDef.suppressMovable && !c.colDef.lockPosition;
  const canDrag = c => toolPanel && (movable(c) || c.colDef.enableRowGroup || c.colDef.enableValue || c.colDef.enablePivot);
  const s = search.trim().toLowerCase();
  const shown = s ? cols.filter(c => core.getDisplayName(c, true).toLowerCase().includes(s)) : cols;
  const listRef = useRef(null);
  const [insertAt, setInsertAt] = useState(null); // 삽입 표시 위치 (shown 인덱스)
  const indexAt = e => {
    const items = [...(listRef.current?.querySelectorAll('.r2-column-select-column') || [])];
    const i = items.findIndex(it => {
      const r = it.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    return i < 0 ? items.length : i;
  };
  const listDnd = toolPanel
    ? {
        onDragOver: e => {
          if (![...e.dataTransfer.types].includes(DND_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const i = indexAt(e);
          if (i !== insertAt) setInsertAt(i);
        },
        onDragLeave: e => {
          if (!e.currentTarget.contains(e.relatedTarget)) setInsertAt(null);
        },
        onDrop: e => {
          setInsertAt(null);
          let d;
          try {
            d = JSON.parse(e.dataTransfer.getData(DND_TYPE) || 'null');
          } catch {
            d = null;
          }
          const col = d && core.getColumn(d.colId);
          if (!col) return;
          e.preventDefault();
          // 드롭 영역 칩을 목록에 놓으면 그 영역에서 빼기
          if (d.from) {
            removeFromZone(core, d.from, col);
            return;
          }
          if (!movable(col)) return;
          const i = indexAt(e);
          const rest = core.allColumns.filter(c => c !== col);
          const target = shown.filter(c => c !== col)[shown.slice(0, i).filter(c => c !== col).length];
          const lastShown = shown.filter(c => c !== col).at(-1);
          const toIndex = target ? rest.indexOf(target) : lastShown ? rest.indexOf(lastShown) + 1 : rest.length;
          if (core.allColumns.indexOf(col) !== toIndex) core.moveColumns([col], toIndex, 'toolPanelUi');
        },
      }
    : {};
  const visibleCount = shown.filter(isOn).length;
  const allState = !shown.length ? false : visibleCount === shown.length ? true : visibleCount === 0 ? false : null;
  return (
    <div className="r2-column-select" role="presentation">
      <div className="r2-column-select-header" role="presentation">
        <Checkbox
          className="r2-column-select-header-checkbox"
          checked={allState}
          onToggle={() =>
            pivotUi
              ? shown.filter(c => isOn(c) === (allState === true)).forEach(toggleRole)
              : core.setColumnsVisible(shown.filter(c => !c.colDef.lockVisible), allState !== true, 'toolPanelUi')
          }
        />
        {showSearch && (
          <div className="r2-column-select-header-filter-wrapper r2-text-field r2-input-field">
            <input
              className="r2-input-field-input r2-text-field-input"
              placeholder={localeText(core, 'searchOoo')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
            />
          </div>
        )}
      </div>
      <div ref={listRef} className="r2-column-select-list" role="tree" {...listDnd}>
        {shown.map((c, i) => (
          <div
            key={c.colId}
            data-insert-before={insertAt === i || undefined}
            data-insert-after={insertAt === shown.length && i === shown.length - 1 ? true : undefined}
            className={cx(
              'r2-column-select-column',
              canDrag(c) && 'r2-column-select-column-draggable',
              typeof c.colDef?.toolPanelClass === 'function' ? c.colDef.toolPanelClass({ colDef: c.colDef, column: c, api: core.api, context: core.gos.context }) : c.colDef?.toolPanelClass,
            )}
            style={{ paddingLeft: 8 + c.groupChain.length * 16 }}
            role="treeitem"
            draggable={canDrag(c) || undefined}
            onDragStart={canDrag(c) ? e => setDragColumn(e, c, null) : undefined}
            onClick={() => toggle(c)}
          >
            {canDrag(c) && (
              <span className="r2-column-select-column-drag-handle">
                <Icon name="grip" />
              </span>
            )}
            <Checkbox
              className="r2-column-select-checkbox"
              checked={isOn(c)}
              disabled={!pivotUi && !!c.colDef.lockVisible}
              onToggle={() => toggle(c)}
            />
            <span className="r2-column-select-column-label">{core.getDisplayName(c, true)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_LEGACY_TABS = ['generalMenuTab', 'filterMenuTab', 'columnsMenuTab'];

function mainMenuItems(core, column, legacy) {
  const defaults = legacy
    ? ['pinSubMenu', 'separator', 'autoSizeThis', 'autoSizeAll', 'separator', 'resetColumns']
    : [
        'sortAscending',
        'sortDescending',
        'sortUnSort',
        'separator',
        'columnFilter',
        'separator',
        'pinSubMenu',
        'separator',
        'autoSizeThis',
        'autoSizeAll',
        'separator',
        'columnChooser',
        'resetColumns',
      ];
  const fromColDef = column.colDef.mainMenuItems;
  if (Array.isArray(fromColDef)) return fromColDef;
  const fn = typeof fromColDef === 'function' ? fromColDef : core.gos.getMainMenuItems;
  if (typeof fn === 'function') {
    return fn({ column, api: core.api, context: core.gos.context, defaultItems: defaults });
  }
  return defaults;
}

export function ColumnMenuPopup({ core, popup }) {
  const { column } = popup;
  const legacy = core.gos.columnMenu === 'legacy';
  const ref = useRef(null);
  const tabs = (column.colDef.menuTabs || DEFAULT_LEGACY_TABS).filter(
    t => t !== 'filterMenuTab' || (!!column.colDef.filter && !core.isAdvancedFilterEnabled()),
  );
  const [tab, setTab] = useState(() => popup.tab ?? (tabs[0] || 'generalMenuTab'));
  const close = () => {
    core.closePopup();
    core.focusGrid();
  };
  useClickOutside(ref, close, {
    ignore: t => t instanceof Element && (!!t.closest('[data-r2-subpopup-of]') || !!t.closest('.r2-header-cell-menu-button')),
  });
  const pos = usePopupPosition(
    ref,
    () => {
      if (popup.x != null) return { x: popup.x, y: popup.y };
      const anchor =
        popup.anchorEl ||
        core.eRoot?.querySelector(`.r2-header-cell[col-id="${CSS.escape(column.colId)}"]`);
      if (!anchor) return { x: 100, y: 100 };
      const r = anchor.getBoundingClientRect();
      return { x: legacy ? r.right - 220 : r.left, y: r.bottom, alignTo: r, clip: visibleClipOf(anchor) };
    },
    [popup, tab],
    core,
    { track: popup.x == null },
  );
  const params = { column, api: core.api, context: core.gos.context };
  let body;
  if (!legacy) {
    body = <MenuList core={core} items={mainMenuItems(core, column, false)} params={params} onClose={close} />;
  } else {
    body = (
      <>
        <div className="r2-tabs-header r2-menu-header" role="tablist">
          {tabs.map(t => (
            <span
              key={t}
              className={cx('r2-tab', tab === t && 'r2-tab-selected')}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              <Icon name={t === 'filterMenuTab' ? 'filter' : t === 'columnsMenuTab' ? 'columns' : 'menu'} />
            </span>
          ))}
        </div>
        <div className="r2-tabs-body r2-menu-body" role="presentation">
          {tab === 'filterMenuTab' && <FilterUI core={core} column={column} onClose={close} />}
          {tab === 'generalMenuTab' && (
            <MenuList core={core} items={mainMenuItems(core, column, true)} params={params} onClose={close} autoFocus={false} />
          )}
          {tab === 'columnsMenuTab' && <ColumnChooserList core={core} />}
        </div>
      </>
    );
  }
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        className={cx('r2-menu r2-ltr r2-popup-child r2-column-menu', legacy ? 'r2-tabs' : 'r2-column-menu-new')}
        style={pos.style}
        onKeyDown={e => {
          if (e.key === 'Escape') close();
        }}
      >
        {body}
      </div>
    </PopupLayer>,
    core.getPopupParent(),
  );
}

export function FilterPopup({ core, popup }) {
  const { column } = popup;
  const ref = useRef(null);
  const close = () => {
    core.closePopup();
    core.focusGrid();
  };
  useClickOutside(ref, close, {
    ignore: t => t instanceof Element && (!!t.closest('.r2-header-cell-filter-button') || !!t.closest('[data-r2-subpopup-of]')),
  });
  const pos = usePopupPosition(
    ref,
    () => {
      const anchor = core.eRoot?.querySelector(`.r2-header-cell[col-id="${CSS.escape(column.colId)}"]`);
      if (!anchor) return { x: 100, y: 100 };
      const r = anchor.getBoundingClientRect();
      return { x: r.left, y: r.bottom, alignTo: r, clip: visibleClipOf(anchor) };
    },
    [popup],
    core,
    { track: true },
  );
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        className="r2-menu r2-ltr r2-popup-child r2-filter-menu"
        style={pos.style}
        onKeyDown={e => {
          if (e.key === 'Escape') close();
        }}
      >
        <FilterUI core={core} column={column} onClose={close} />
      </div>
    </PopupLayer>,
    core.getPopupParent(),
  );
}

export function ColumnChooserPopup({ core }) {
  const ref = useRef(null);
  const close = () => core.closePopup();
  useClickOutside(ref, close);
  const pos = usePopupPosition(
    ref,
    () => {
      const r = core.eRoot?.getBoundingClientRect();
      if (!r) return { x: 100, y: 100 };
      return { x: r.left + r.width / 2 - 120, y: r.top + 40 };
    },
    [],
    core,
  );
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        className="r2-dialog r2-popup-child r2-column-chooser"
        style={{ ...pos.style, width: 240 }}
      >
        <div className="r2-panel-title-bar">
          <span className="r2-panel-title-bar-title">{localeText(core, 'columnChooser')}</span>
          <span className="r2-panel-title-bar-button" onClick={close} role="button">
            <Icon name="cross" />
          </span>
        </div>
        <ColumnChooserList core={core} />
      </div>
    </PopupLayer>,
    core.getPopupParent(),
  );
}

export function Popups({ core }) {
  const p = core.popup;
  if (!p) return null;
  if (p.type === 'contextMenu') return <ContextMenuPopup key={`cm${p.x},${p.y}`} core={core} popup={p} />;
  if (p.type === 'columnMenu') return <ColumnMenuPopup key={`colmenu-${p.column.colId}`} core={core} popup={p} />;
  if (p.type === 'filter') return <FilterPopup key={`filter-${p.column.colId}`} core={core} popup={p} />;
  if (p.type === 'columnChooser') return <ColumnChooserPopup core={core} />;
  if (p.type === 'advancedFilterBuilder') return <AdvancedFilterBuilderPopup core={core} />;
  return null;
}
