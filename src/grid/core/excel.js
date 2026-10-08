// Excel(xlsx) 내보내기 — AG exportDataAsExcel / getDataAsExcel 파라미터 호환
//  prependContent/appendContent(mergeAcross/mergeDown/styleId), rowHeight(fn), headerRowHeight,
//  addImageToCell(rowIndex, column, value), columnWidth, excelStyles, 그룹 헤더, processCellCallback ...
//  freezeRows('headers' | n | fn) / freezeColumns('pinned' | n), rowGroupExpandState('expanded' | 'collapsed' | 'match') + suppressRowOutline,
//  exportAsExcelTable, excelStyles.dataType('String' | 'Number' | 'Boolean' | 'DateTime' | 'Formula') + autoConvertFormulas,
//  pageSetup({ orientation, pageSize }), margins, headerFooterConfig
import { downloadFile, resolveClassValue, toText } from './utils.js';
import { zipAsync, zipSync } from './zip.js';

const xmlEsc = s =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const colLetter = idx => {
  let n = idx + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const MAX_CELL_TEXT = 32767;
const EMU = 9525;

// ── 스타일 (excelStyles) ───────────────────────────────────
function argb(color) {
  if (!color) return null;
  const c = String(color).replace('#', '');
  if (c.length === 6) return `FF${c.toUpperCase()}`;
  if (c.length === 8) return c.toUpperCase();
  return null;
}

class StyleBook {
  constructor(excelStyles) {
    this.defs = new Map((excelStyles || []).map(s => [s.id, s]));
    this.fonts = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
    this.fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    this.borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'];
    this.numFmts = [];
    this.xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.cache = new Map();
  }

  has(id) {
    return this.defs.has(id);
  }

  // 여러 style id 를 병합한 xf 인덱스
  xfFor(ids) {
    const list = (ids || []).filter(id => this.defs.has(id));
    if (!list.length) return 0;
    const key = list.join('|');
    if (this.cache.has(key)) return this.cache.get(key);
    const s = {};
    list.forEach(id => {
      const d = this.defs.get(id);
      Object.keys(d).forEach(k => {
        s[k] = typeof d[k] === 'object' && d[k] && !Array.isArray(d[k]) ? { ...(s[k] || {}), ...d[k] } : d[k];
      });
    });
    let fontId = 0;
    if (s.font) {
      const f = s.font;
      const color = argb(f.color);
      this.fonts.push(
        `<font>${f.bold ? '<b/>' : ''}${f.italic ? '<i/>' : ''}${f.strikeThrough ? '<strike/>' : ''}${
          f.underline ? `<u${f.underline === 'Double' ? ' val="double"' : ''}/>` : ''
        }<sz val="${f.size || 11}"/>${color ? `<color rgb="${color}"/>` : ''}<name val="${xmlEsc(f.fontName || 'Calibri')}"/></font>`,
      );
      fontId = this.fonts.length - 1;
    }
    let fillId = 0;
    if (s.interior?.color) {
      this.fills.push(
        `<fill><patternFill patternType="solid"><fgColor rgb="${argb(s.interior.color)}"/><bgColor indexed="64"/></patternFill></fill>`,
      );
      fillId = this.fills.length - 1;
    }
    let borderId = 0;
    if (s.borders) {
      const side = (tag, b) => {
        if (!b) return `<${tag}/>`;
        const style = { Continuous: b.weight >= 2 ? 'medium' : 'thin', Dash: 'dashed', Dot: 'dotted', Double: 'double' }[b.lineStyle] || 'thin';
        return `<${tag} style="${style}"><color rgb="${argb(b.color) || 'FF000000'}"/></${tag}>`;
      };
      const b = s.borders;
      this.borders.push(
        `<border>${side('left', b.borderLeft)}${side('right', b.borderRight)}${side('top', b.borderTop)}${side('bottom', b.borderBottom)}<diagonal/></border>`,
      );
      borderId = this.borders.length - 1;
    }
    let numFmtId = 0;
    if (s.numberFormat?.format) {
      numFmtId = 164 + this.numFmts.length;
      this.numFmts.push(`<numFmt numFmtId="${numFmtId}" formatCode="${xmlEsc(s.numberFormat.format)}"/>`);
    }
    let align = '';
    if (s.alignment) {
      const a = s.alignment;
      const h = a.horizontal ? ` horizontal="${String(a.horizontal).toLowerCase()}"` : '';
      const v = a.vertical ? ` vertical="${String(a.vertical).toLowerCase() === 'center' ? 'center' : String(a.vertical).toLowerCase()}"` : '';
      const w = a.wrapText ? ' wrapText="1"' : '';
      align = `<alignment${h}${v}${w}/>`;
    }
    this.xfs.push(
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"${
        fontId ? ' applyFont="1"' : ''
      }${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${numFmtId ? ' applyNumberFormat="1"' : ''}${
        align ? ' applyAlignment="1">' + align + '</xf>' : '/>'
      }`,
    );
    const idx = this.xfs.length - 1;
    this.cache.set(key, idx);
    return idx;
  }

  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${
      this.numFmts.length ? `<numFmts count="${this.numFmts.length}">${this.numFmts.join('')}</numFmts>` : ''
    }<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts><fills count="${this.fills.length}">${this.fills.join(
      '',
    )}</fills><borders count="${this.borders.length}">${this.borders.join(
      '',
    )}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${
      this.xfs.length
    }">${this.xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

// ── 시트 데이터 구성 ───────────────────────────────────────
function exportColumns(core, p) {
  if (p.columnKeys) return core.getColumnsFromKeys(p.columnKeys);
  const base = p.allColumns ? core.allColumns : core.displayedColumns;
  return base.filter(c => c.autoType !== 'selection' && c.autoType !== 'rowNumbers' && !c.colDef.skipExport);
}

// 내보낼 행: [{ node, level, hidden, collapsed }]
//  행 그룹: 접힌 그룹의 자식도 내보내고 엑셀 개요(outline)로 묶음 (AG rowGroupExpandState, 기본 'expanded')
function exportNodes(core, p) {
  const skip = n => typeof p.shouldRowBeSkipped === 'function' && p.shouldRowBeSkipped({ node: n, api: core.api, context: core.gos.context });
  if (p.onlySelected) {
    return core
      .getSelectedNodes()
      .filter(n => p.onlySelectedAllPages || !core.gos.pagination || (n.rowIndex >= core.pageFirstRow && n.rowIndex < core.pageLastRow))
      .sort((a, b) => (a.rowIndex ?? 0) - (b.rowIndex ?? 0))
      .filter(n => !skip(n))
      .map(node => ({ node, level: 0 }));
  }
  if (core.isGroupMode() && core.groupSortedTop && p.exportedRows !== 'all') {
    const state = p.rowGroupExpandState || 'expanded';
    const outline = !p.suppressRowOutline;
    const pivot = core.isPivotActive?.();
    const out = [];
    const walk = (list, depth, hidden) => {
      for (const n of list) {
        if (pivot && !n.group) continue;
        if (n.detail || n.stub || skip(n)) continue;
        const kids = n.group ? n.childrenAfterSort || [] : [];
        const closed = kids.length > 0 && (state === 'collapsed' || (state === 'match' && !n.expanded));
        out.push({ node: n, level: outline ? depth : 0, hidden: outline && hidden, collapsed: outline && closed });
        if (kids.length) {
          walk(kids, depth + 1, hidden || (outline && closed));
          if (core.groupTotalPosition(n) === 'bottom') {
            const f = core.getFooterNode(n);
            f.aggData = n.aggData;
            out.push({ node: f, level: outline ? depth + 1 : 0, hidden: outline && (hidden || closed) });
          }
        }
      }
    };
    walk(core.groupSortedTop, 0, false);
    // 총합계 행 (위/아래)
    const shown = core.sortedNodes;
    if (shown[0]?.footer && !shown[0].parent && shown[0].level === -1) out.unshift({ node: shown[0], level: 0 });
    const last = shown[shown.length - 1];
    if (last?.footer && last !== shown[0] && last.level === -1) out.push({ node: last, level: 0 });
    return out;
  }
  let nodes = p.exportedRows === 'all' ? core.rootNodes : core.isSsrm() ? core.rootNodes : core.sortedNodes;
  return nodes.filter(n => !n.detail && !n.stub && !skip(n)).map(node => ({ node, level: 0 }));
}

// excelStyles.dataType 로 셀 값 형식 맞추기 (AG 동일)
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function toExcelDate(v) {
  let d = v instanceof Date ? v : null;
  if (!d && typeof v === 'string' && v.trim()) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v.trim());
    if (m) return (Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) - EXCEL_EPOCH) / 86400000;
    d = new Date(v);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - EXCEL_EPOCH) / 86400000;
}

function applyDataType(cell, dataType, raw, autoFormula) {
  const text = cell.type === 'String' ? String(cell.value ?? '') : null;
  if (dataType === 'Formula' || (autoFormula && text && text.startsWith('='))) {
    if (text && text.startsWith('=')) {
      cell.type = 'Formula';
      cell.value = text.slice(1);
    }
    return;
  }
  if (dataType === 'DateTime') {
    const serial = toExcelDate(raw instanceof Date || typeof raw === 'string' ? raw : cell.value);
    if (serial != null) {
      cell.type = 'Number';
      cell.value = serial;
    }
  } else if (dataType === 'Number') {
    const n = typeof raw === 'number' ? raw : Number(String(cell.value).replace(/,/g, ''));
    if (cell.value !== '' && Number.isFinite(n)) {
      cell.type = 'Number';
      cell.value = n;
    }
  } else if (dataType === 'Boolean') {
    cell.type = 'Boolean';
    cell.value = raw === true || raw === 'true' || raw === 1;
  } else if (dataType === 'String') {
    cell.type = 'String';
    cell.value = cell.value == null ? '' : String(cell.value);
  }
}

function cellOut(core, node, col, p) {
  const value = core.getCellValue(node, col);
  if (typeof p.processCellCallback === 'function') {
    const out = p.processCellCallback({
      value,
      node,
      column: col,
      api: core.api,
      context: core.gos.context,
      type: 'excel',
      formatValue: v => core.formatValue(node, col, v) ?? v,
      parseValue: v => v,
    });
    return typeof out === 'number' ? { type: 'Number', value: out } : { type: 'String', value: out == null ? '' : toText(out) };
  }
  if (col.colDef.useValueFormatterForExport !== false || col.autoType === 'group') {
    const f = core.formatValue(node, col, value);
    if (f != null) return { type: 'String', value: toText(f) };
  }
  if (value == null) return { type: 'String', value: '' };
  if (typeof value === 'number' && Number.isFinite(value)) return { type: 'Number', value };
  if (typeof value === 'boolean') return { type: 'Boolean', value };
  if (col.autoType === 'group' && node.group) return { type: 'String', value: `${value}` };
  return { type: 'String', value: typeof value === 'object' && !(value instanceof Date) ? String(value) : toText(value) };
}

function cellStyleIds(core, node, col, styles) {
  const cd = col.colDef;
  const params = { ...core.makeValueParams(node, col), value: core.getCellValue(node, col), rowIndex: node.rowIndex };
  const cls = `${resolveClassValue(cd.cellClass, params)} ${
    cd.cellClassRules
      ? Object.keys(cd.cellClassRules)
          .filter(k => {
            const r = cd.cellClassRules[k];
            return typeof r === 'function' && r(params);
          })
          .join(' ')
      : ''
  }`;
  return cls.split(/\s+/).filter(id => id && styles.has(id));
}

// 마지막으로 dataType 을 준 스타일
function dataTypeOf(styles, ids) {
  let t;
  for (const id of ids) if (styles.defs.get(id)?.dataType) t = styles.defs.get(id).dataType;
  return t;
}

// 시트 1장의 모델 (getSheetDataForExcel 결과로도 사용)
export function getSheetDataForExcel(core, params = {}) {
  const p = { ...(core.gos.defaultExcelExportParams || {}), ...params };
  const styles = new StyleBook(core.gos.excelStyles);
  const cols = exportColumns(core, p);
  const rows = []; // { cells: [{ c, type, value, xf }], height }
  const merges = [];
  const images = [];
  let r = 0; // 0-based 행
  const rowHeightFor = (excelRow, isHeader) => {
    if (isHeader && p.headerRowHeight != null) {
      return typeof p.headerRowHeight === 'function' ? p.headerRowHeight({ rowIndex: excelRow }) : p.headerRowHeight;
    }
    if (p.rowHeight == null) return null;
    return typeof p.rowHeight === 'function' ? p.rowHeight({ rowIndex: excelRow }) : p.rowHeight;
  };
  const tryImage = (excelRow, colIdx, value, cell) => {
    if (typeof p.addImageToCell !== 'function') return;
    const res = p.addImageToCell(excelRow, cols[colIdx], value);
    if (!res || !res.image) return;
    images.push({ image: res.image, row: r, col: colIdx });
    cell.value = res.value ?? '';
    cell.type = 'String';
  };
  const pushContent = content => {
    if (!content) return;
    if (typeof content === 'string') content = [{ cells: [{ data: { type: 'String', value: content } }] }];
    content.forEach(row => {
      const excelRow = r + 1;
      const cells = [];
      let c = 0;
      (row.cells || []).forEach(cell => {
        const ma = cell.mergeAcross || 0;
        const md = cell.mergeDown || 0;
        const d = cell.data || {};
        const out = {
          c,
          type: d.type === 'Number' ? 'Number' : d.type === 'Boolean' ? 'Boolean' : 'String',
          value: d.value ?? '',
          xf: styles.xfFor(cell.styleId ? [].concat(cell.styleId) : []),
        };
        if (cell.styleId) applyDataType(out, dataTypeOf(styles, [].concat(cell.styleId)), d.value, p.autoConvertFormulas);
        else if (p.autoConvertFormulas) applyDataType(out, undefined, d.value, true);
        tryImage(excelRow, c, out.value, out);
        cells.push(out);
        if (ma || md) merges.push(`${colLetter(c)}${r + 1}:${colLetter(c + ma)}${r + 1 + md}`);
        c += 1 + ma;
      });
      rows.push({ cells, height: row.height ?? rowHeightFor(excelRow, false) });
      r++;
    });
  };

  pushContent(p.prependContent);

  // 그룹 헤더
  const depth = cols.reduce((m, c) => Math.max(m, c.groupChain.length), 0);
  if (!p.skipColumnGroupHeaders && depth > 0 && !p.skipColumnHeaders) {
    for (let level = 0; level < depth; level++) {
      const excelRow = r + 1;
      const cells = [];
      let i = 0;
      while (i < cols.length) {
        const g = cols[i].groupChain[level] || null;
        let j = i;
        while (j + 1 < cols.length && g && cols[j + 1].groupChain[level] === g) j++;
        const name = g ? g.colGroupDef.headerName ?? '' : '';
        cells.push({ c: i, type: 'String', value: name, xf: styles.xfFor(['headerGroup']) });
        if (j > i) merges.push(`${colLetter(i)}${r + 1}:${colLetter(j)}${r + 1}`);
        i = j + 1;
      }
      rows.push({ cells, height: rowHeightFor(excelRow, true) });
      r++;
    }
  }
  let headerRow = -1;
  if (!p.skipColumnHeaders) {
    headerRow = r;
    const excelRow = r + 1;
    const cells = cols.map((col, i) => {
      const name = typeof p.processHeaderCallback === 'function'
        ? p.processHeaderCallback({ column: col, api: core.api, context: core.gos.context })
        : core.getDisplayName(col);
      const hc = resolveClassValue(col.colDef.headerClass, { colDef: col.colDef, column: col, api: core.api })
        .split(/\s+/)
        .filter(Boolean);
      return { c: i, type: 'String', value: name ?? '', xf: styles.xfFor(['header', ...hc]) };
    });
    rows.push({ cells, height: rowHeightFor(excelRow, true) });
    r++;
  }
  const headersEnd = r; // 머리글(앞 내용 + 그룹 헤더 + 컬럼 헤더) 다음 행
  const firstDataRow = r;
  exportNodes(core, p).forEach(({ node, level, hidden, collapsed }) => {
    const excelRow = r + 1;
    const cells = cols.map((col, i) => {
      const out = cellOut(core, node, col, p);
      const ids = cellStyleIds(core, node, col, styles);
      const cell = { c: i, ...out, xf: styles.xfFor(ids) };
      const dt = dataTypeOf(styles, ids);
      if (dt || p.autoConvertFormulas) applyDataType(cell, dt, core.getCellValue(node, col), p.autoConvertFormulas);
      tryImage(excelRow, i, out.value, cell);
      return cell;
    });
    rows.push({ cells, height: rowHeightFor(excelRow, false), outline: level || 0, hidden: !!hidden, collapsed: !!collapsed });
    r++;
  });
  const lastDataRow = r - 1;
  pushContent(p.appendContent);

  const widths = cols.map((col, i) => {
    let px = col.actualWidth;
    if (p.columnWidth != null) px = typeof p.columnWidth === 'function' ? p.columnWidth({ column: col, index: i }) : p.columnWidth;
    return px;
  });
  let sheetName = String(p.sheetName || 'Sheet1').replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet1';
  // 틀 고정: freezeRows 'headers' = 머리글까지, freezeColumns 'pinned' = 왼쪽 고정 컬럼까지
  const fr = typeof p.freezeRows === 'function' ? p.freezeRows({ api: core.api, context: core.gos.context }) : p.freezeRows;
  const freeze = {
    rows: fr === 'headers' ? headersEnd : Math.max(0, Number(fr) || 0),
    cols: p.freezeColumns === 'pinned' ? cols.filter(c => c.pinned === 'left').length : Math.max(0, Number(p.freezeColumns) || 0),
  };
  // 엑셀 표 (필터 버튼·줄무늬): 컬럼 헤더 행 ~ 마지막 데이터 행
  let table = null;
  if (p.exportAsExcelTable && headerRow >= 0 && cols.length) {
    const t = typeof p.exportAsExcelTable === 'object' ? p.exportAsExcelTable : {};
    const used = new Set();
    const names = rows[headerRow].cells.map((c, i) => {
      let n = String(c.value || `Column${i + 1}`);
      const base = n;
      let k = 2;
      while (used.has(n.toLowerCase())) n = `${base}${k++}`;
      used.add(n.toLowerCase());
      return n;
    });
    // 표 컬럼 이름은 머리글 셀 값과 같아야 함 (다르면 엑셀이 복구 메시지)
    rows[headerRow].cells.forEach((c, i) => {
      c.type = 'String';
      c.value = names[i];
    });
    table = {
      name: String(t.name || `${sheetName}Table`).replace(/[^\w.]/g, '_').replace(/^(\d)/, '_$1'),
      ref: `A${headerRow + 1}:${colLetter(cols.length - 1)}${Math.max(headerRow + 2, lastDataRow + 1)}`,
      names,
      showFilterButton: t.showFilterButton !== false,
      showRowStripes: t.showRowStripes !== false,
      showColumnStripes: !!t.showColumnStripes,
      highlightFirstColumn: !!t.highlightFirstColumn,
      highlightLastColumn: !!t.highlightLastColumn,
    };
  }
  return {
    __clmSheet: true,
    sheetName,
    rows,
    merges,
    images,
    widths,
    styles,
    freeze,
    table,
    firstDataRow,
    pageSetup: p.pageSetup,
    margins: p.margins,
    headerFooter: p.headerFooterConfig,
  };
}

const PAGE_SIZES = { letter: 1, legal: 5, executive: 7, a3: 8, a4: 9, a5: 11, b4: 12, b5: 13 };

// headerFooterConfig: { all | first | even: { header: [{ value, position: 'Left'|'Center'|'Right', font }], footer: [...] } }
function headerFooterXml(cfg) {
  if (!cfg) return '';
  const part = list => {
    const by = { Left: '', Center: '', Right: '' };
    (list || []).forEach(it => {
      const pos = it.position || 'Center';
      const f = it.font || {};
      const font = f.fontName || f.bold || f.italic ? `&"${f.fontName || 'Calibri'},${f.bold && f.italic ? 'Bold Italic' : f.bold ? 'Bold' : f.italic ? 'Italic' : 'Regular'}"` : '';
      const size = f.size ? `&${f.size}` : '';
      const val = String(it.value ?? '').replace(/&/g, '&&').replace(/&&\[(Page|Pages|Date|Time|Tab|File)\]/g, (_, k) => ({ Page: '&P', Pages: '&N', Date: '&D', Time: '&T', Tab: '&A', File: '&F' })[k]);
      by[pos] = (by[pos] || '') + font + size + val;
    });
    return `${by.Left ? `&L${by.Left}` : ''}${by.Center ? `&C${by.Center}` : ''}${by.Right ? `&R${by.Right}` : ''}`;
  };
  const one = (tag, c) => (c ? `<${tag}Header>${xmlEsc(part(c.header))}</${tag}Header><${tag}Footer>${xmlEsc(part(c.footer))}</${tag}Footer>` : '');
  const attrs = `${cfg.first ? ' differentFirst="1"' : ''}${cfg.even ? ' differentOddEven="1"' : ''}`;
  return `<headerFooter${attrs}>${one('odd', cfg.all)}${one('even', cfg.even)}${one('first', cfg.first)}</headerFooter>`;
}

function sheetXmlChunks(sheet, drawingRid, tableRid) {
  const out = [];
  const maxOutline = sheet.rows.reduce((m, r) => Math.max(m, r.outline || 0), 0);
  const fz = sheet.freeze || { rows: 0, cols: 0 };
  let pane = '';
  if (fz.rows || fz.cols) {
    const active = fz.rows && fz.cols ? 'bottomRight' : fz.rows ? 'bottomLeft' : 'topRight';
    pane = `<pane${fz.cols ? ` xSplit="${fz.cols}"` : ''}${fz.rows ? ` ySplit="${fz.rows}"` : ''} topLeftCell="${colLetter(fz.cols)}${fz.rows + 1}" activePane="${active}" state="frozen"/><selection pane="${active}"/>`;
  }
  out.push(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${
      maxOutline || sheet.pageSetup?.fitToPage ? `<sheetPr>${maxOutline ? '<outlinePr summaryBelow="0"/>' : ''}${sheet.pageSetup?.fitToPage ? '<pageSetUpPr fitToPage="1"/>' : ''}</sheetPr>` : ''
    }<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"${maxOutline ? ` outlineLevelRow="${maxOutline}"` : ''}/>`,
  );
  if (sheet.widths.length) {
    out.push(
      `<cols>${sheet.widths
        .map((px, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(1, Math.round((px / 7) * 100) / 100)}" customWidth="1"/>`)
        .join('')}</cols>`,
    );
  }
  out.push('<sheetData>');
  let buf = '';
  sheet.rows.forEach((row, ri) => {
    const rn = ri + 1;
    buf += `<row r="${rn}"${row.height != null ? ` ht="${Math.round(row.height * 0.75 * 100) / 100}" customHeight="1"` : ''}${row.outline ? ` outlineLevel="${row.outline}"` : ''}${
      row.hidden ? ' hidden="1"' : ''
    }${row.collapsed ? ' collapsed="1"' : ''}>`;
    for (const cell of row.cells) {
      const ref = `${colLetter(cell.c)}${rn}`;
      const s = cell.xf ? ` s="${cell.xf}"` : '';
      if (cell.type === 'Formula') {
        buf += `<c r="${ref}"${s}><f>${xmlEsc(cell.value)}</f></c>`;
      } else if (cell.type === 'Number' && typeof cell.value === 'number' && Number.isFinite(cell.value)) {
        buf += `<c r="${ref}"${s}><v>${cell.value}</v></c>`;
      } else if (cell.type === 'Boolean') {
        buf += `<c r="${ref}"${s} t="b"><v>${cell.value ? 1 : 0}</v></c>`;
      } else {
        const text = String(cell.value ?? '');
        if (!text) {
          if (s) buf += `<c r="${ref}"${s}/>`;
          continue;
        }
        buf += `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(text.slice(0, MAX_CELL_TEXT))}</t></is></c>`;
      }
    }
    buf += '</row>';
    if (buf.length > 1_000_000) {
      out.push(buf);
      buf = '';
    }
  });
  out.push(buf, '</sheetData>');
  if (sheet.merges.length) {
    out.push(`<mergeCells count="${sheet.merges.length}">${sheet.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
  }
  // 인쇄: 여백(인치) · 용지 · 머리글/바닥글
  const m = sheet.margins;
  if (m || sheet.pageSetup || sheet.headerFooter) {
    out.push(
      `<pageMargins left="${m?.left ?? 0.7}" right="${m?.right ?? 0.7}" top="${m?.top ?? 0.75}" bottom="${m?.bottom ?? 0.75}" header="${m?.header ?? 0.3}" footer="${m?.footer ?? 0.3}"/>`,
    );
  }
  const ps = sheet.pageSetup;
  if (ps) {
    const size = PAGE_SIZES[String(ps.pageSize || '').toLowerCase().replace(/\s+/g, '')];
    out.push(`<pageSetup${size ? ` paperSize="${size}"` : ''}${ps.orientation ? ` orientation="${String(ps.orientation).toLowerCase()}"` : ''}${ps.fitToPage ? ' fitToWidth="1" fitToHeight="0"' : ''}/>`);
  }
  out.push(headerFooterXml(sheet.headerFooter));
  if (drawingRid) out.push(`<drawing r:id="${drawingRid}"/>`);
  if (tableRid) out.push(`<tableParts count="1"><tablePart r:id="${tableRid}"/></tableParts>`);
  out.push('</worksheet>');
  return out;
}

function tableXml(t, id) {
  const style = `<tableStyleInfo name="TableStyleMedium2" showFirstColumn="${t.highlightFirstColumn ? 1 : 0}" showLastColumn="${t.highlightLastColumn ? 1 : 0}" showRowStripes="${
    t.showRowStripes ? 1 : 0
  }" showColumnStripes="${t.showColumnStripes ? 1 : 0}"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="${id}" name="${xmlEsc(t.name)}" displayName="${xmlEsc(
    t.name,
  )}" ref="${t.ref}" totalsRowShown="0">${t.showFilterButton ? `<autoFilter ref="${t.ref}"/>` : ''}<tableColumns count="${t.names.length}">${t.names
    .map((n, i) => `<tableColumn id="${i + 1}" name="${xmlEsc(n)}"/>`)
    .join('')}</tableColumns>${style}</table>`;
}

function base64ToBytes(b64) {
  const clean = String(b64).replace(/^data:[^;]+;base64,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function drawingXml(sheet, mediaIndexOf) {
  const anchors = sheet.images.map((img, k) => {
    const im = img.image;
    const pos = im.position || {};
    const row = (pos.row != null ? pos.row - 1 : img.row) | 0;
    const col = (pos.column != null ? pos.column - 1 : img.col) | 0;
    let w = im.width;
    let h = im.height;
    if (w == null || im.fitCell) {
      const span = pos.colSpan || 1;
      w = sheet.widths.slice(col, col + span).reduce((s, x) => s + x, 0) || 100;
    }
    if (h == null || im.fitCell) {
      const span = pos.rowSpan || 1;
      h = sheet.rows.slice(row, row + span).reduce((s, rr) => s + (rr.height ?? 20), 0) || 20;
    }
    const rid = `rId${mediaIndexOf(im) + 1}`;
    return `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${(pos.offsetX || 0) * EMU}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${(pos.offsetY || 0) * EMU}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="${xmlEsc(im.id || `Picture ${k + 1}`)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors.join(
    '',
  )}</xdr:wsDr>`;
}

// 여러 시트 모델 → xlsx 파일 목록
function buildFiles(sheets) {
  const files = [];
  const styles = sheets[0].styles; // 첫 시트 스타일북 공용 (AG 도 단일 excelStyles)
  const media = []; // { key, ext, bytes }
  const sheetEntries = [];
  let tableSeq = 0;
  sheets.forEach((sheet, si) => {
    const n = si + 1;
    let drawingRid = null;
    let tableRid = null;
    const rels = [];
    if (sheet.images.length) {
      const local = [];
      const indexOf = im => {
        const key = im.id || im.base64.slice(0, 64);
        let k = local.findIndex(x => x.key === key);
        if (k < 0) {
          const ext = im.imageType === 'jpg' || im.imageType === 'jpeg' ? 'jpeg' : im.imageType || 'png';
          let gm = media.findIndex(m => m.key === key);
          if (gm < 0) {
            media.push({ key, ext, bytes: base64ToBytes(im.base64) });
            gm = media.length - 1;
          }
          local.push({ key, mediaName: `image${gm + 1}.${ext}` });
          k = local.length - 1;
        }
        return k;
      };
      const dxml = drawingXml(sheet, indexOf);
      files.push({ name: `xl/drawings/drawing${n}.xml`, content: dxml });
      files.push({
        name: `xl/drawings/_rels/drawing${n}.xml.rels`,
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${local
          .map((l, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${l.mediaName}"/>`)
          .join('')}</Relationships>`,
      });
      rels.push(`<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/>`);
      drawingRid = 'rId1';
    }
    let tableN = 0;
    if (sheet.table) {
      tableN = ++tableSeq;
      tableRid = `rId${rels.length + 1}`;
      rels.push(`<Relationship Id="${tableRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table${tableN}.xml"/>`);
      files.push({ name: `xl/tables/table${tableN}.xml`, content: tableXml(sheet.table, tableN) });
    }
    if (rels.length) {
      files.push({
        name: `xl/worksheets/_rels/sheet${n}.xml.rels`,
        content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
      });
    }
    files.push({ name: `xl/worksheets/sheet${n}.xml`, content: sheetXmlChunks(sheet, drawingRid, tableRid) });
    sheetEntries.push({ n, name: sheet.sheetName, drawing: !!drawingRid, table: tableN });
  });
  media.forEach((m, i) => files.push({ name: `xl/media/image${i + 1}.${m.ext}`, content: m.bytes }));
  // 시트 이름 중복 방지
  const used = new Set();
  sheetEntries.forEach(s => {
    let name = s.name;
    let k = 2;
    while (used.has(name.toLowerCase())) name = `${s.name.slice(0, 28)}(${k++})`;
    used.add(name.toLowerCase());
    s.name = name;
  });
  files.unshift(
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetEntries
        .map(
          s =>
            `<Override PartName="/xl/worksheets/sheet${s.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${
              s.drawing ? `<Override PartName="/xl/drawings/drawing${s.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : ''
            }${s.table ? `<Override PartName="/xl/tables/table${s.table}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>` : ''}`,
        )
        .join('')}</Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries
        .map(s => `<sheet name="${xmlEsc(s.name)}" sheetId="${s.n}" r:id="rId${s.n}"/>`)
        .join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetEntries
        .map(
          s =>
            `<Relationship Id="rId${s.n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.n}.xml"/>`,
        )
        .join('')}<Relationship Id="rId${sheetEntries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', content: styles.xml() },
  );
  return files;
}

function fileNameOf(core, p) {
  let name = p.fileName || 'export.xlsx';
  if (typeof name === 'function') name = name({ api: core.api, context: core.gos.context });
  if (!/\.xlsx$/i.test(name)) name += '.xlsx';
  return name;
}

export function getDataAsExcel(core, params = {}) {
  return zipSync(buildFiles([getSheetDataForExcel(core, params)]));
}

export function exportDataAsExcel(core, params = {}) {
  const p = { ...(core.gos.defaultExcelExportParams || {}), ...params };
  const files = buildFiles([getSheetDataForExcel(core, p)]);
  const name = fileNameOf(core, p);
  zipAsync(files).then(blob => downloadFile(name, blob));
}

export function getMultipleSheetsAsExcel(core, params = {}) {
  const sheets = (params.data || []).filter(s => s && s.__clmSheet);
  if (!sheets.length) return undefined;
  return zipSync(buildFiles(sheets));
}

export function exportMultipleSheetsAsExcel(core, params = {}) {
  const sheets = (params.data || []).filter(s => s && s.__clmSheet);
  if (!sheets.length) return;
  zipAsync(buildFiles(sheets)).then(blob => downloadFile(fileNameOf(core, params), blob));
}
