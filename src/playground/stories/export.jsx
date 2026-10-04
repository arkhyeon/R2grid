import React, { useRef, useState } from 'react';
import { BASE_COLUMNS, SAMPLE } from '../data.js';
import { Grid } from './_shared.jsx';

const CAT = '내보내기 · 차트';

function Csv({ p, ctx }) {
  const ref = useRef(null);
  const [preview, setPreview] = useState('');
  const params = () => ({ fileName: '작업목록.csv', columnSeparator: p.sep, onlySelected: p.onlySelected, skipColumnHeaders: !p.headers });
  return (
    <>
      <div className="pg-toolbar">
        <button onClick={() => ref.current.api.exportDataAsCsv(params())}>CSV 다운로드</button>
        <button onClick={() => setPreview(ref.current.api.getDataAsCsv(params()).split('\n').slice(0, 6).join('\n'))}>getDataAsCsv 미리보기</button>
      </div>
      {preview && <pre style={{ fontSize: 12, background: 'var(--pg-code-bg)', color: 'var(--pg-code-text)', padding: 8, borderRadius: 6 }}>{preview}</pre>}
      <Grid gridRef={ref} height={300} rowData={SAMPLE} columnDefs={BASE_COLUMNS} rowSelection={{ mode: 'multiRow' }} onGridReady={() => ctx.log('행을 선택하고 onlySelected 를 켜면 선택 행만 내보냅니다')} />
    </>
  );
}

function Excel({ p, ctx }) {
  const ref = useRef(null);
  const run = () => {
    const api = ref.current.api;
    const cols = api.getAllDisplayedColumns().length;
    api.exportDataAsExcel({
      fileName: '작업목록.xlsx',
      sheetName: '작업',
      prependContent: p.title ? [{ cells: [{ data: { type: 'String', value: 'R2grid 작업 목록 보고서' }, mergeAcross: cols - 1, styleId: 'title' }] }] : undefined,
      appendContent: p.total ? [{ cells: [{ data: { type: 'String', value: '합계' } }, ...Array(3).fill({ data: { type: 'String', value: '' } }), { data: { type: 'Number', value: SAMPLE.reduce((s, r) => s + r.rowCnt, 0) } }] }] : undefined,
      onlySelected: p.onlySelected,
    });
    ctx.log('exportDataAsExcel (xlsx, deflate 압축)');
  };
  return (
    <>
      <div className="pg-toolbar">
        <button onClick={run}>Excel 다운로드</button>
        <button
          onClick={() => {
            const blob = ref.current.api.getDataAsExcel({ sheetName: '작업' });
            ctx.log(`getDataAsExcel → Blob ${(blob.size / 1024).toFixed(1)}KB (동기, 자체 deflate)`);
          }}
        >
          getDataAsExcel (Blob)
        </button>
      </div>
      <Grid
        gridRef={ref}
        rowData={SAMPLE}
        columnDefs={[{ headerName: '기본', children: BASE_COLUMNS.slice(0, 3) }, { headerName: '상세', children: BASE_COLUMNS.slice(3) }]}
        rowSelection={{ mode: 'multiRow' }}
        excelStyles={[
          { id: 'header', font: { bold: true, color: '#FFFFFF' }, interior: { color: '#3E3E3E', pattern: 'Solid' } },
          { id: 'title', font: { bold: true, size: 14 }, alignment: { horizontal: 'Center' } },
        ]}
      />
    </>
  );
}

function Charts({ p, ctx }) {
  const ref = useRef(null);
  const container = useRef(null);
  return (
    <>
      <div className="pg-toolbar">
        <button
          onClick={() => {
            const r = ref.current.api.createRangeChart({
              cellRange: { rowStartIndex: 0, rowEndIndex: 9, columns: ['owner', 'rowCnt', 'progress'] },
              chartType: p.type,
              chartContainer: p.inline ? container.current : undefined,
            });
            ctx.log(`createRangeChart → ${r?.chartId}`);
          }}
        >
          createRangeChart (0~9행)
        </button>
        <span className="pg-note">또는 숫자 컬럼을 포함해 범위를 드래그 → 우클릭 → 범위 차트</span>
      </div>
      <Grid gridRef={ref} height={360} rowData={SAMPLE} columnDefs={[...BASE_COLUMNS, { field: 'progress', headerName: '진행률', width: 100 }]} cellSelection enableCharts />
      <div ref={container} style={{ height: p.inline ? 320 : 0, marginTop: p.inline ? 10 : 0 }} />
    </>
  );
}

export default [
  {
    id: 'csv-export',
    category: CAT,
    name: 'CSV 내보내기',
    desc: 'exportDataAsCsv / getDataAsCsv. 표시 순서·필터·정렬이 반영되고 valueFormatter 결과로 저장합니다.',
    keywords: ['exportDataAsCsv', 'getDataAsCsv', 'columnSeparator', 'onlySelected', 'skipColumnHeaders', 'processCellCallback', 'fileName', 'defaultCsvExportParams'],
    controls: [
      { key: 'sep', type: 'select', options: [',', ';', '\t'], default: ',', desc: 'columnSeparator' },
      { key: 'headers', type: 'boolean', default: true },
      { key: 'onlySelected', type: 'boolean', default: false },
    ],
    render: (p, ctx) => <Csv p={p} ctx={ctx} />,
    code: p => `api.exportDataAsCsv({
  fileName: '작업목록.csv',
  columnSeparator: '${p.sep === '\t' ? '\\t' : p.sep}',
  onlySelected: ${p.onlySelected},
  skipColumnHeaders: ${!p.headers},
});`,
  },
  {
    id: 'excel-export',
    category: CAT,
    name: 'Excel(xlsx) 내보내기',
    desc: '외부 라이브러리 없이 xlsx 를 직접 생성합니다. 그룹 헤더 병합, prepend/appendContent(mergeAcross), excelStyles, rowHeight, addImageToCell(차트 이미지), 다중 시트.',
    keywords: ['exportDataAsExcel', 'getDataAsExcel', 'getMultipleSheetsAsExcel', 'exportMultipleSheetsAsExcel', 'getSheetDataForExcel', 'excelStyles', 'prependContent', 'appendContent', 'mergeAcross', 'addImageToCell', 'rowHeight', 'sheetName', 'xlsx'],
    controls: [
      { key: 'title', type: 'boolean', default: true, desc: 'prependContent 제목 행 (병합)' },
      { key: 'total', type: 'boolean', default: true, desc: 'appendContent 합계 행' },
      { key: 'onlySelected', type: 'boolean', default: false },
    ],
    render: (p, ctx) => <Excel p={p} ctx={ctx} />,
    code: () => `<AgGridReact
  excelStyles={[
    { id: 'header', font: { bold: true, color: '#FFFFFF' }, interior: { color: '#3E3E3E', pattern: 'Solid' } },
    { id: 'title', font: { bold: true, size: 14 } },
  ]}
/>

api.exportDataAsExcel({
  fileName: '작업목록.xlsx',
  prependContent: [{ cells: [{ data: { type: 'String', value: '보고서' }, mergeAcross: cols - 1, styleId: 'title' }] }],
  appendContent: [{ cells: [{ data: { type: 'String', value: '합계' } }, ...] }],
});`,
    usage: {
      file: 'assets/ExcelDownload.jsx',
      code: `AgCharts.getImageDataURL(chartRef.current.chart).then(imageDataURL => {
  gridRef.current.api.exportDataAsExcel({
    prependContent: [
      {
        cells: [
          {
            data: {
              type: 'String',
              value: imageDataURL,
            },
            mergeAcross: gridRef.current.api.getAllGridColumns().length - 1,
          },
        ],
      },
    ],
    rowHeight: params => (params.rowIndex === 1 ? 350 : 20),
    addImageToCell: i =>
      i === 1 && {
        image: {
          id: 'logo',
          base64: imageDataURL,
          imageType: 'png',
          width: 865,
          height: 350,
          ...`,
    },
  },
  {
    id: 'integrated-charts',
    category: CAT,
    name: '통합 차트 (범위 차트)',
    desc: 'enableCharts 후 범위를 선택해 우클릭 → 범위 차트, 또는 api.createRangeChart. 비숫자 첫 컬럼이 카테고리, 숫자 컬럼이 시리즈이며 데이터가 바뀌면 차트도 갱신됩니다. 종류 전환·PNG 저장 지원.',
    keywords: ['enableCharts', 'createRangeChart', 'chartType', 'groupedColumn', 'stackedColumn', 'normalizedColumn', 'groupedBar', 'line', 'area', 'pie', 'donut', 'chartContainer', 'getChartModels', 'getChartRef', 'updateChart', 'downloadChart', 'getChartImageDataURL', 'chartRange', 'onChartCreated'],
    controls: [
      { key: 'type', type: 'select', options: ['groupedColumn', 'stackedColumn', 'groupedBar', 'line', 'area', 'pie', 'donut'], default: 'groupedColumn' },
      { key: 'inline', type: 'boolean', default: false, desc: 'chartContainer 로 페이지 안에 표시' },
    ],
    render: (p, ctx) => <Charts p={p} ctx={ctx} />,
    code: p => `<AgGridReact cellSelection enableCharts ... />

const chartRef = api.createRangeChart({
  cellRange: { rowStartIndex: 0, rowEndIndex: 9, columns: ['owner', 'rowCnt', 'progress'] },
  chartType: '${p.type}',${p.inline ? '\n  chartContainer: containerRef.current,' : ''}
});
chartRef.destroyChart();`,
  },
];
