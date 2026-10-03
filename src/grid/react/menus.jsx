// 컨텍스트 메뉴 / 컬럼 메뉴(legacy 탭형 + new 리스트형) / 컬럼 선택기
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { localeText } from '../core/locale.js';
import { cx } from '../core/utils.js';
import { Checkbox, Icon } from './common.jsx';
import { PopupLayer, useClickOutside, usePopupPosition } from './popup.jsx';
import { FilterUI } from './filters.jsx';

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
      if (!col) return null;
      return {
        name: t('pinColumn'),
        icon: 'pin',
        subMenu: [
          { name: t('noPin'), checked: !col.pinned, action: () => core.api.setColumnsPinned([col], null) },
          { name: t('pinLeft'), checked: col.pinned === 'left', action: () => core.api.setColumnsPinned([col], 'left') },
          { name: t('pinRight'), checked: col.pinned === 'right', action: () => core.api.setColumnsPinned([col], 'right') },
        ],
      };
    case 'sortAscending':
      return col && col.isSortable() ? { name: t('sortAscending'), icon: 'asc', action: () => core.setColumnSort(col, 'asc', false, 'columnMenu') } : null;
    case 'sortDescending':
      return col && col.isSortable() ? { name: t('sortDescending'), icon: 'desc', action: () => core.setColumnSort(col, 'desc', false, 'columnMenu') } : null;
    case 'sortUnSort':
      return col && col.sort ? { name: t('sortUnSort'), icon: 'none', action: () => core.setColumnSort(col, null, false, 'columnMenu') } : null;
    case 'columnFilter':
      return col && col.colDef.filter
        ? { name: t('columnFilter'), icon: 'filter', action: () => setTimeout(() => core.openPopup({ type: 'filter', column: col, anchorColId: col.colId }), 0) }
        : null;
    case 'columnChooser':
      return { name: t('columnChooser'), icon: 'columns', action: () => setTimeout(() => core.openPopup({ type: 'columnChooser' }), 0) };
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
  const pos = usePopupPosition(ref, () => (rect ? { x: rect.right, y: rect.top - 4, alignRight: rect.left } : null), [rect]);
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        data-r2-subpopup-of=""
        className="r2-menu r2-ltr r2-popup-child r2-sub-menu"
        style={{ position: 'fixed', left: pos.x, top: pos.y, visibility: pos.ready ? 'visible' : 'hidden' }}
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
  const pos = usePopupPosition(ref, () => ({ x: popup.x, y: popup.y, flipY: popup.y }), [popup]);
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        className="r2-menu r2-ltr r2-popup-child r2-context-menu"
        style={{ position: 'fixed', left: pos.x, top: pos.y, visibility: pos.ready ? 'visible' : 'hidden' }}
        onContextMenu={e => e.preventDefault()}
      >
        <MenuList core={core} items={popup.items} params={popup.params} onClose={close} />
      </div>
    </PopupLayer>,
    core.getPopupParent(),
  );
}

// ── 컬럼 선택기 (columnsMenuTab / 컬럼 툴패널 / columnChooser 공용) ──
export function ColumnChooserList({ core, showSearch = true }) {
  const [search, setSearch] = useState('');
  const cols = core.allColumns.filter(c => !c.colDef.suppressColumnsToolPanel && !c.isAuto);
  const s = search.trim().toLowerCase();
  const shown = s ? cols.filter(c => core.getDisplayName(c).toLowerCase().includes(s)) : cols;
  const visibleCount = shown.filter(c => c.visible).length;
  const allState = !shown.length ? false : visibleCount === shown.length ? true : visibleCount === 0 ? false : null;
  return (
    <div className="r2-column-select" role="presentation">
      <div className="r2-column-select-header" role="presentation">
        <Checkbox
          className="r2-column-select-header-checkbox"
          checked={allState}
          onToggle={() => core.setColumnsVisible(shown.filter(c => !c.colDef.lockVisible), allState !== true, 'toolPanelUi')}
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
      <div className="r2-column-select-list" role="tree">
        {shown.map(c => (
          <div
            key={c.colId}
            className="r2-column-select-column"
            style={{ paddingLeft: 8 + c.groupChain.length * 16 }}
            role="treeitem"
            onClick={() => !c.colDef.lockVisible && core.setColumnsVisible([c], !c.visible, 'toolPanelUi')}
          >
            <Checkbox
              className="r2-column-select-checkbox"
              checked={c.visible}
              disabled={!!c.colDef.lockVisible}
              onToggle={() => core.setColumnsVisible([c], !c.visible, 'toolPanelUi')}
            />
            <span className="r2-column-select-column-label">{core.getDisplayName(c)}</span>
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
    t => t !== 'filterMenuTab' || !!column.colDef.filter,
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
      return { x: legacy ? r.right - 220 : r.left, y: r.bottom, alignTo: r };
    },
    [popup, tab],
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
        style={{ position: 'fixed', left: pos.x, top: pos.y, visibility: pos.ready ? 'visible' : 'hidden' }}
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
      return { x: r.left, y: r.bottom, alignTo: r };
    },
    [popup],
  );
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        className="r2-menu r2-ltr r2-popup-child r2-filter-menu"
        style={{ position: 'fixed', left: pos.x, top: pos.y, visibility: pos.ready ? 'visible' : 'hidden' }}
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
  );
  return createPortal(
    <PopupLayer core={core}>
      <div
        ref={ref}
        className="r2-dialog r2-popup-child r2-column-chooser"
        style={{ position: 'fixed', left: pos.x, top: pos.y, width: 240, visibility: pos.ready ? 'visible' : 'hidden' }}
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
  return null;
}
