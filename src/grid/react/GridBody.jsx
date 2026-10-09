// 바디: 세로 스크롤 뷰포트 안에 좌고정 / 중앙(가로 스크롤) / 우고정 컨테이너 + 전체폭(디테일) 행
// - 세로/가로 가상화, 1000만 px 초과 시 높이 스트레칭(브라우저 div 높이 한계 회피)
// - 상단/하단 고정행(floating), 그룹/트리 셀, 행 드래그, SSRM 블록 로드
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clamp, cx, resolveClassRules, resolveClassValue, toText } from '../core/utils.js';
import { Checkbox, Icon } from './common.jsx';
import { EditorHost } from './editors.jsx';
import { SafeBoundary, stableElement } from './renderComponent.js';
import { PopupLayer } from './popup.jsx';
import { localeText } from '../core/locale.js';
import { SparklineCell } from './sparkline.jsx';

const MAX_DIV_HEIGHT = 10_000_000;
const GROUP_INDENT = 28;

const rowKey = node => (node.rowPinned ? `${node.rowPinned[0]}-${node.rowIndex}` : String(node.rowIndex));

// ── 내장 셀 렌더러 ──────────────────────────────────────────
function CheckboxCellRenderer({ core, node, column, value }) {
  const editable = core.isCellEditable(column, node);
  return (
    <div className="r2-cell-wrapper r2-checkbox-cell" role="presentation">
      <Checkbox
        checked={value == null ? false : !!value}
        disabled={!editable}
        onToggle={() => core.writeCell(node, column, !value, 'edit')}
      />
    </div>
  );
}

// r2GroupCellRenderer: 마스터/디테일 펼침 + 행그룹/트리 들여쓰기·펼침·자식수
function GroupCellRenderer({ core, node, column, params, extra }) {
  const text = params.valueFormatted ?? params.value;
  const innerRenderer = extra?.innerRenderer;
  const inner = innerRenderer
    ? stableElement(core, `inner:${column.colId}`, innerRenderer, params)
    : text == null
      ? ''
      : toText(text);
  const grouping = (!!core.groupMode || core.isServerGrouping()) && column.autoType === 'group';
  // multipleColumns: 이 컬럼 레벨의 그룹(또는 groupHideOpenParents 로 숨은 부모)만 펼침 표시, 들여쓰기 없음
  const multi = grouping && column.groupIndex != null;
  let target = node;
  if (multi) {
    target = node.group && node.level === column.groupIndex ? node : params.value != null && params.value !== '' ? core.ancestorAtLevel(node, column.groupIndex) : null;
  }
  // 피벗 모드: 리프만 가진 최하위 그룹은 펼칠 것이 없음
  const hasKids = t => (t?.__ssrmGroup ? true : core.isPivotActive() ? !!t?.childrenAll?.some(c => c.group) : !!t?.childrenAll?.length);
  const expandable = multi ? hasKids(target) : node.master || (node.group && hasKids(node));
  const level = grouping && !multi ? node.uiLevel ?? node.level ?? 0 : 0;
  const leafIndent = grouping && !multi && !expandable ? GROUP_INDENT : 0;
  const toggle = e => {
    e.stopPropagation();
    target.setExpanded(!target.expanded);
  };
  const countNode = multi ? target : node;
  const count =
    grouping && countNode?.group && !countNode.footer && !extra?.suppressCount && (!multi || target === node)
      ? countNode.allChildrenCount ?? countNode.childrenAfterFilter?.length
      : null;
  const rs = core.rsOpts;
  // 레거시 cellRendererParams.checkbox 또는 v34 rowSelection.checkboxLocation: 'autoGroupColumn'
  const legacyCb =
    (extra?.checkbox && rs?.legacy) ||
    (rs && !rs.legacy && rs.checkboxes !== false && rs.checkboxLocation === 'autoGroupColumn' && column.autoType === 'group' && !node.footer && !node.rowPinned);
  return (
    <span
      className={cx(
        'r2-cell-wrapper',
        expandable && 'r2-cell-expandable r2-row-group',
        grouping && `r2-row-group-indent-${level}`,
        leafIndent && 'r2-row-group-leaf-indent',
      )}
      style={grouping ? { paddingInlineStart: level * GROUP_INDENT + leafIndent } : undefined}
      role="presentation"
    >
      {expandable && (
        <>
          <span className={cx('r2-group-expanded', !target.expanded && 'r2-hidden')} onClick={toggle}>
            <Icon name="tree-open" />
          </span>
          <span className={cx('r2-group-contracted', target.expanded && 'r2-hidden')} onClick={toggle}>
            <Icon name="tree-closed" />
          </span>
        </>
      )}
      {legacyCb && (
        <span className="r2-group-checkbox">
          <Checkbox
            checked={node.group ? core.getGroupSelectionState(node) : node.selected}
            onToggle={e => core.handleCheckboxClick(node, e)}
          />
        </span>
      )}
      <span className="r2-group-value">{inner}</span>
      {count != null && <span className="r2-group-child-count">({count})</span>}
    </span>
  );
}

function SkeletonCell() {
  return (
    <div className="r2-skeleton-container">
      <div className="r2-skeleton-effect" />
    </div>
  );
}

function isEditableEl(t) {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

// ── 셀 ─────────────────────────────────────────────────────
function Cell({ core, node, col, handlers, isFirst, isLast, spanWidth, colSpan, cellSpan }) {
  const cellRef = useRef(null);
  const g = core.gos;
  const cd = col.colDef;
  const ced = core.getEditingCell(node, col);
  const isEditing = !!ced;
  const value = core.getCellValue(node, col);
  const formatted = col.autoType && col.autoType !== 'group' ? null : core.formatValue(node, col, value);
  const base = {
    value,
    valueFormatted: formatted,
    data: node.data,
    node,
    colDef: cd,
    column: col,
    rowIndex: node.rowIndex,
    api: core.api,
    context: g.context,
  };
  const focused = core.isCellFocused(node, col.colId);
  const rtl = core.isRtl();
  const range = core.ranges.length && !node.rowPinned ? core.cellRangeInfo(node.rowIndex, col.colId) : null;
  const fillPrev = core.fillState && !node.rowPinned ? core.fillPreviewInfo(node.rowIndex, col.colId) : null;
  const fh = range && !node.rowPinned && !isEditing ? core.getFillHandleCell() : null;
  const showHandle = !!fh && fh.rowIndex === node.rowIndex && fh.colId === col.colId;
  const flash = core.getFlash(node.id, col.colId);
  const userCls = node.stub ? '' : cx(resolveClassValue(cd.cellClass, base), resolveClassRules(cd.cellClassRules, base));
  const userStyle = node.stub ? null : typeof cd.cellStyle === 'function' ? cd.cellStyle(base) : cd.cellStyle;
  let flashCls = null;
  if (flash) {
    const prefix = flash.cls === 'highlight' ? 'r2-cell-highlight' : 'r2-cell-data-changed';
    flashCls = flash.phase === 'on' ? prefix : `${prefix}-animation`;
  }

  let content;
  if (isEditing && !ced.editor.popup) {
    content = (
      <SafeBoundary label="cellEditor" onError={() => core.stopEditing(true)}>
        <EditorHost core={core} ed={ced} getCellEl={() => cellRef.current} />
      </SafeBoundary>
    );
  } else if (node.stub) {
    const lcr = g.loadingCellRenderer;
    if (col.autoType) content = null;
    else if (lcr) {
      const impl = typeof lcr === 'string' ? g.components?.[lcr] : lcr;
      content = impl ? stableElement(core, 'loadingCell', impl, { ...base, ...(g.loadingCellRendererParams || {}) }) : null;
    } else content = <SkeletonCell />;
  } else if (col.autoType === 'selection') {
    const rs = core.rsOpts;
    const groupDesc = node.group && core.isGroupSelectsDescendants();
    const show =
      !node.rowPinned &&
      (typeof rs?.checkboxes === 'function'
        ? !!rs.checkboxes({ ...base })
        : !(rs?.hideDisabledCheckboxes && !node.selectable && !groupDesc));
    content = show ? (
      <div className="r2-cell-wrapper" role="presentation">
        <div className="r2-selection-checkbox" role="presentation">
          <Checkbox
            checked={groupDesc ? core.getGroupSelectionState(node) : node.selected}
            disabled={!groupDesc && !node.selectable}
            ariaLabel="Press Space to toggle row selection"
            onToggle={e => core.handleCheckboxClick(node, e)}
          />
        </div>
      </div>
    ) : null;
  } else if (col.autoType === 'rowNumbers') {
    content = node.rowPinned ? null : node.rowIndex + 1;
  } else {
    let comp = cd.cellRenderer;
    let rendererParams = cd.cellRendererParams;
    if (typeof cd.cellRendererSelector === 'function') {
      const sel = cd.cellRendererSelector(base);
      if (sel) {
        comp = sel.component ?? comp;
        rendererParams = sel.params ?? rendererParams;
      }
    }
    if (!comp && col.dataType === 'boolean') comp = 'r2CheckboxCellRenderer';
    const extra = typeof rendererParams === 'function' ? rendererParams(base) : rendererParams;
    const bi = comp;
    if (bi === 'r2SparklineCellRenderer') {
      content = (
        <SparklineCell
          value={value}
          width={Math.max(10, (spanWidth ?? col.actualWidth) - 18)}
          height={Math.max(10, (node.rowHeight || core.getDefaultRowHeight()) - 4)}
          options={extra?.sparklineOptions}
        />
      );
    } else if (bi === 'r2CheckboxCellRenderer') {
      content = <CheckboxCellRenderer core={core} node={node} column={col} value={value} />;
    } else if (bi === 'r2GroupCellRenderer' || bi === 'group') {
      content = <GroupCellRenderer core={core} node={node} column={col} params={{ ...base, ...(extra || {}) }} extra={extra} />;
    } else if (bi && bi !== 'r2AnimateShowChangeCellRenderer' && bi !== 'r2AnimateSlideCellRenderer') {
      const impl = typeof comp === 'string' ? g.components?.[comp] ?? g.frameworkComponents?.[comp] : comp;
      if (impl) {
        const params = {
          ...base,
          ...(extra || {}),
          getValue: () => core.getCellValue(node, col),
          setValue: v => node.setDataValue(col, v),
          formatValue: v => core.formatValue(node, col, v) ?? v,
          refreshCell: () => core.notify(),
          registerRowDragger: () => {},
          setTooltip: () => {},
          eGridCell: cellRef.current,
          eParentOfValue: cellRef.current,
        };
        content = stableElement(core, typeof comp === 'string' ? `comp:${comp}` : `cell:${col.colId}`, impl, params);
      } else {
        content = formatted != null ? toText(formatted) : value == null ? '' : String(value);
      }
    } else {
      const v = formatted != null ? formatted : value;
      content = v == null ? '' : typeof v === 'object' && !(v instanceof Date) ? String(v) : toText(v);
      // Find 하이라이트
      if (g.findSearchValue && content) {
        const parts = core.findGetParts(node, col, content);
        if (parts) {
          content = parts.map((p, i) =>
            p.match ? (
              <mark key={i} className={cx('r2-find-match', p.activeMatch && 'r2-find-active-match')}>
                {p.value}
              </mark>
            ) : (
              p.value
            ),
          );
        }
      }
    }
    // 레거시 colDef.checkboxSelection (rowSelection 문자열 모드)
    const legacyCb = core.rsOpts?.legacy && cd.checkboxSelection && !node.rowPinned;
    if (legacyCb && (typeof cd.checkboxSelection !== 'function' || cd.checkboxSelection(base))) {
      content = (
        <div className="r2-cell-wrapper" role="presentation">
          <div className="r2-selection-checkbox" role="presentation">
            <Checkbox
              checked={node.group && core.isGroupSelectsDescendants() ? core.getGroupSelectionState(node) : node.selected}
              disabled={!node.selectable}
              onToggle={e => core.handleCheckboxClick(node, e)}
            />
          </div>
          <span className="r2-cell-value">{content}</span>
        </div>
      );
    }
    // 행 드래그 핸들 (colDef.rowDrag)
    if (core.showRowDragHandle(node, col)) {
      content = (
        <div className="r2-cell-wrapper" role="presentation">
          <div
            className="r2-drag-handle r2-row-drag"
            draggable={false}
            onPointerDown={e => handlers.dragHandleDown(node, col, e)}
          >
            <Icon name="grip" />
          </div>
          <span className="r2-cell-value">{content}</span>
        </div>
      );
    }
    if (isEditing && ced.editor.popup) {
      content = (
        <>
          {content}
          <SafeBoundary label="cellEditor" onError={() => core.stopEditing(true)}>
            <EditorHost core={core} ed={ced} getCellEl={() => cellRef.current} />
          </SafeBoundary>
        </>
      );
    }
  }

  // colDef.rowSpan: 아래 행까지 덮는 높이 (suppressRowTransform 과 함께 사용)
  let spanHeight = cellSpan?.height;
  if (!cellSpan && typeof cd.rowSpan === 'function' && !node.stub && !node.rowPinned) {
    const n = Math.max(1, Number(cd.rowSpan({ ...base })) || 1);
    if (n > 1) {
      const i0 = node.rowIndex - core.pageFirstRow;
      const max = Math.min(n, core.getRowCountInPage() - i0);
      spanHeight = 0;
      for (let k = 0; k < max; k++) spanHeight += core.rowHeightAt(i0 + k);
    }
  }

  let tooltip;
  if (!col.autoType && !node.stub && (cd.tooltipField || cd.tooltipValueGetter)) {
    const t = core.getCellTooltip(node, col);
    if (t != null && t !== '') tooltip = String(t);
  } else if (!col.autoType && !node.stub && (cd.tooltipComponent || cd.tooltipComponentSelector)) {
    // 툴팁 컴포넌트만 있으면 셀 값으로 표시
    const v = formatted ?? value;
    if (v != null && v !== '') tooltip = String(v);
  }

  return (
    <div
      ref={cellRef}
      className={cx(
        'r2-cell',
        isEditing
          ? ced.editor.popup
            ? 'r2-cell-popup-editing r2-cell-not-inline-editing'
            : 'r2-cell-inline-editing'
          : 'r2-cell-not-inline-editing',
        cd.autoHeight ? 'r2-cell-auto-height' : 'r2-cell-normal-height',
        'r2-cell-value',
        core.batch && core.hasBatchValue(node, col) && 'r2-cell-batch-edit',
        g.columnHoverHighlight && core.hoveredColId === col.colId && 'r2-column-hover',
        focused && 'r2-cell-focus',
        range && 'r2-cell-range-selected',
        range && !range.single && `r2-cell-range-selected-${Math.min(range.count, 4)}`,
        range?.single && 'r2-cell-range-single-cell',
        range?.top && 'r2-cell-range-top',
        range?.bottom && 'r2-cell-range-bottom',
        (rtl ? range?.right : range?.left) && 'r2-cell-range-left',
        (rtl ? range?.left : range?.right) && 'r2-cell-range-right',
        fillPrev?.top && 'r2-selection-fill-top',
        fillPrev?.bottom && 'r2-selection-fill-bottom',
        fillPrev?.left && 'r2-selection-fill-left',
        fillPrev?.right && 'r2-selection-fill-right',
        flashCls,
        cd.wrapText && 'r2-cell-wrap-text',
        isFirst && 'r2-column-first',
        isLast && 'r2-column-last',
        col.autoType === 'selection' && 'r2-selection-column r2-cell-selection',
        node.stub && 'r2-cell-loading',
        spanHeight && 'r2-cell-span',
        userCls,
      )}
      role={cd.cellAriaRole || 'gridcell'}
      col-id={col.colId}
      aria-colindex={core.displayedIndex.get(col.colId) + 1}
      aria-colspan={colSpan > 1 ? colSpan : undefined}
      tabIndex={-1}
      style={{
        ...core.colPos(col.left),
        width: spanWidth ?? col.actualWidth,
        ...(spanHeight ? { height: spanHeight, zIndex: 1 } : null),
        ...(cellSpan ? { top: cellSpan.top } : null),
        ...(flash && flash.phase === 'fade' ? { transition: `background-color ${flash.fadeMs}ms` } : null),
        ...userStyle,
      }}
      title={g.enableBrowserTooltips ? tooltip : undefined}
      data-r2-tooltip={g.enableBrowserTooltips ? undefined : tooltip}
      onPointerDown={e => handlers.cellPointerDown(node, col, e)}
      onClick={e => handlers.cellClick(node, col, e)}
      onDoubleClick={e => handlers.cellDblClick(node, col, e)}
      onContextMenu={e => handlers.cellContextMenu(node, col, e)}
    >
      {content}
      {showHandle && (
        <div
          className={fh.mode === 'fill' ? 'r2-fill-handle' : 'r2-range-handle'}
          onPointerDown={e => handlers.fillHandleDown(e)}
        />
      )}
    </div>
  );
}

function rowProps(core, node, rowCount) {
  const g = core.gos;
  const p = { data: node.data, node, rowIndex: node.rowIndex, api: core.api, context: g.context };
  const editing = core.editing?.node === node;
  const focusRow = core.focus && core.focus.rowIndex === node.rowIndex && (core.focus.rowPinned || null) === (node.rowPinned || null);
  const level = node.uiLevel ?? node.level ?? 0;
  const className = cx(
    'r2-row',
    node.rowIndex % 2 === 0 ? 'r2-row-even' : 'r2-row-odd',
    `r2-row-level-${level}`,
    'r2-row-position-absolute',
    !node.rowPinned && node.rowIndex === 0 && 'r2-row-first',
    !node.rowPinned && node.rowIndex === rowCount - 1 && 'r2-row-last',
    node.rowPinned && 'r2-row-pinned',
    !node.rowPinned && node.pinnedSibling && 'r2-row-pinned-source',
    node.group && !node.footer && 'r2-row-group',
    node.footer && 'r2-row-footer',
    node.stub && 'r2-row-loading',
    node.selected && 'r2-row-selected',
    focusRow ? 'r2-row-focus' : 'r2-row-no-focus',
    editing ? 'r2-row-editing r2-row-inline-editing' : 'r2-row-not-inline-editing',
    (node.master || (node.group && (node.childrenAll?.length || node.__ssrmGroup))) && (node.expanded ? 'r2-row-group-expanded' : 'r2-row-group-contracted'),
    node.__dragging && 'r2-row-dragging',
    core.hoveredRowIndex === rowKey(node) && 'r2-row-hover',
    resolveClassValue(g.rowClass, p),
    typeof g.getRowClass === 'function' ? resolveClassValue(g.getRowClass(p), p) : '',
    node.stub ? '' : resolveClassRules(g.rowClassRules, p),
  );
  const style = node.stub
    ? {}
    : {
        ...(g.rowStyle || {}),
        ...(typeof g.getRowStyle === 'function' ? g.getRowStyle(p) || {} : {}),
      };
  return { className, style };
}

// colDef.colSpan: 섹션(좌/중/우) 전체 컬럼 기준으로 병합 셀을 계산하고, 가상화로 보이는 컬럼에 걸친 셀만 렌더
function spanCells(core, node, cols, sectionCols) {
  if (!core.hasColSpan || !sectionCols) return cols.map(col => ({ col }));
  const visible = new Set(cols);
  const out = [];
  for (let i = 0; i < sectionCols.length; ) {
    const col = sectionCols[i];
    let span = 1;
    const cs = col.colDef.colSpan;
    if (typeof cs === 'function' && !node.stub) {
      const v = cs({ ...core.makeValueParams(node, col), rowIndex: node.rowIndex });
      span = Math.max(1, Math.min(sectionCols.length - i, Number(v) || 1));
    }
    let width = 0;
    let vis = false;
    for (let k = 0; k < span; k++) {
      const c = sectionCols[i + k];
      width += c.actualWidth;
      if (visible.has(c)) vis = true;
    }
    if (vis) out.push(span > 1 ? { col, span, width } : { col });
    i += span;
  }
  return out;
}

// enableCellSpan + spanRows: 병합 구간의 "화면상 첫 행"에만 셀을 그리고 나머지 행에서는 생략
function cellSpanOf(core, node, col) {
  if (node.rowPinned || !core.gos.enableCellSpan || !col.colDef.spanRows) return undefined;
  const span = core.getCellSpan(col, node.rowIndex);
  if (!span || span.count < 2) return undefined;
  const first = Math.max(span.start, core.renderedRange.first);
  if (node.rowIndex !== first) return null; // 덮인 행
  const p0 = core.pageFirstRow;
  let height = 0;
  for (let k = 0; k < span.count; k++) height += core.rowHeightAt(span.start - p0 + k);
  const offset = core.rowTopAt(first - p0) - core.rowTopAt(span.start - p0);
  return { top: -offset, height };
}

function Row({ core, node, cols, sectionCols, top, height, rp, handlers }) {
  const transform = !core.gos.suppressRowTransform;
  const rowRef = useRef(null);
  // processRowPostCreate: 행 DOM 이 처음 만들어졌을 때 (가운데 영역 기준, 고정 영역 행도 함께 전달)
  useLayoutEffect(() => {
    const fn = core.gos.processRowPostCreate;
    if (typeof fn !== 'function' || sectionCols !== core.displayedCenter || !rowRef.current) return;
    const root = rowRef.current.closest('.r2-root');
    const key = rowKey(node);
    const sib = sel => root?.querySelector(`${sel} .r2-row[row-index="${key}"]`) || null;
    fn({ eRow: rowRef.current, ePinnedLeftRow: sib('.r2-pinned-left-cols-container'), ePinnedRightRow: sib('.r2-pinned-right-cols-container'), node, rowIndex: node.rowIndex, addRenderedRowListener: () => {}, api: core.api, context: core.gos.context });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const businessKey = typeof core.gos.getBusinessKeyForNode === 'function' && !node.stub ? core.gos.getBusinessKeyForNode(node) : undefined;
  const cells = spanCells(core, node, cols, sectionCols)
    .map(c => ({ ...c, cellSpan: cellSpanOf(core, node, c.col) }))
    .filter(c => c.cellSpan !== null);
  const raise = cells.some(c => c.cellSpan);
  return (
    <div
      ref={rowRef}
      className={rp.className}
      role="row"
      row-index={rowKey(node)}
      row-id={node.id}
      row-business-key={businessKey}
      aria-rowindex={node.rowPinned ? undefined : node.rowIndex + 2}
      aria-selected={node.selectable && !node.rowPinned ? node.selected : undefined}
      style={{ ...(transform ? { transform: `translateY(${top}px)` } : { top }), height, ...rp.style, ...(raise ? { zIndex: 1 } : null) }}
      onClick={e => handlers.rowClick(node, e)}
      onDoubleClick={e => handlers.rowDblClick(node, e)}
    >
      {cells.map(({ col, span, width, cellSpan }, i) => (
        <Cell
          key={col.colId}
          core={core}
          node={node}
          col={col}
          handlers={handlers}
          spanWidth={span ? width : undefined}
          colSpan={span}
          cellSpan={cellSpan}
          isFirst={i === 0 && col === core.displayedColumns[0]}
          isLast={col === core.displayedColumns[core.displayedColumns.length - 1]}
        />
      ))}
    </div>
  );
}

// groupDisplayType 'groupRows': 그룹 행을 전체 폭으로 (펼침 + 키 + 자식 수), groupRowRenderer 지원
const GROUP_ROW_COLUMN = { autoType: 'group', colId: '__groupRow', groupIndex: null, colDef: {} };
function GroupFullRow({ core, node, top, height, rp, handlers }) {
  const g = core.gos;
  const transform = !g.suppressRowTransform;
  const rgc = node.rowGroupColumn;
  let value = node.key;
  if (node.key == null) value = localeText(core, 'blanks');
  else if (typeof rgc?.colDef.valueFormatter === 'function') {
    value = rgc.colDef.valueFormatter({ ...core.makeValueParams(node, rgc), value: node.groupValue ?? node.key });
  }
  const params = { value: node.key, valueFormatted: value, node, data: node.data, api: core.api, context: g.context, ...(g.groupRowRendererParams || {}) };
  const custom = typeof g.groupRowRenderer === 'string' ? g.components?.[g.groupRowRenderer] : g.groupRowRenderer;
  return (
    <div
      className={cx(rp.className, 'r2-full-width-row r2-row-group-row')}
      role="row"
      row-index={rowKey(node)}
      row-id={node.id}
      aria-rowindex={node.rowIndex + 2}
      aria-expanded={node.expanded}
      style={{ ...(transform ? { transform: `translateY(${top}px)` } : { top }), height, ...rp.style }}
      onClick={e => handlers.rowClick(node, e)}
      onDoubleClick={() => node.setExpanded(!node.expanded)}
    >
      <div className="r2-cell r2-full-width-group-cell" style={{ width: '100%', paddingLeft: 8 }}>
        {custom ? (
          stableElement(core, 'groupRow', custom, params)
        ) : (
          <GroupCellRenderer core={core} node={node} column={GROUP_ROW_COLUMN} params={params} extra={g.groupRowRendererParams} />
        )}
      </div>
    </div>
  );
}

// isFullWidthRow + fullWidthCellRenderer: 컬럼을 무시하고 행 전체 폭으로 렌더
function FullWidthRow({ core, node, top, height, rp, handlers }) {
  const g = core.gos;
  const comp = g.fullWidthCellRenderer;
  const impl = typeof comp === 'string' ? g.components?.[comp] : comp;
  const params = typeof g.fullWidthCellRendererParams === 'function' ? g.fullWidthCellRendererParams({ node }) : g.fullWidthCellRendererParams;
  const transform = !g.suppressRowTransform;
  return (
    <div
      className={cx(rp.className, 'r2-full-width-row')}
      role="row"
      row-index={rowKey(node)}
      row-id={node.id}
      aria-rowindex={node.rowPinned ? undefined : node.rowIndex + 2}
      style={{ ...(transform ? { transform: `translateY(${top}px)` } : { top }), height, ...rp.style }}
      onClick={e => handlers.rowClick(node, e)}
      onDoubleClick={e => handlers.rowDblClick(node, e)}
    >
      {impl
        ? stableElement(core, 'fullWidth', impl, {
            ...(params || {}),
            node,
            data: node.data,
            value: undefined,
            rowIndex: node.rowIndex,
            pinned: null,
            api: core.api,
            context: g.context,
            eGridCell: undefined,
          })
        : null}
    </div>
  );
}

// ── 마스터/디테일 전체폭 행 ─────────────────────────────────
function DetailRow({ core, node, top, height }) {
  const master = node.parent;
  const g = core.gos;
  const p = g.detailCellRendererParams || {};
  const Grid = core.__R2Grid;
  const [rows, setRows] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (typeof p.getDetailRowData === 'function') {
      p.getDetailRowData({
        node: master,
        data: master.data,
        successCallback: data => setRows(data),
        api: core.api,
        context: g.context,
      });
    }
  }, [master, master.data]);
  useLayoutEffect(() => {
    if (!g.detailRowAutoHeight) return undefined;
    const el = ref.current?.firstElementChild;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      if (core.setAutoRowHeight(node, Math.ceil(el.offsetHeight) + 2)) core.onRowHeightChanged();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  let body;
  const custom = g.detailCellRenderer;
  if (custom) {
    const impl = typeof custom === 'string' ? g.components?.[custom] : custom;
    body = stableElement(core, 'detailRenderer', impl, {
      ...p,
      data: master.data,
      node: master,
      api: core.api,
      context: g.context,
    });
  } else if (Grid) {
    const dgo = p.detailGridOptions || {};
    body = (
      <div className={cx('r2-details-row', g.detailRowAutoHeight ? 'r2-details-row-auto-height' : 'r2-details-row-fixed-height')}>
        <div className="r2-details-grid" style={{ height: g.detailRowAutoHeight ? undefined : '100%' }}>
          <Grid
            {...dgo}
            rowData={rows ?? undefined}
            domLayout={g.detailRowAutoHeight ? 'autoHeight' : dgo.domLayout}
            onGridReady={e => {
              core.api.addDetailGridInfo(`detail_${master.id}`, { id: `detail_${master.id}`, api: e.api });
              dgo.onGridReady?.(e);
            }}
          />
        </div>
      </div>
    );
  }
  return (
    <div
      className="r2-row r2-full-width-row r2-row-level-1 r2-row-position-absolute r2-details-row-wrapper"
      role="row"
      row-index={node.rowIndex}
      row-id={node.id}
      style={{ transform: `translateY(${top}px)`, height: g.detailRowAutoHeight ? undefined : height, minHeight: g.detailRowAutoHeight ? height : undefined }}
      ref={ref}
    >
      {body}
    </div>
  );
}

// ── 바디 ───────────────────────────────────────────────────
export function GridBody({ core, headerVpRef, focusSinkRef, onScrollbarWidth }) {
  const bodyVpRef = useRef(null);
  const centerVpRef = useRef(null);
  const hScrollRef = useRef(null);
  const floatTopRef = useRef(null);
  const floatBottomRef = useRef(null);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [size, setSize] = useState({ h: 0, w: 0, cw: 0, sbw: 0 });
  const [dragGhost, setDragGhost] = useState(null);
  const rafRef = useRef(0);
  const metrics = useRef({ ratio: 1 });
  const g = core.gos;
  const autoLayout = g.domLayout === 'autoHeight' || g.domLayout === 'print';

  const schedule = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const top = bodyVpRef.current?.scrollTop ?? 0;
      const left = hScrollRef.current?.scrollLeft ?? 0;
      setScroll(p => (p.top === top && p.left === left ? p : { top, left }));
    });
  };

  const syncLeft = left => {
    if (centerVpRef.current) centerVpRef.current.scrollLeft = left;
    if (headerVpRef.current) headerVpRef.current.scrollLeft = left;
    if (floatTopRef.current) floatTopRef.current.scrollLeft = left;
    if (floatBottomRef.current) floatBottomRef.current.scrollLeft = left;
  };

  // 크기 측정
  useLayoutEffect(() => {
    const el = bodyVpRef.current;
    const cvp = centerVpRef.current;
    if (!el) return undefined;
    const measure = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      const sbw = el.offsetWidth - el.clientWidth;
      const cw = cvp ? cvp.clientWidth : w;
      setSize(p => (p.h === h && p.w === w && p.cw === cw && p.sbw === sbw ? p : { h, w, cw, sbw }));
      onScrollbarWidth?.(sbw);
      core.setViewportSize(w, h);
    };
    measure();
    // RO 콜백에서 동기 측정 → flex 재계산·스크롤바 변화로 같은 프레임에 다시 리사이즈되면
    // "ResizeObserver loop completed with undelivered notifications" 발생 → 다음 프레임으로 미룸
    let roRaf = 0;
    const ro = new ResizeObserver(() => {
      if (roRaf) return;
      roRaf = requestAnimationFrame(() => {
        roRaf = 0;
        measure();
      });
    });
    ro.observe(el);
    if (cvp) ro.observe(cvp);
    return () => {
      ro.disconnect();
      if (roRaf) cancelAnimationFrame(roRaf);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // core 가 사용할 스크롤 API
  useLayoutEffect(() => {
    core.viewport = {
      getScrollTop: () => (bodyVpRef.current?.scrollTop ?? 0) * metrics.current.ratio,
      setScrollTop: v => {
        if (bodyVpRef.current) bodyVpRef.current.scrollTop = v / metrics.current.ratio;
      },
      getClientHeight: () => bodyVpRef.current?.clientHeight ?? 0,
      // RTL: 브라우저 scrollLeft 는 시작(오른쪽)에서 음수로 감 → 논리 위치는 절대값
      getScrollLeft: () => Math.abs(hScrollRef.current?.scrollLeft ?? 0),
      setScrollLeft: v => {
        const hs = hScrollRef.current;
        if (!hs) return;
        hs.scrollLeft = core.isRtl() ? -v : v;
        syncLeft(hs.scrollLeft);
        schedule();
      },
      getCenterWidth: () => centerVpRef.current?.clientWidth ?? 0,
    };
    return () => {
      core.viewport = null;
    };
  }, []);

  // 가로 휠/쉬프트휠 → 가짜 가로 스크롤바로 전달
  useEffect(() => {
    const el = bodyVpRef.current;
    if (!el) return undefined;
    const onWheel = ev => {
      if (ev.target instanceof Element && ev.target.closest('.r2-root') !== focusSinkRef.current) return;
      if (core.gos.suppressScrollWhenPopupsAreOpen && core.popup) {
        ev.preventDefault();
        return;
      }
      let dx = ev.deltaX;
      if (!dx && ev.shiftKey) dx = ev.deltaY;
      if (!dx) return;
      const hs = hScrollRef.current;
      if (!hs) return;
      const before = hs.scrollLeft;
      hs.scrollLeft += dx;
      if (hs.scrollLeft !== before) ev.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // bodyScrollEnd: 스크롤이 멈추고 100ms 뒤
  const scrollEndTimer = useRef(null);
  const scrollEnd = params => {
    clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(() => core.dispatch('bodyScrollEnd', params), 100);
  };
  useEffect(() => () => clearTimeout(scrollEndTimer.current), []);
  const onHScroll = e => {
    const left = e.currentTarget.scrollLeft;
    syncLeft(left);
    schedule();
    const params = { direction: 'horizontal', left: Math.abs(left), top: core.viewport?.getScrollTop() ?? 0 };
    core.dispatch('bodyScroll', params);
    scrollEnd(params);
  };
  const onCenterScroll = e => {
    const left = e.currentTarget.scrollLeft;
    const hs = hScrollRef.current;
    if (hs && hs.scrollLeft !== left) hs.scrollLeft = left;
  };
  const onBodyScroll = () => {
    schedule();
    const params = { direction: 'vertical', top: core.viewport?.getScrollTop() ?? 0, left: hScrollRef.current?.scrollLeft ?? 0 };
    core.dispatch('bodyScroll', params);
    scrollEnd(params);
  };

  // ── 범위 드래그 (+ 가장자리 자동 스크롤) ──
  const locateCell = (x, y) => {
    const vp = bodyVpRef.current;
    if (!vp) return null;
    const r = vp.getBoundingClientRect();
    const cxp = Math.min(Math.max(x, r.left + 1), r.left + vp.clientWidth - 2);
    const cyp = Math.min(Math.max(y, r.top + 1), r.top + vp.clientHeight - 2);
    const el = document.elementFromPoint(cxp, cyp);
    const cell = el?.closest?.('.r2-cell[col-id]');
    if (!cell || cell.closest('.r2-root') !== focusSinkRef.current) return null;
    const row = cell.closest('[row-index]');
    if (!row) return null;
    const rowIndex = Number(row.getAttribute('row-index'));
    if (Number.isNaN(rowIndex)) return null;
    const colId = cell.getAttribute('col-id');
    const col = core.getColumn(colId);
    if (!col || col.isAuto) return null;
    return { rowIndex, colId };
  };

  // 포인터가 가장자리 근처면 스크롤 (드래그 공통)
  const edgeScroll = (x, y) => {
    const vp = bodyVpRef.current;
    const hs = hScrollRef.current;
    if (!vp) return false;
    const r = vp.getBoundingClientRect();
    let scrolled = false;
    if (y < r.top + 8) {
      vp.scrollTop -= 30;
      scrolled = true;
    } else if (y > r.top + vp.clientHeight - 8) {
      vp.scrollTop += 30;
      scrolled = true;
    }
    if (hs) {
      const cr = centerVpRef.current?.getBoundingClientRect();
      if (cr && x < cr.left + 8) {
        hs.scrollLeft -= 30;
        scrolled = true;
      } else if (cr && x > cr.right - 8) {
        hs.scrollLeft += 30;
        scrolled = true;
      }
    }
    return scrolled;
  };

  const startRangeDrag = () => {
    let lastX = 0;
    let lastY = 0;
    let moved = false;
    const onMove = ev => {
      moved = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      const c = locateCell(lastX, lastY);
      if (c) core.rangeExtend(c.rowIndex, c.colId);
    };
    const timer = setInterval(() => {
      if (!moved) return;
      if (edgeScroll(lastX, lastY)) {
        const c = locateCell(lastX, lastY);
        if (c) core.rangeExtend(c.rowIndex, c.colId);
      }
    }, 50);
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      clearInterval(timer);
      core.rangeEnd();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  };

  // ── 행 드래그 ──
  const overIndexAt = y => {
    const vp = bodyVpRef.current;
    const r = vp.getBoundingClientRect();
    const yIn = clamp(y - r.top, 0, Math.max(0, vp.clientHeight - 1));
    const virt = vp.scrollTop * metrics.current.ratio + yIn;
    const count = core.getRowCountInPage();
    if (!count) return { index: -1, y: virt };
    return { index: core.pageFirstRow + core.indexAtPixel(virt), y: virt };
  };
  const startRowDrag = (node, col, e) => {
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let lastX = startX;
    let lastY = startY;
    let left = false;
    const rootRect = () => core.eRoot?.getBoundingClientRect();
    const onMove = ev => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
        dragging = true;
        document.body.classList.add('r2-dnd-dragging');
        const text = core.rowDragStart(node, ev, col);
        setDragGhost({ text, x: ev.clientX, y: ev.clientY });
      }
      setDragGhost(gh => gh && { ...gh, x: ev.clientX, y: ev.clientY });
      core.updateRowDropZones(ev, 'move');
      const rr = rootRect();
      const outside = rr && (ev.clientX < rr.left || ev.clientX > rr.right || ev.clientY < rr.top || ev.clientY > rr.bottom);
      if (outside) {
        if (!left) core.rowDragLeave(ev);
        left = true;
        return;
      }
      left = false;
      const o = overIndexAt(ev.clientY);
      if (o.index >= 0) core.rowDragMove(o.index, o.y, ev);
    };
    const timer = setInterval(() => {
      if (!dragging || left) return;
      if (edgeScroll(lastX, lastY)) {
        const o = overIndexAt(lastY);
        if (o.index >= 0) core.rowDragMove(o.index, o.y, { clientX: lastX, clientY: lastY });
      }
    }, 50);
    const finish = ev => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      clearInterval(timer);
      if (!dragging) return;
      document.body.classList.remove('r2-dnd-dragging');
      setDragGhost(null);
      core.updateRowDropZones(ev, ev.type === 'pointercancel' ? 'cancel' : 'end');
      const o = overIndexAt(ev.clientY);
      core.rowDragEnd(ev, o.index, o.y, ev.type === 'pointercancel');
      core.__suppressRowClick = true;
      setTimeout(() => {
        core.__suppressRowClick = false;
      }, 0);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  };

  const focusSink = target => {
    if (isEditableEl(target)) return;
    const sink = focusSinkRef.current;
    if (sink && document.activeElement !== sink) sink.focus({ preventScroll: true });
  };

  // 채우기/범위 핸들 드래그
  const startFillDrag = () => {
    let lastX = 0;
    let lastY = 0;
    let moved = false;
    const move = () => {
      const c = locateCell(lastX, lastY);
      if (c) core.fillMove(c.rowIndex, c.colId);
    };
    const onMove = ev => {
      moved = true;
      lastX = ev.clientX;
      lastY = ev.clientY;
      move();
    };
    const timer = setInterval(() => {
      if (moved && edgeScroll(lastX, lastY)) move();
    }, 50);
    const onKey = ev => {
      if (ev.key === 'Escape') finish(ev, true);
    };
    const finish = (ev, cancelled = false) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      document.removeEventListener('keydown', onKey, true);
      clearInterval(timer);
      core.fillEnd(ev, cancelled);
    };
    const onUp = ev => finish(ev, ev.type === 'pointercancel');
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    document.addEventListener('keydown', onKey, true);
  };

  const handlers = {
    fillHandleDown(e) {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      focusSink(e.target);
      if (core.fillStart()) startFillDrag();
    },
    dragHandleDown(node, col, e) {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      focusSink(e.target);
      startRowDrag(node, col, e);
    },
    cellPointerDown(node, col, e) {
      if (e.button !== 0) return;
      const ced = core.getEditingCell(node, col);
      if (ced) return;
      if (core.editing) core.stopEditing(false);
      core.dispatch('cellMouseDown', { ...core.cellEventParams(node, col, e) });
      if (col.autoType === 'rowNumbers' || node.stub) return;
      focusSink(e.target);
      const pinned = node.rowPinned || null;
      // 행 전체 드래그: 범위선택 대신 드래그 시작 (클릭은 그대로 동작)
      if (g.rowDragEntireRow && !pinned && !g.suppressRowDrag && !isEditableEl(e.target)) {
        core.setFocusedCell(node.rowIndex, col.colId);
        startRowDrag(node, col, e);
        return;
      }
      const extend = !pinned && e.shiftKey && core.ranges.length && core.cellSelectionOpts;
      if (!extend) core.setFocusedCell(node.rowIndex, col.colId, { rowPinned: pinned });
      if (!pinned && core.cellSelectionOpts && !col.isAuto) {
        core.rangeStart(node.rowIndex, col.colId, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
        startRangeDrag();
      } else if (pinned && core.ranges.length) {
        core.clearRanges();
      }
    },
    cellClick(node, col, e) {
      if (node.stub) return;
      if (col.autoType === 'rowNumbers' && !node.rowPinned) core.selectRowAsRange(node.rowIndex, e.shiftKey);
      else if (!core.isCellFocused(node, col.colId)) {
        if (!(e.shiftKey && core.ranges.length && !node.rowPinned)) core.setFocusedCell(node.rowIndex, col.colId, { rowPinned: node.rowPinned || null });
      }
      focusSink(e.target);
      core.dispatch('cellClicked', { ...core.cellEventParams(node, col, e) });
      const single = g.singleClickEdit || col.colDef.singleClickEdit;
      if (single && !g.suppressClickEdit && !core.getEditingCell(node, col) && core.isCellEditable(col, node)) {
        core.startEdit(node, col, null);
      }
    },
    cellDblClick(node, col, e) {
      if (node.stub) return;
      core.dispatch('cellDoubleClicked', { ...core.cellEventParams(node, col, e) });
      if (core.getEditingCell(node, col)) return;
      if (!g.suppressClickEdit && !g.singleClickEdit && core.isCellEditable(col, node)) core.startEdit(node, col, null);
      else if (node.group && col.autoType === 'group' && !g.suppressGroupDoubleClickExpand && (node.childrenAll?.length || node.__ssrmGroup)) {
        node.setExpanded(!node.expanded);
      }
    },
    cellContextMenu(node, col, e) {
      if (g.allowContextMenuWithControlKey && (e.ctrlKey || e.metaKey)) return;
      if (g.suppressContextMenu && g.preventDefaultOnContextMenu) e.preventDefault();
      e.stopPropagation();
      if (node.stub) {
        e.preventDefault();
        return;
      }
      core.dispatch('cellContextMenu', { ...core.cellEventParams(node, col, e) });
      if (!node.rowPinned && core.cellSelectionOpts && !col.isAuto && !core.cellRangeInfo(node.rowIndex, col.colId)) {
        core.setSingleRange(node.rowIndex, col.colId);
      }
      if (!core.isCellFocused(node, col.colId)) core.setFocusedCell(node.rowIndex, col.colId, { rowPinned: node.rowPinned || null });
      if (core.openContextMenu({ node, column: col, x: e.clientX, y: e.clientY, event: e })) e.preventDefault();
    },
    rowClick(node, e) {
      if (node.stub || core.__suppressRowClick) return;
      if (core.editing && core.editing.node === node && e.target instanceof Element && e.target.closest('.r2-cell-inline-editing')) return;
      core.dispatch('rowClicked', { node, data: node.data, rowIndex: node.rowIndex, rowPinned: node.rowPinned, event: e });
      core.handleRowClickSelection(node, e);
    },
    rowDblClick(node, e) {
      if (node.stub) return;
      core.dispatch('rowDoubleClicked', { node, data: node.data, rowIndex: node.rowIndex, rowPinned: node.rowPinned, event: e });
    },
  };

  // 호버: 같은 row-index 의 모든 섹션에 r2-row-hover 를 DOM 으로 직접 토글 (재렌더 없음)
  const setHover = key => {
    if (key === core.hoveredRowIndex) return;
    const root = focusSinkRef.current;
    if (!root) return;
    const sel = k => root.querySelectorAll(`.r2-row[row-index="${k}"]`);
    if (core.hoveredRowIndex != null) sel(core.hoveredRowIndex).forEach(el => el.classList.remove('r2-row-hover'));
    core.hoveredRowIndex = key;
    if (key != null && !g.suppressRowHoverHighlight) {
      sel(key).forEach(el => {
        if (el.closest('.r2-root') === root && !el.classList.contains('r2-full-width-row')) el.classList.add('r2-row-hover');
      });
    }
  };
  // columnHoverHighlight: 같은 col-id 셀 + 헤더에 r2-column-hover (DOM 토글, 재렌더 없음)
  const setColHover = colId => {
    if (colId === core.hoveredColId) return;
    const root = focusSinkRef.current;
    const prev = core.hoveredColId;
    core.hoveredColId = colId;
    if (!root || !g.columnHoverHighlight) return;
    const sel = id => root.querySelectorAll(`.r2-cell[col-id="${CSS.escape(id)}"], .r2-header-cell[col-id="${CSS.escape(id)}"]`);
    if (prev != null) sel(prev).forEach(el => el.classList.remove('r2-column-hover'));
    if (colId != null) sel(colId).forEach(el => el.closest('.r2-root') === root && el.classList.add('r2-column-hover'));
  };
  // cellMouseOver / cellMouseOut (셀이 바뀔 때만)
  const setMouseCell = (rowKey, colId, e) => {
    const prev = core.__mouseCell;
    const key = rowKey != null && colId != null ? `${rowKey}|${colId}` : null;
    if ((prev?.key ?? null) === key) return;
    const fire = (type, c) => {
      const node = core.nodeFromRowKey(c.rowKey);
      const column = core.getColumn(c.colId);
      if (node && column) core.dispatch(type, { ...core.cellEventParams(node, column, e) });
    };
    if (prev) fire('cellMouseOut', prev);
    core.__mouseCell = key ? { key, rowKey, colId } : null;
    if (key) fire('cellMouseOver', core.__mouseCell);
  };
  const onMouseOver = e => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t || t.closest('.r2-root') !== focusSinkRef.current) return;
    const row = t.closest('.r2-row[row-index]');
    const rowKey = row && !row.classList.contains('r2-full-width-row') ? row.getAttribute('row-index') : null;
    setHover(rowKey);
    const colId = t.closest('.r2-cell[col-id]')?.getAttribute('col-id') ?? null;
    setColHover(colId);
    setMouseCell(rowKey, colId, e);
  };
  const onMouseLeave = e => {
    setHover(null);
    setColHover(null);
    setMouseCell(null, null, e);
  };

  // ── 렌더 범위 계산 ──
  const rowCount = core.getRowCountInPage();
  const realH = core.pageHeight;
  const vh = size.h;
  const stretched = !autoLayout && realH > MAX_DIV_HEIGHT;
  const containerH = stretched ? MAX_DIV_HEIGHT : realH;
  const ratio = stretched && containerH > vh ? (realH - vh) / (containerH - vh) : 1;
  metrics.current.ratio = ratio;
  const physTop = scroll.top;
  const virtTop = physTop * ratio;
  const offset = virtTop - physTop;
  const buffer = g.rowBuffer ?? 10;
  let first = 0;
  let last = rowCount - 1;
  if (!autoLayout && rowCount && !g.suppressRowVirtualisation) {
    first = Math.max(0, core.indexAtPixel(virtTop) - buffer);
    last = Math.min(rowCount - 1, core.indexAtPixel(virtTop + (vh || 600)) + buffer);
  }
  core.renderedRange = rowCount
    ? { first: core.pageFirstRow + first, last: core.pageFirstRow + last }
    : { first: -1, last: -1 };

  const cw = size.cw || core.bodyWidth || 1200;
  const sl = Math.abs(scroll.left);
  let center = core.displayedCenter;
  if (!g.suppressColumnVirtualisation) {
    center = center.filter(c => c.left + c.actualWidth >= sl - 200 && c.left <= sl + cw + 200);
    if (core.editing) {
      for (const ced of core.editing.cells.values()) {
        const ec = ced.column;
        if (!ec.pinned && !center.includes(ec) && core.displayedCenter.includes(ec)) center = [...center, ec];
      }
    }
  }

  // 렌더 범위가 바뀌면 viewportChanged / virtualRowRemoved / virtualColumnsChanged (렌더 뒤 effect 에서)
  const renderedNow = useRef(null);
  renderedNow.current = { first: core.renderedRange.first, last: core.renderedRange.last, cols: center.map(c => c.colId).join('|') };
  const renderedPrev = useRef({ first: -1, last: -1, cols: '' });
  useEffect(() => {
    const now = renderedNow.current;
    const prev = renderedPrev.current;
    if (now.first !== prev.first || now.last !== prev.last) {
      if (prev.first >= 0 && core.hasEventListener('virtualRowRemoved')) {
        for (let i = prev.first; i <= prev.last; i++) {
          if (i >= now.first && i <= now.last) continue;
          const n = core.displayedNodes[i];
          if (n) core.dispatch('virtualRowRemoved', { node: n, rowIndex: i, data: n.data });
        }
      }
      core.dispatch('viewportChanged', { firstRow: now.first, lastRow: now.last });
    }
    if (now.cols !== prev.cols) core.dispatch('virtualColumnsChanged', { afterScroll: prev.cols !== '' });
    renderedPrev.current = now;
  });

  const leftRows = [];
  const centerRows = [];
  const rightRows = [];
  const fullRows = [];
  const total = core.displayedNodes.length;
  const pushRow = i => {
    const node = core.getPageNode(i);
    if (!node) return;
    const top = core.rowTopAt(i) - offset;
    const h = core.rowHeightAt(i);
    if (node.detail) {
      fullRows.push(<DetailRow key={node.id} core={core} node={node} top={top} height={h} />);
      return;
    }
    const rp = rowProps(core, node, total);
    const key = node.__redraw ? `${node.id}:${node.__redraw}` : node.id;
    const common = { core, node, top, height: h, rp, handlers };
    if (node.group && !node.footer && core.isGroupRowsDisplay()) {
      fullRows.push(<GroupFullRow key={key} {...common} />);
      return;
    }
    if (!node.group && !node.stub && typeof g.isFullWidthRow === 'function' && g.isFullWidthRow({ rowNode: node, api: core.api, context: g.context })) {
      fullRows.push(<FullWidthRow key={key} {...common} />);
      return;
    }
    if (core.displayedLeft.length) leftRows.push(<Row key={key} cols={core.displayedLeft} sectionCols={core.displayedLeft} {...common} />);
    centerRows.push(<Row key={key} cols={center} sectionCols={core.displayedCenter} {...common} />);
    if (core.displayedRight.length) rightRows.push(<Row key={key} cols={core.displayedRight} sectionCols={core.displayedRight} {...common} />);
  };
  for (let i = first; i <= last; i++) pushRow(i);
  const edNode = core.editing?.node;
  if (edNode && edNode.rowIndex != null && !edNode.rowPinned) {
    const ei = edNode.rowIndex - core.pageFirstRow;
    if (ei >= 0 && ei < rowCount && (ei < first || ei > last)) pushRow(ei);
  }

  // 고정 행
  const topH = core.pinnedTop.length ? core.pinnedTotalHeight('top') : 0;
  const bottomH = core.pinnedBottom.length ? core.pinnedTotalHeight('bottom') : 0;
  const pinnedRows = (list, cols) =>
    list.map(node => (
      <Row key={node.id} core={core} node={node} cols={cols} top={node.rowTop} height={node.rowHeight} rp={rowProps(core, node, total)} handlers={handlers} />
    ));
  const floating = (pos, height, ref) => {
    const list = pos === 'top' ? core.pinnedTop : core.pinnedBottom;
    if (!height) return null;
    return (
      <div className={`r2-floating-${pos}`} role="presentation" style={{ height, minHeight: height }} onMouseOver={onMouseOver} onMouseLeave={onMouseLeave}>
        <div
          className={cx(`r2-pinned-left-floating-${pos}`, !core.leftWidth && 'r2-hidden')}
          role="rowgroup"
          style={{ width: core.leftWidth, minWidth: core.leftWidth, maxWidth: core.leftWidth }}
        >
          {pinnedRows(list, core.displayedLeft)}
        </div>
        <div ref={ref} className={`r2-floating-${pos}-viewport`} role="presentation">
          <div className={`r2-floating-${pos}-container`} role="rowgroup" style={{ width: core.centerWidth }}>
            {pinnedRows(list, center)}
          </div>
        </div>
        <div
          className={cx(`r2-pinned-right-floating-${pos}`, !core.rightWidth && 'r2-hidden')}
          role="rowgroup"
          style={{ width: core.rightWidth, minWidth: core.rightWidth, maxWidth: core.rightWidth }}
        >
          {pinnedRows(list, core.displayedRight)}
        </div>
        {size.sbw > 0 && <div className="r2-floating-scrollbar-spacer" style={{ width: size.sbw, minWidth: size.sbw }} />}
      </div>
    );
  };

  // autoHeight 컬럼: 렌더 후 내용 높이 측정 → 행 높이 반영
  useLayoutEffect(() => {
    const autoCols = core.displayedColumns.filter(c => c.colDef.autoHeight);
    if (!autoCols.length) return;
    const vp = bodyVpRef.current;
    if (!vp) return;
    const def = core.getDefaultRowHeight();
    let changed = false;
    for (let i = first; i <= last; i++) {
      const node = core.getPageNode(i);
      if (!node || node.detail || node.stub) continue;
      let max = 0;
      for (const c of autoCols) {
        const cell = vp.querySelector(`.r2-row[row-index="${node.rowIndex}"] .r2-cell[col-id="${CSS.escape(c.colId)}"]`);
        if (cell) max = Math.max(max, cell.offsetHeight);
      }
      if (max && core.setAutoRowHeight(node, Math.max(def, Math.ceil(max)))) changed = true;
    }
    if (changed) core.onRowHeightChanged();
  });

  // SSRM: 화면에 걸린 블록 요청
  useEffect(() => {
    if (core.isSsrm() && core.renderedRange.first >= 0) core.ssrmEnsureRows(core.renderedRange.first, core.renderedRange.last);
  });

  // 가로 위치를 새로 생긴 floating 컨테이너에도 적용
  useLayoutEffect(() => {
    const left = hScrollRef.current?.scrollLeft ?? 0;
    if (floatTopRef.current) floatTopRef.current.scrollLeft = left;
    if (floatBottomRef.current) floatBottomRef.current.scrollLeft = left;
  }, [topH > 0, bottomH > 0]);

  const hScrollVisible = !core.gos.suppressHorizontalScroll && (!!core.gos.alwaysShowHorizontalScroll || core.centerWidth > (size.cw || 0) + 1);

  return (
    <>
      {floating('top', topH, floatTopRef)}
      <div className={cx('r2-body', autoLayout ? 'r2-layout-auto-height' : 'r2-layout-normal')} role="presentation">
        <div
          ref={bodyVpRef}
          className={cx('r2-body-viewport', autoLayout ? 'r2-layout-auto-height' : 'r2-layout-normal', 'r2-row-no-animation')}
          style={g.alwaysShowVerticalScroll && !autoLayout ? { overflowY: 'scroll' } : undefined}
          role="presentation"
          onScroll={onBodyScroll}
          onMouseOver={onMouseOver}
          onMouseLeave={onMouseLeave}
          onContextMenu={e => {
            if (e.target instanceof Element && e.target.closest('.r2-root') !== focusSinkRef.current) return;
            if (g.allowContextMenuWithControlKey && (e.ctrlKey || e.metaKey)) return;
            if (core.openContextMenu({ node: null, column: null, x: e.clientX, y: e.clientY, event: e })) e.preventDefault();
          }}
        >
          <div
            className={cx('r2-pinned-left-cols-container', !core.leftWidth && 'r2-hidden')}
            role="rowgroup"
            style={{ width: core.leftWidth, minWidth: core.leftWidth, maxWidth: core.leftWidth, height: containerH }}
          >
            {leftRows}
          </div>
          <div ref={centerVpRef} className="r2-center-cols-viewport" role="presentation" style={{ height: containerH }} onScroll={onCenterScroll}>
            <div className="r2-center-cols-container" role="rowgroup" style={{ width: core.centerWidth, height: containerH }}>
              {centerRows}
            </div>
          </div>
          <div
            className={cx('r2-pinned-right-cols-container', !core.rightWidth && 'r2-hidden')}
            role="rowgroup"
            style={{ width: core.rightWidth, minWidth: core.rightWidth, maxWidth: core.rightWidth, height: containerH }}
          >
            {rightRows}
          </div>
          {fullRows.length > 0 && (
            <div className="r2-full-width-container" role="rowgroup" style={{ height: containerH }}>
              {fullRows}
            </div>
          )}
        </div>
      </div>
      {floating('bottom', bottomH, floatBottomRef)}
      <div className={cx('r2-body-horizontal-scroll', !hScrollVisible && 'r2-scrollbar-invisible r2-hidden')} aria-hidden="true">
        <div className="r2-horizontal-left-spacer" style={{ width: core.leftWidth, minWidth: core.leftWidth }} />
        <div ref={hScrollRef} className="r2-body-horizontal-scroll-viewport" onScroll={onHScroll}>
          <div className="r2-body-horizontal-scroll-container" style={{ width: core.centerWidth }} />
        </div>
        <div className="r2-horizontal-right-spacer" style={{ width: core.rightWidth + size.sbw, minWidth: core.rightWidth + size.sbw }} />
      </div>
      {dragGhost &&
        createPortal(
          <PopupLayer core={core}>
            <div className="r2-dnd-ghost r2-unselectable" style={{ position: 'fixed', left: dragGhost.x + 12, top: dragGhost.y + 12 }}>
              <span className="r2-dnd-ghost-icon">
                <Icon name="grip" />
              </span>
              <div className="r2-dnd-ghost-label">{dragGhost.text}</div>
            </div>
          </PopupLayer>,
          document.body,
        )}
    </>
  );
}
