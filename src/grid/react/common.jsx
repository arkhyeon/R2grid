// 공용 소형 컴포넌트: 아이콘(인라인 SVG, currentColor), 체크박스 (AG-Grid DOM/클래스 구조 동일)
import React, { useLayoutEffect, useRef } from 'react';
import { cx } from '../core/utils.js';

// viewBox 0 0 32 32 stroke 아이콘 (Quartz 아이콘셋 근사)
const ICONS = {
  menu: 'M6 9h20M6 16h20M6 23h20',
  'menu-alt': 'M6 9h20M6 16h20M6 23h20',
  filter: 'M5 7h22l-8.5 10v7l-5 2.5V17z',
  'filter-active': 'M5 7h22l-8.5 10v7l-5 2.5V17z',
  columns: 'M7.5 6h17A2.5 2.5 0 0 1 27 8.5v15a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 5 23.5v-15A2.5 2.5 0 0 1 7.5 6zM12.3 6v20M19.7 6v20',
  asc: 'M16 25V8M9 14.5l7-7 7 7',
  desc: 'M16 7v17M9 17.5l7 7 7-7',
  none: 'M11 26V7M6 12l5-5 5 5M21 6v19M16 20l5 5 5-5',
  'tree-open': 'M9 12.5l7 7 7-7',
  'tree-closed': 'M12.5 9l7 7-7 7',
  'tree-indeterminate': 'M9 16h14',
  'small-down': 'M10 13l6 6 6-6',
  'small-up': 'M10 19l6-6 6 6',
  'small-right': 'M13 10l6 6-6 6',
  'small-left': 'M19 10l-6 6 6 6',
  // 컬럼 그룹 열림/닫힘 (AG: columnGroupOpened=expanded, columnGroupClosed=contracted)
  expanded: 'M19.5 9l-7 7 7 7',
  contracted: 'M12.5 9l7 7-7 7',
  first: 'M22 9l-7 7 7 7M10 8v16',
  last: 'M10 9l7 7-7 7M22 8v16',
  previous: 'M19.5 9l-7 7 7 7',
  next: 'M12.5 9l7 7-7 7',
  tick: 'M7 16.5l6 6L25.5 10',
  cross: 'M9 9l14 14M23 9L9 23',
  copy: 'M12 10h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H12a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2zM6.5 21.5V8a1.5 1.5 0 0 1 1.5-1.5h13.5',
  cut: 'M9 19.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM23 19.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM11.3 20.5L23 5.5M20.7 20.5L9 5.5',
  paste: 'M10 7h12a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM13 4.5h6v4h-6z',
  save: 'M16 5v15M10 14l6 6 6-6M6 22v4h20v-4',
  csv: 'M9 4h10l6 6v18H9zM19 4v6h6M12.5 17h7M12.5 21.5h7',
  excel: 'M9 4h10l6 6v18H9zM19 4v6h6M13 15l6 8M19 15l-6 8',
  pin: 'M12 4.5h8M14 4.5v8.5l-5 5h14l-5-5V4.5M16 18v9.5',
  loading: 'M16 4a12 12 0 1 1-12 12',
  'eye-slash': 'M4 16s4.5-8 12-8 12 8 12 8-4.5 8-12 8S4 16 4 16zM16 12.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM5 5l22 22',
  arrows: 'M16 4v24M4 16h24M12 8l4-4 4 4M12 24l4 4 4-4M8 12l-4 4 4 4M24 12l4 4-4 4',
  grip: 'M12 8h.01M20 8h.01M12 16h.01M20 16h.01M12 24h.01M20 24h.01',
  group: 'M5 8h22M10 16h17M10 24h17',
  aggregation: 'M24 7H8l8 9-8 9h16',
  chart: 'M6 26h20M10 22v-7M16 22V8M22 22v-11',
  settings: 'M16 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM16 4v4M16 24v4M4 16h4M24 16h4M7.5 7.5l2.8 2.8M21.7 21.7l2.8 2.8M7.5 24.5l2.8-2.8M21.7 10.3l2.8-2.8',
  plus: 'M16 7v18M7 16h18',
  minus: 'M7 16h18',
  maximize: 'M6 12V6h6M26 12V6h-6M6 20v6h6M26 20v6h-6',
  minimize: 'M12 6v6H6M20 6v6h6M12 26v-6H6M20 26v-6h6',
  search: 'M14 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM20 20l6.5 6.5',
};

export function Icon({ name, className, ...rest }) {
  const d = ICONS[name];
  return (
    <span className={cx('ag-icon', `ag-icon-${name}`, className)} unselectable="on" role="presentation" {...rest}>
      {d && (
        <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true" focusable="false">
          <path
            d={d}
            fill={name === 'filter-active' ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}

// <div class="ag-checkbox ag-input-field"><div class="ag-wrapper ag-input-wrapper ag-checkbox-input-wrapper ag-checked"><input class="ag-input-field-input ag-checkbox-input" type="checkbox"></div></div>
export function Checkbox({ checked, disabled, onToggle, className, ariaLabel, stopPropagation = true }) {
  const inputRef = useRef(null);
  const indeterminate = checked === null;
  useLayoutEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <div className={cx('ag-checkbox ag-input-field', className)} role="presentation">
      <div
        className={cx(
          'ag-wrapper ag-input-wrapper ag-checkbox-input-wrapper',
          checked === true && 'ag-checked',
          indeterminate && 'ag-indeterminate',
          disabled && 'ag-disabled',
        )}
        role="presentation"
      >
        <input
          ref={inputRef}
          className="ag-input-field-input ag-checkbox-input"
          type="checkbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          checked={checked === true}
          disabled={disabled}
          onChange={() => {}}
          onClick={e => {
            if (stopPropagation) e.stopPropagation();
            if (!disabled) onToggle?.(e);
          }}
          onPointerDown={e => stopPropagation && e.stopPropagation()}
          onDoubleClick={e => stopPropagation && e.stopPropagation()}
        />
      </div>
    </div>
  );
}
