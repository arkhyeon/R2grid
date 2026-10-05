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
      {
        key: 'sep',
        type: 'select',
        default: ',',
        label: 'columnSeparator',
        desc: 'CSV 칸 구분 문자. 값에 구분 문자·줄바꿈·따옴표가 있으면 자동으로 따옴표로 감쌉니다.',
        options: [
          { value: ',', label: ', (쉼표)', desc: '표준 CSV' },
          { value: ';', label: '; (세미콜론)', desc: '쉼표를 소수점으로 쓰는 지역(유럽) 엑셀용' },
          { value: '\t', label: 'Tab', desc: 'TSV — 엑셀에 붙여넣기 좋음' },
        ],
      },
      {
        key: 'headers',
        type: 'boolean',
        default: true,
        label: 'skipColumnHeaders (반대)',
        desc: '첫 줄에 컬럼 헤더 이름을 넣을지.',
        on: '첫 줄 = 헤더',
        off: '데이터만 (skipColumnHeaders: true)',
      },
      {
        key: 'onlySelected',
        type: 'boolean',
        default: false,
        label: 'onlySelected',
        desc: '선택된 행만 내보낼지. 기본은 필터·정렬이 적용된 현재 표시 순서의 전체 행입니다.',
        on: '체크한 행만',
        off: '표시된 전체 행',
      },
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
      {
        key: 'title',
        type: 'boolean',
        default: true,
        label: 'prependContent',
        desc: '데이터 위에 넣을 행들 (셀 병합 mergeAcross·스타일 지정 가능). 보고서 제목·조회 조건 표시에 씁니다.',
        on: '맨 위에 병합된 제목 행',
        off: '헤더부터 시작',
      },
      {
        key: 'total',
        type: 'boolean',
        default: true,
        label: 'appendContent',
        desc: '데이터 아래에 붙일 행들. 여기선 행 수 합계를 직접 계산해 넣습니다.',
        on: '맨 아래 합계 행',
        off: '데이터에서 끝',
      },
      {
        key: 'onlySelected',
        type: 'boolean',
        default: false,
        label: 'onlySelected',
        desc: '선택된 행만 엑셀로 내보낼지.',
        on: '체크한 행만',
        off: '표시된 전체 행',
      },
    ],
    render: (p, ctx) => <Excel p={p} ctx={ctx} />,
    code: () => `<R2Grid
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
      {
        key: 'type',
        type: 'select',
        default: 'groupedColumn',
        label: 'chartType',
        desc: '범위 차트 종류. 선택 범위의 첫 문자열 컬럼이 항목(가로축), 숫자 컬럼들이 계열이 됩니다. 셀 범위를 잡고 우클릭 › 범위 차트 로도 만들 수 있습니다.',
        options: [
          { value: 'groupedColumn', desc: '묶은 세로 막대 — 계열을 나란히' },
          { value: 'stackedColumn', desc: '누적 세로 막대 — 계열을 쌓아 합계 비교' },
          { value: 'groupedBar', desc: '묶은 가로 막대 — 항목 이름이 길 때' },
          { value: 'line', desc: '꺾은선 — 추세' },
          { value: 'area', desc: '영역 — 추세 + 크기' },
          { value: 'pie', desc: '원형 — 첫 숫자 계열의 비율' },
          { value: 'donut', desc: '도넛 — 원형과 같고 가운데 비움' },
        ],
      },
      {
        key: 'inline',
        type: 'boolean',
        default: false,
        label: 'chartContainer',
        desc: '차트를 그릴 DOM 요소. 지정하면 그 자리에 그리고, 없으면 그리드 위 떠 있는 창(끌어서 이동·닫기 가능)으로 띄웁니다.',
        on: '그리드 아래 영역에 바로 그림',
        off: '떠 있는 차트 창',
      },
    ],
    render: (p, ctx) => <Charts p={p} ctx={ctx} />,
    code: p => `<R2Grid cellSelection enableCharts ... />

const chartRef = api.createRangeChart({
  cellRange: { rowStartIndex: 0, rowEndIndex: 9, columns: ['owner', 'rowCnt', 'progress'] },
  chartType: '${p.type}',${p.inline ? '\n  chartContainer: containerRef.current,' : ''}
});
chartRef.destroyChart();`,
  },
];
