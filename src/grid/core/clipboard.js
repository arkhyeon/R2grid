// 클립보드: ClipboardModule 동작 재현
//  - 범위 선택 → 범위 복사 / 없으면 선택행(copySelectedRows) / 없으면 포커스 셀
//  - copyHeadersToClipboard, processCellForClipboard, processHeaderForClipboard, sendToClipboard
//  - 붙여넣기: 포커스/범위 시작 기준 TSV 채우기, 단일 값이면 범위 전체 채우기
import { copyTextToClipboard, toText } from './utils.js';

const LINE = '\r\n';

function clipboardValue(core, node, column) {
  const value = core.getCellValue(node, column);
  const proc = core.gos.processCellForClipboard;
  const useFmt = column.colDef.useValueFormatterForExport !== false;
  if (typeof proc === 'function') {
    const out = proc({
      value,
      node,
      column,
      api: core.api,
      context: core.gos.context,
      type: 'clipboard',
      formatValue: v => core.formatValue(node, column, v) ?? v,
      parseValue: v => v,
    });
    return out == null ? '' : toText(out);
  }
  if (useFmt) {
    const f = core.formatValue(node, column, value);
    if (f != null) return toText(f);
  }
  if (value == null) return '';
  return typeof value === 'object' && !(value instanceof Date) ? String(value) : toText(value);
}

function headerValue(core, column) {
  const proc = core.gos.processHeaderForClipboard;
  const name = core.getDisplayName(column);
  if (typeof proc === 'function') {
    const out = proc({ column, api: core.api, context: core.gos.context });
    return out == null ? '' : String(out);
  }
  return name ?? '';
}

function exportableColumns(cols) {
  return cols.filter(c => c.autoType !== 'selection');
}

// 복사 대상 결정 → { blocks: [{ nodes, columns }] }
function collectCopyTarget(core) {
  if (core.cellSelectionOpts && core.ranges.length) {
    const blocks = [];
    for (const r of core.ranges) {
      const b = core.rangeBounds(r);
      if (!b) continue;
      const nodes = [];
      for (let i = b.r0; i <= b.r1; i++) {
        const n = core.displayedNodes[i];
        if (n && !n.detail) nodes.push(n);
      }
      blocks.push({ nodes, columns: exportableColumns(core.displayedColumns.slice(b.c0, b.c1 + 1)), bounds: b });
    }
    if (blocks.length) return blocks;
  }
  const rs = core.rsOpts;
  if (rs && rs.copySelectedRows && core.selected.size) {
    const nodes = core.getSelectedNodes().filter(n => n.displayed).sort((a, b) => a.rowIndex - b.rowIndex);
    return [{ nodes, columns: exportableColumns(core.displayedColumns) }];
  }
  if (core.focus) {
    const node = core.displayedNodes[core.focus.rowIndex];
    const col = core.getColumn(core.focus.colId);
    if (node && col && !node.detail) return [{ nodes: [node], columns: exportableColumns([col]) }];
  }
  return [];
}

// 그룹 헤더 줄 (copyGroupHeadersToClipboard · processGroupHeaderForClipboard)
function groupHeaderLines(core, columns, delim) {
  const depth = columns.reduce((m, c) => Math.max(m, c.groupChain?.length || 0), 0);
  const proc = core.gos.processGroupHeaderForClipboard;
  const lines = [];
  for (let level = 0; level < depth; level++) {
    lines.push(
      columns
        .map(c => {
          const g = c.groupChain?.[level];
          if (!g) return '';
          if (typeof proc === 'function') {
            const out = proc({ columnGroup: g, api: core.api, context: core.gos.context });
            return out == null ? '' : String(out);
          }
          return g.colGroupDef?.headerName ?? '';
        })
        .join(delim),
    );
  }
  return lines;
}

export function buildClipboardText(core, blocks, includeHeaders, includeGroupHeaders = !!core.gos.copyGroupHeadersToClipboard) {
  const delim = core.gos.clipboardDelimiter ?? '\t';
  const parts = blocks.map(({ nodes, columns }) => {
    const lines = [];
    if (includeGroupHeaders) lines.push(...groupHeaderLines(core, columns, delim));
    if (includeHeaders || includeGroupHeaders) lines.push(columns.map(c => headerValue(core, c)).join(delim));
    nodes.forEach(n => lines.push(columns.map(c => clipboardValue(core, n, c)).join(delim)));
    return lines.join(LINE);
  });
  return parts.join(LINE);
}

function send(core, text) {
  const custom = core.gos.sendToClipboard;
  if (typeof custom === 'function') custom({ data: text, api: core.api, context: core.gos.context });
  else copyTextToClipboard(text, !!core.gos.suppressClipboardApi);
}

function highlight(core, blocks) {
  if (core.gos.suppressCopyFlash) return;
  const nodes = blocks.flatMap(b => b.nodes);
  const cols = [...new Set(blocks.flatMap(b => b.columns))];
  if (nodes.length * cols.length > 20000) return;
  core.flashCells({ rowNodes: nodes, columns: cols, flashDuration: 300, fadeDuration: 500, phaseClass: 'highlight' });
}

export function copySelectionToClipboard(core, { includeHeaders, includeGroupHeaders } = {}) {
  const blocks = collectCopyTarget(core);
  if (!blocks.length) return '';
  const withHeaders = includeHeaders ?? !!core.gos.copyHeadersToClipboard;
  const text = buildClipboardText(core, blocks, withHeaders, includeGroupHeaders ?? !!core.gos.copyGroupHeadersToClipboard);
  send(core, text);
  highlight(core, blocks);
  return text;
}

// 브라우저 copy/cut 이벤트용: clipboardData 에 직접 기록 (sendToClipboard 지정 시 그쪽으로)
export function copySelectionToEvent(core, e, cut = false) {
  if (cut && core.gos.suppressCutToClipboard) return false;
  const blocks = collectCopyTarget(core);
  if (!blocks.length) return false;
  const text = buildClipboardText(core, blocks, !!core.gos.copyHeadersToClipboard);
  if (typeof core.gos.sendToClipboard === 'function') send(core, text);
  else e.clipboardData?.setData('text/plain', text);
  if (cut) {
    core.dispatch('cutStart', { source: 'ui' });
    core.beginUndoBatch();
    blocks.forEach(({ nodes, columns }) =>
      nodes.forEach(n => columns.forEach(c => core.writeCell(n, c, null, 'clipboardCut'))),
    );
    core.endUndoBatch();
    core.dispatch('cutEnd', { source: 'ui' });
  } else {
    highlight(core, blocks);
  }
  return true;
}

export function cutSelectionToClipboard(core) {
  if (core.gos.suppressCutToClipboard) return;
  const blocks = collectCopyTarget(core);
  if (!blocks.length) return;
  core.dispatch('cutStart', { source: 'ui' });
    core.beginUndoBatch();
  send(core, buildClipboardText(core, blocks, !!core.gos.copyHeadersToClipboard));
  blocks.forEach(({ nodes, columns }) =>
    nodes.forEach(n => columns.forEach(c => core.writeCell(n, c, null, 'clipboardCut'))),
  );
  core.endUndoBatch();
    core.dispatch('cutEnd', { source: 'ui' });
}

// TSV 파싱 (따옴표로 감싼 멀티라인 셀 지원)
export function parseClipboardText(text, delim = '\t') {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function importValue(core, node, column, str) {
  const proc = core.gos.processCellFromClipboard;
  let v = str;
  if (typeof proc === 'function') {
    v = proc({ value: str, node, column, api: core.api, context: core.gos.context, type: 'clipboard' });
  }
  const cd = column.colDef;
  if (cd.useValueParserForImport !== false && typeof cd.valueParser === 'function') {
    v = cd.valueParser({ ...core.makeValueParams(node, column), oldValue: core.getCellValue(node, column), newValue: v });
  } else if (column.dataType === 'number' && typeof v === 'string') {
    const t = v.replace(/,/g, '').trim();
    v = t === '' ? null : Number.isNaN(Number(t)) ? null : Number(t);
  } else if (column.dataType === 'boolean' && typeof v === 'string') {
    v = v.trim().toLowerCase() === 'true';
  } else if (column.dataType === 'text' && v === '') {
    v = null;
  }
  return v;
}

export function pasteTextIntoGrid(core, text) {
  if (core.gos.suppressClipboardPaste || core.editing || text == null) return;
  const delim = core.gos.clipboardDelimiter ?? '\t';
  let data = parseClipboardText(text, delim);
  if (!data.length) return;
  const proc = core.gos.processDataFromClipboard;
  if (typeof proc === 'function') {
    const r = proc({ data, api: core.api, context: core.gos.context });
    if (r) data = r;
  }
  let startRow;
  let startColIdx;
  const range = core.ranges[core.ranges.length - 1];
  const b = range ? core.rangeBounds(range) : null;
  if (b) {
    startRow = b.r0;
    startColIdx = b.c0;
  } else if (core.focus) {
    startRow = core.focus.rowIndex;
    startColIdx = core.displayedIndex.get(core.focus.colId);
  }
  if (startRow == null || startColIdx == null) return;
  core.dispatch('pasteStart', { source: 'clipboard' });
  core.beginUndoBatch();
  const touchedNodes = new Set();
  const touchedCols = new Set();
  const cols = core.displayedColumns;
  const single = data.length === 1 && data[0].length === 1;
  const write = (node, col, str) => {
    if (!node || node.detail || !col || col.isAuto) return;
    if (!core.isCellEditable(col, node)) return;
    const sp = col.colDef.suppressPaste;
    if (sp === true || (typeof sp === 'function' && sp({ ...core.makeValueParams(node, col) }))) return;
    core.writeCell(node, col, importValue(core, node, col, str), 'paste');
    touchedNodes.add(node);
    touchedCols.add(col);
  };
  if (single && b && (b.r1 > b.r0 || b.c1 > b.c0)) {
    for (let ri = b.r0; ri <= b.r1; ri++) {
      for (let ci = b.c0; ci <= b.c1; ci++) write(core.displayedNodes[ri], cols[ci], data[0][0]);
    }
  } else {
    let ri = startRow;
    for (const rowVals of data) {
      while (core.displayedNodes[ri]?.detail) ri++;
      const node = core.displayedNodes[ri];
      if (!node || ri >= core.pageLastRow) break;
      rowVals.forEach((str, k) => write(node, cols[startColIdx + k], str));
      ri++;
    }
    if (core.cellSelectionOpts && touchedNodes.size) {
      const rows = [...touchedNodes].map(n => n.rowIndex);
      const cIdx = [...touchedCols].map(c => core.displayedIndex.get(c.colId));
      core.ranges = [
        {
          id: `range_${++core.rangeSeq}`,
          startRowIndex: Math.min(...rows),
          endRowIndex: Math.max(...rows),
          startColId: cols[Math.min(...cIdx)].colId,
          endColId: cols[Math.max(...cIdx)].colId,
        },
      ];
    }
  }
  core.endUndoBatch();
  core.dispatch('pasteEnd', { source: 'clipboard' });
  if (touchedNodes.size) {
    core.flashCells({ rowNodes: [...touchedNodes], columns: [...touchedCols] });
  }
  core.notify();
}
