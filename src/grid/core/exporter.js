// CSV 내보내기 (exportDataAsCsv / getDataAsCsv 동작)
import { downloadFile, toText } from './utils.js';

function resolveColumns(core, params) {
  if (params.columnKeys) return core.getColumnsFromKeys(params.columnKeys);
  const base = params.allColumns ? core.allColumns : core.displayedColumns;
  return base.filter(c => !c.isAuto && !c.colDef.skipExport);
}

function resolveNodes(core, params) {
  if (params.onlySelected) {
    return core
      .getSelectedNodes()
      .filter(n => params.onlySelectedAllPages || !core.gos.pagination || (n.rowIndex >= core.pageFirstRow && n.rowIndex < core.pageLastRow))
      .sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0));
  }
  if (params.exportedRows === 'all') return core.rootNodes;
  let nodes = core.sortedNodes;
  if (params.rowPositions) nodes = params.rowPositions.map(p => core.displayedNodes[p.rowIndex]).filter(Boolean);
  if (typeof params.shouldRowBeSkipped === 'function') {
    nodes = nodes.filter(n => !params.shouldRowBeSkipped({ node: n, api: core.api, context: core.gos.context }));
  }
  return nodes;
}

export function exportCellText(core, node, column, params) {
  const value = core.getCellValue(node, column);
  if (typeof params.processCellCallback === 'function') {
    const out = params.processCellCallback({
      value,
      node,
      column,
      api: core.api,
      context: core.gos.context,
      type: 'csv',
      formatValue: v => core.formatValue(node, column, v) ?? v,
      parseValue: v => v,
    });
    return out == null ? '' : toText(out);
  }
  if (column.colDef.useValueFormatterForExport !== false) {
    const f = core.formatValue(node, column, value);
    if (f != null) return toText(f);
  }
  return value == null ? '' : typeof value === 'object' && !(value instanceof Date) ? String(value) : toText(value);
}

export function getDataAsCsv(core, params = {}) {
  const p = { ...(core.gos.defaultCsvExportParams || {}), ...params };
  const sep = p.columnSeparator ?? ',';
  const quote = s => (p.suppressQuotes ? s : `"${String(s).replace(/"/g, '""')}"`);
  const cols = resolveColumns(core, p);
  const lines = [];
  const pushContent = content => {
    if (!content) return;
    if (typeof content === 'string') lines.push(content);
    else content.forEach(row => lines.push(row.cells.map(c => quote(c.data?.value ?? '')).join(sep)));
  };
  pushContent(p.prependContent);
  if (!p.skipColumnHeaders) {
    lines.push(
      cols
        .map(c => {
          const name = typeof p.processHeaderCallback === 'function'
            ? p.processHeaderCallback({ column: c, api: core.api, context: core.gos.context })
            : core.getDisplayName(c);
          return quote(name ?? '');
        })
        .join(sep),
    );
  }
  resolveNodes(core, p).forEach(n => {
    if (n.detail) return;
    lines.push(cols.map(c => quote(exportCellText(core, n, c, p))).join(sep));
  });
  pushContent(p.appendContent);
  return lines.join('\r\n');
}

export function exportDataAsCsv(core, params = {}) {
  const p = { ...(core.gos.defaultCsvExportParams || {}), ...params };
  const csv = getDataAsCsv(core, p);
  let name = p.fileName || 'export.csv';
  if (typeof name === 'function') name = name({ api: core.api, context: core.gos.context });
  if (!/\.csv$/i.test(name)) name += '.csv';
  downloadFile(name, csv, 'text/csv;charset=utf-8;');
}
