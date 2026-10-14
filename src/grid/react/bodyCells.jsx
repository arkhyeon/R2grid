// 바디 셀: 내장 셀 렌더러(체크박스·그룹·스켈레톤)와 셀 하나 (값·편집기·범위·깜빡임·병합)
import { useRef } from 'react';
import { cx, resolveClassRules, resolveClassValue, toText } from '../core/utils.js';
import { Checkbox, Icon } from './common.jsx';
import { EditorHost } from './editors.jsx';
import { SafeBoundary, stableElement } from './renderComponent.js';
import { SparklineCell } from './sparkline.jsx';

export const GROUP_INDENT = 28;

export const rowKey = node => (node.rowPinned ? `${node.rowPinned[0]}-${node.rowIndex}` : String(node.rowIndex));

// ── 내장 셀 렌더러 ──────────────────────────────────────────
function CheckboxCellRenderer({ core, node, column, value }) {
  const editable = core.isCellEditable(column, node);
  return (
    <div className="r2-cell-wrapper r2-checkbox-cell" role="presentation">
      <Checkbox checked={value == null ? false : !!value} disabled={!editable} onToggle={() => core.writeCell(node, column, !value, 'edit')} />
    </div>
  );
}

// r2GroupCellRenderer: 마스터/디테일 펼침 + 행그룹/트리 들여쓰기·펼침·자식수
export function GroupCellRenderer({ core, node, column, params, extra }) {
  const text = params.valueFormatted ?? params.value;
  const innerRenderer = extra?.innerRenderer;
  const inner = innerRenderer ? stableElement(core, `inner:${column.colId}`, innerRenderer, params) : text == null ? '' : toText(text);
  const grouping = (!!core.groupMode || core.isServerGrouping()) && column.autoType === 'group';
  // multipleColumns: 이 컬럼 레벨의 그룹(또는 groupHideOpenParents 로 숨은 부모)만 펼침 표시, 들여쓰기 없음
  const multi = grouping && column.groupIndex != null;
  let target = node;
  if (multi) {
    target =
      node.group && node.level === column.groupIndex
        ? node
        : params.value != null && params.value !== ''
          ? core.ancestorAtLevel(node, column.groupIndex)
          : null;
  }
  // 피벗 모드: 리프만 가진 최하위 그룹은 펼칠 것이 없음
  const hasKids = t => (t?.__ssrmGroup ? true : core.isPivotActive() ? !!t?.childrenAll?.some(c => c.group) : !!t?.childrenAll?.length);
  const expandable = multi ? hasKids(target) : node.master || (node.group && hasKids(node));
  const level = grouping && !multi ? (node.uiLevel ?? node.level ?? 0) : 0;
  const leafIndent = grouping && !multi && !expandable ? GROUP_INDENT : 0;
  const toggle = e => {
    e.stopPropagation();
    target.setExpanded(!target.expanded);
  };
  const countNode = multi ? target : node;
  const count =
    grouping && countNode?.group && !countNode.footer && !extra?.suppressCount && (!multi || target === node)
      ? (countNode.allChildrenCount ?? countNode.childrenAfterFilter?.length)
      : null;
  const rs = core.rsOpts;
  // 레거시 cellRendererParams.checkbox 또는 v34 rowSelection.checkboxLocation: 'autoGroupColumn'
  const legacyCb =
    (extra?.checkbox && rs?.legacy) ||
    (rs &&
      !rs.legacy &&
      rs.checkboxes !== false &&
      rs.checkboxLocation === 'autoGroupColumn' &&
      column.autoType === 'group' &&
      !node.footer &&
      !node.rowPinned);
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
          <Checkbox checked={node.group ? core.getGroupSelectionState(node) : node.selected} onToggle={e => core.handleCheckboxClick(node, e)} />
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

export function isEditableEl(t) {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

// ── 셀 ─────────────────────────────────────────────────────
export function Cell({ core, node, col, handlers, isFirst, isLast, spanWidth, colSpan, cellSpan }) {
  const cellRef = useRef(null);
  const g = core.gos;
  const cd = col.colDef;
  const ced = core.getEditingCell(node, col);
  const isEditing = !!ced;
  const editErrors = isEditing ? core.editErrorsFor(ced) : null;
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
    // 불러오는 중인 칸: loadingCellRendererSelector(컬럼 → 그리드) 가 고른 것 → loadingCellRenderer → 기본 스켈레톤
    const selFn = cd.loadingCellRendererSelector ?? g.loadingCellRendererSelector;
    const sel = typeof selFn === 'function' ? selFn(base) : null;
    const lcr = sel?.component ?? cd.loadingCellRenderer ?? g.loadingCellRenderer;
    const lcp = sel?.params ?? cd.loadingCellRendererParams ?? g.loadingCellRendererParams;
    if (col.autoType) content = null;
    else if (lcr) {
      const impl = typeof lcr === 'string' ? g.components?.[lcr] : lcr;
      content = impl ? stableElement(core, 'loadingCell', impl, { ...base, ...(lcp || {}) }) : null;
    } else content = <SkeletonCell />;
  } else if (col.autoType === 'selection') {
    const rs = core.rsOpts;
    const groupDesc = node.group && core.isGroupSelectsDescendants();
    const show =
      !node.rowPinned &&
      (typeof rs?.checkboxes === 'function' ? !!rs.checkboxes({ ...base }) : !(rs?.hideDisabledCheckboxes && !node.selectable && !groupDesc));
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
    content = node.rowPinned ? null : cd.valueFormatter ? core.formatValue(node, col, value) : value;
    // rowNumbers.enableRowResizer: 아래 가장자리를 끌어 행 높이 조절
    if (!node.rowPinned && cd.enableRowResizer) {
      content = (
        <>
          {content}
          <div className="r2-row-number-row-resizer" onPointerDown={e => handlers.rowResizeDown(node, e)} />
        </>
      );
    }
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
      const impl = typeof comp === 'string' ? (g.components?.[comp] ?? g.frameworkComponents?.[comp]) : comp;
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
    // colDef.dndSource: 브라우저 드래그로 행 데이터를 그리드 밖(다른 요소·앱)으로 (application/json + text/plain)
    const dnd = !node.stub && !node.group && (typeof cd.dndSource === 'function' ? cd.dndSource({ ...core.makeValueParams(node, col) }) : !!cd.dndSource);
    if (dnd) {
      content = (
        <div className="r2-cell-wrapper" role="presentation">
          <div
            className="r2-drag-handle r2-row-drag r2-dnd-source"
            draggable
            onPointerDown={e => e.stopPropagation()}
            onDragStart={e => {
              if (typeof cd.dndSourceOnRowDrag === 'function') {
                cd.dndSourceOnRowDrag({ rowNode: node, dragEvent: e.nativeEvent, api: core.api, context: core.gos.context });
                return;
              }
              const json = JSON.stringify(node.data);
              e.dataTransfer.setData('application/json', json);
              e.dataTransfer.setData('text/plain', json);
            }}
          >
            <Icon name="grip" />
          </div>
          <span className="r2-cell-value">{content}</span>
        </div>
      );
    }
    // 행 드래그 핸들 (colDef.rowDrag)
    if (core.showRowDragHandle(node, col)) {
      content = (
        <div className="r2-cell-wrapper" role="presentation">
          <div className="r2-drag-handle r2-row-drag" draggable={false} onPointerDown={e => handlers.dragHandleDown(node, col, e)}>
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
        isEditing ? (ced.editor.popup ? 'r2-cell-popup-editing r2-cell-not-inline-editing' : 'r2-cell-inline-editing') : 'r2-cell-not-inline-editing',
        cd.autoHeight ? 'r2-cell-auto-height' : 'r2-cell-normal-height',
        'r2-cell-value',
        core.batch && core.hasBatchValue(node, col) && 'r2-cell-batch-edit',
        editErrors && 'r2-cell-editor-invalid',
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
      aria-invalid={editErrors ? true : undefined}
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
      onMouseDown={g.suppressMiddleClickScrolls ? e => e.button === 1 && e.preventDefault() : undefined}
      onAuxClick={g.suppressMiddleClickScrolls ? e => handlers.cellMiddleClick(node, col, e) : undefined}
      onClick={e => handlers.cellClick(node, col, e)}
      onDoubleClick={e => handlers.cellDblClick(node, col, e)}
      onContextMenu={e => handlers.cellContextMenu(node, col, e)}
    >
      {content}
      {editErrors && ced === core.editing?.primary && (
        <div
          className={cx(
            'r2-cell-editor-error',
            !node.rowPinned && node.rowIndex >= core.pageLastRow - 2 && node.rowIndex > core.pageFirstRow + 1 && 'r2-cell-editor-error-above',
          )}
          role="alert"
        >
          {editErrors.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      )}
      {showHandle && <div className={fh.mode === 'fill' ? 'r2-fill-handle' : 'r2-range-handle'} onPointerDown={e => handlers.fillHandleDown(e)} />}
    </div>
  );
}
