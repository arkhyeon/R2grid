// 컬럼 드롭 영역 (행 그룹 / 값 / 열 레이블(피벗)) — 컬럼 툴패널(세로)과 행 그룹 패널(가로) 공용
//  - 컬럼 목록·헤더·다른 영역에서 끌어다 놓기, 칩 끌어서 순서 변경, 칩을 영역 밖에 놓으면 제거 (AG 동일)
//  - 값 칩의 집계 함수 이름을 누르면 집계 함수 선택 (allowedAggFuncs / 내장 + aggFuncs)
import React, { useRef, useState } from 'react';
import { cx } from '../core/utils.js';
import { localeText } from '../core/locale.js';
import { Icon } from './common.jsx';

export const DND_TYPE = 'application/x-r2-column';
const BUILTIN_AGG_NAMES = ['sum', 'min', 'max', 'count', 'avg', 'first', 'last'];

const ZONE = {
  rowGroup: { title: 'groups', empty: 'rowGroupColumnsEmptyMessage', icon: 'group', allow: 'enableRowGroup' },
  values: { title: 'values', empty: 'valueColumnsEmptyMessage', icon: 'aggregation', allow: 'enableValue' },
  pivot: { title: 'pivots', empty: 'pivotColumnsEmptyMessage', icon: 'pivot', allow: 'enablePivot' },
};

export function zoneColumns(core, kind) {
  if (kind === 'rowGroup') return core.rowGroupColumns();
  if (kind === 'pivot') return core.pivotColumns();
  return core.valueColumns();
}

export function canDropInZone(col, kind) {
  return !!col && !col.isAuto && !col.isPivotResult && !!col.colDef[ZONE[kind].allow];
}

// 영역에 컬럼 넣기 (index 위치, 이미 있으면 이동)
export function dropIntoZone(core, kind, col, index) {
  if (!canDropInZone(col, kind)) return;
  if (kind === 'values') {
    if (!col.colDef.aggFunc) core.addValueColumns([col], 'toolPanelUi');
    return;
  }
  const list = zoneColumns(core, kind).filter(c => c !== col);
  // groupLockGroupColumns: 앞쪽 잠긴 그룹 컬럼은 자리 고정
  const locked = kind === 'rowGroup' ? lockedGroupCount(core) : 0;
  if (kind === 'rowGroup' && isGroupLocked(core, col)) return;
  list.splice(index == null ? list.length : Math.max(locked, Math.min(index, list.length)), 0, col);
  if (kind === 'rowGroup') {
    const wasGrouped = !!col.rowGroup;
    core.api.setRowGroupColumns(list);
    // 그룹으로 끌어 넣으면 컬럼 숨김 (AG 기본, suppressGroupChangesColumnVisibility 로 끔)
    const sv = core.gos.suppressGroupChangesColumnVisibility;
    if (!wasGrouped && col.visible && !(sv === true || sv === 'suppressHideOnGroup' || core.gos.suppressRowGroupHidesColumns)) core.setColumnsVisible([col], false, 'toolPanelUi');
  } else core.setPivotColumns(list, 'toolPanelUi');
}

export function lockedGroupCount(core) {
  const n = core.gos.groupLockGroupColumns ?? 0;
  const total = core.rowGroupColumns().length;
  return n < 0 ? total : Math.min(n, total);
}

export function isGroupLocked(core, col) {
  const i = core.rowGroupColumns().indexOf(col);
  return i >= 0 && i < lockedGroupCount(core);
}

export function removeFromZone(core, kind, col) {
  if (kind === 'values') core.removeValueColumns([col], 'toolPanelUi');
  else if (kind === 'rowGroup') {
    if (isGroupLocked(core, col)) return;
    core.api.removeRowGroupColumns([col]);
    // 그룹에서 빼면 다시 표시 (AG 기본, suppressGroupChangesColumnVisibility / suppressMakeColumnVisibleAfterUnGroup 로 끔)
    const sv = core.gos.suppressGroupChangesColumnVisibility;
    if (!col.visible && !(sv === true || sv === 'suppressShowOnUngroup' || core.gos.suppressMakeColumnVisibleAfterUnGroup)) core.setColumnsVisible([col], true, 'toolPanelUi');
  } else core.setPivotColumns(core.pivotColumns().filter(c => c !== col), 'toolPanelUi');
}

export function setDragColumn(e, col, fromZone) {
  e.dataTransfer.setData(DND_TYPE, JSON.stringify({ colId: col.colId, from: fromZone || null }));
  e.dataTransfer.setData('text/plain', col.colId);
  e.dataTransfer.effectAllowed = 'move';
}

function readDrag(e) {
  try {
    return JSON.parse(e.dataTransfer.getData(DND_TYPE) || 'null');
  } catch {
    return null;
  }
}

export function ColumnDropZone({ core, kind, horizontal = false }) {
  const z = ZONE[kind];
  const cols = zoneColumns(core, kind);
  const [over, setOver] = useState(null); // 삽입 위치 index
  const [aggMenu, setAggMenu] = useState(null); // colId
  const listRef = useRef(null);
  const droppedInside = useRef(false);

  const indexAt = e => {
    const chips = [...(listRef.current?.querySelectorAll('.r2-column-drop-cell') || [])];
    for (let i = 0; i < chips.length; i++) {
      const r = chips[i].getBoundingClientRect();
      if (horizontal ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2) return i;
    }
    return chips.length;
  };
  const onDragOver = e => {
    if (![...e.dataTransfer.types].includes(DND_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const i = indexAt(e);
    if (i !== over) setOver(i);
  };
  const onDrop = e => {
    const d = readDrag(e);
    setOver(null);
    if (!d) return;
    e.preventDefault();
    droppedInside.current = d.from === kind;
    const col = core.getColumn(d.colId);
    if (!canDropInZone(col, kind)) return;
    dropIntoZone(core, kind, col, indexAt(e));
  };

  const aggOptions = col => {
    const allowed = col.colDef.allowedAggFuncs;
    if (Array.isArray(allowed) && allowed.length) return allowed;
    return [...BUILTIN_AGG_NAMES, ...Object.keys(core.gos.aggFuncs || {})];
  };

  return (
    <div
      className={cx('r2-column-drop', horizontal ? 'r2-column-drop-horizontal' : 'r2-column-drop-vertical', `r2-column-drop-${kind}`, kind === 'rowGroup' && horizontal && 'r2-row-group-panel', over != null && 'r2-column-drop-dragging')}
      data-kind={kind}
      role="toolbar"
      onDragOver={onDragOver}
      onDragLeave={e => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOver(null);
      }}
      onDrop={onDrop}
    >
      <span className="r2-column-drop-title-bar">
        <Icon name={z.icon} className="r2-column-drop-icon" />
        {!horizontal && <span className="r2-column-drop-title">{localeText(core, z.title)}</span>}
      </span>
      <div ref={listRef} className="r2-column-drop-list">
        {!cols.length && <span className="r2-column-drop-empty-message">{localeText(core, z.empty)}</span>}
        {cols.map((c, i) => (
          <React.Fragment key={c.colId}>
            {over === i && <span className="r2-column-drop-insert" />}
            {horizontal && i > 0 && <Icon name="small-right" className="r2-column-drop-cell-divider" />}
            <span
              className="r2-column-drop-cell"
              col-id={c.colId}
              draggable
              onDragStart={e => {
                droppedInside.current = false;
                setDragColumn(e, c, kind);
              }}
              onDragEnd={e => {
                // 영역 밖(어디에도 안 받힘)에 놓으면 제거
                if (e.dataTransfer.dropEffect === 'none' && !droppedInside.current) removeFromZone(core, kind, c);
              }}
            >
              <span className="r2-column-drop-cell-drag-handle">
                <Icon name="grip" />
              </span>
              <span className="r2-column-drop-cell-text">
                {kind === 'values' && typeof c.colDef.aggFunc === 'string' ? (
                  <span
                    className="r2-column-drop-cell-agg"
                    role="button"
                    onClick={() => setAggMenu(aggMenu === c.colId ? null : c.colId)}
                  >
                    {localeText(core, c.colDef.aggFunc, c.colDef.aggFunc)}(
                  </span>
                ) : null}
                {core.getDisplayName(c, true)}
                {kind === 'values' && typeof c.colDef.aggFunc === 'string' ? ')' : null}
              </span>
              {!(kind === 'rowGroup' && isGroupLocked(core, c)) && (
                <span className="r2-column-drop-cell-button" role="button" aria-label="remove" onClick={() => removeFromZone(core, kind, c)}>
                  <Icon name="cross" />
                </span>
              )}
              {aggMenu === c.colId && (
                <span className="r2-column-drop-agg-menu" role="listbox">
                  {aggOptions(c).map(fn => (
                    <span
                      key={fn}
                      role="option"
                      aria-selected={fn === c.colDef.aggFunc}
                      className={cx('r2-column-drop-agg-option', fn === c.colDef.aggFunc && 'r2-selected')}
                      onClick={() => {
                        setAggMenu(null);
                        core.setColumnsAggFunc([[c, fn]], 'toolPanelUi');
                      }}
                    >
                      {localeText(core, fn, fn)}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </React.Fragment>
        ))}
        {over === cols.length && cols.length > 0 && <span className="r2-column-drop-insert" />}
      </div>
    </div>
  );
}

export function PivotModeToggle({ core }) {
  const on = core.isPivotActive();
  return (
    <label className="r2-pivot-mode-panel">
      <span className={cx('r2-toggle-button', on && 'r2-checked')}>
        <input type="checkbox" checked={on} onChange={e => core.setPivotMode(e.target.checked)} />
        <span className="r2-toggle-button-track" />
      </span>
      <span className="r2-pivot-mode-label">{localeText(core, 'pivotMode')}</span>
    </label>
  );
}
