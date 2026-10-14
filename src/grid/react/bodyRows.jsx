// 바디 행: 일반 행(영역별 셀·colSpan·셀 병합), 전체 폭 행(그룹 행·로딩 행·사용자 전체 폭 행), 상세 그리드 행
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx, resolveClassRules, resolveClassValue } from '../core/utils.js';
import { Icon } from './common.jsx';
import { stableElement } from './renderComponent.js';
import { localeText } from '../core/locale.js';
import { Cell, GroupCellRenderer, rowKey } from './bodyCells.jsx';

export function rowProps(core, node, rowCount) {
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

export function Row({ core, node, cols, sectionCols, top, height, rp, handlers }) {
  const transform = !core.gos.suppressRowTransform;
  const rowRef = useRef(null);
  // processRowPostCreate: 행 DOM 이 처음 만들어졌을 때 (가운데 영역 기준, 고정 영역 행도 함께 전달)
  useLayoutEffect(() => {
    const fn = core.gos.processRowPostCreate;
    if (typeof fn !== 'function' || sectionCols !== core.displayedCenter || !rowRef.current) return;
    const root = rowRef.current.closest('.r2-root');
    const key = rowKey(node);
    const sib = sel => root?.querySelector(`${sel} .r2-row[row-index="${key}"]`) || null;
    fn({
      eRow: rowRef.current,
      ePinnedLeftRow: sib('.r2-pinned-left-cols-container'),
      ePinnedRightRow: sib('.r2-pinned-right-cols-container'),
      node,
      rowIndex: node.rowIndex,
      addRenderedRowListener: () => {},
      api: core.api,
      context: core.gos.context,
    });
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
          ver={core.version}
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
// embedFullWidthRows: 영역(왼쪽 고정·가운데·오른쪽 고정)마다 한 번씩 — pinned 는 그 영역, primary 는 내용을 그릴 첫 영역
export function GroupFullRow({ core, node, top, height, rp, handlers, pinned = null, primary = true }) {
  const g = core.gos;
  const transform = !g.suppressRowTransform;
  const rgc = node.rowGroupColumn;
  let value = node.key;
  if (node.key == null) value = localeText(core, 'blanks');
  else if (typeof rgc?.colDef.valueFormatter === 'function') {
    value = rgc.colDef.valueFormatter({ ...core.makeValueParams(node, rgc), value: node.groupValue ?? node.key });
  }
  const params = {
    value: node.key,
    valueFormatted: value,
    node,
    data: node.data,
    pinned,
    api: core.api,
    context: g.context,
    ...(g.groupRowRendererParams || {}),
  };
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
        ) : primary ? (
          <GroupCellRenderer core={core} node={node} column={GROUP_ROW_COLUMN} params={params} extra={g.groupRowRendererParams} />
        ) : null}
      </div>
    </div>
  );
}

// isFullWidthRow + fullWidthCellRenderer: 컬럼을 무시하고 행 전체 폭으로 렌더
// SSRM 로딩 행: 기본은 전체 폭 '로딩 중...' (suppressServerSideFullWidthLoadingRow 면 셀마다 스켈레톤)
export function LoadingFullRow({ core, node, top, height, rp, primary = true }) {
  const transform = !core.gos.suppressRowTransform;
  return (
    <div
      className={cx(rp.className, 'r2-full-width-row r2-loading-full-row')}
      role="row"
      row-index={rowKey(node)}
      row-id={node.id}
      style={{ ...(transform ? { transform: `translateY(${top}px)` } : { top }), height, ...rp.style }}
    >
      {primary && (
        <div className="r2-loading" style={{ paddingInlineStart: 12 + (node.level || 0) * 28 }}>
          <span className="r2-loading-icon">
            <Icon name="loading" />
          </span>
          <span className="r2-loading-text">{localeText(core, 'loadingOoo')}</span>
        </div>
      )}
    </div>
  );
}

export function FullWidthRow({ core, node, top, height, rp, handlers, pinned = null }) {
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
            pinned,
            api: core.api,
            context: g.context,
            eGridCell: undefined,
          })
        : null}
    </div>
  );
}

// ── 마스터/디테일 전체폭 행 ─────────────────────────────────
export function DetailRow({ core, node, top, height }) {
  const master = node.parent;
  const g = core.gos;
  const p = g.detailCellRendererParams || {};
  const Grid = core.__R2Grid;
  const detailId = `detail_${master.id}`;
  // keepDetailRows: 접거나 화면 밖으로 나갔던 상세 그리드를 다시 열 때 행 데이터·정렬·필터·스크롤 등을 그대로
  const [kept] = useState(() => core.takeKeptDetail(detailId));
  const [rows, setRows] = useState(kept ? kept.rows : null);
  const [gridKey, setGridKey] = useState(0);
  const ref = useRef(null);
  const detailApi = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const fetchRows = () => {
    if (typeof p.getDetailRowData !== 'function') return;
    p.getDetailRowData({
      node: master,
      data: master.data,
      successCallback: data => setRows(data),
      api: core.api,
      context: g.context,
    });
  };
  // 처음 열 때 불러옴 (보관해 둔 게 있으면 그걸 씀)
  useEffect(() => {
    if (!kept) fetchRows();
  }, [master]);
  // 마스터 행 데이터가 바뀌면 refreshStrategy 대로: 'rows'(기본) 행만 다시, 'everything' 상세 그리드를 새로, 'nothing' 그대로
  const ver = master.__version;
  const firstVer = useRef(ver);
  useEffect(() => {
    if (ver === firstVer.current) return;
    firstVer.current = ver;
    const strategy = p.refreshStrategy || 'rows';
    if (strategy === 'nothing') return;
    if (strategy === 'everything') {
      setRows(null);
      setGridKey(k => k + 1);
    }
    fetchRows();
  }, [ver]);
  // 레이아웃 정리 단계(하위 그리드가 정리되기 전, DOM 이 아직 있을 때) 에 상태를 저장해야 스크롤까지 남음
  useLayoutEffect(
    () => () => {
      core.api.removeDetailGridInfo(detailId);
      const api = detailApi.current;
      if (g.keepDetailRows && api && !api.isDestroyed?.()) core.keepDetail(detailId, { rows: rowsRef.current, state: api.getState() });
    },
    [],
  );
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
            key={gridKey}
            {...dgo}
            initialState={kept && !gridKey ? kept.state : dgo.initialState}
            rowData={rows ?? undefined}
            domLayout={g.detailRowAutoHeight ? 'autoHeight' : dgo.domLayout}
            onGridReady={e => {
              detailApi.current = e.api;
              core.api.addDetailGridInfo(detailId, { id: detailId, api: e.api });
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
