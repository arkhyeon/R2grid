import React, { useEffect, useRef, useState } from 'react';
import { BASE_COLUMNS, SALES, SAMPLE } from '../data.js';
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
      freezeRows: p.freeze !== 'none' ? 'headers' : undefined,
      freezeColumns: p.freeze === 'both' ? 'pinned' : undefined,
      rowGroupExpandState: p.group !== 'none' ? p.group : undefined,
      exportAsExcelTable: p.table ? { name: 'Tasks' } : undefined,
      pageSetup: p.print ? { orientation: 'Landscape', pageSize: 'A4' } : undefined,
      headerFooterConfig: p.print ? { all: { header: [{ value: '작업 목록', position: 'Center', font: { bold: true } }], footer: [{ value: '&[Page] / &[Pages]', position: 'Right' }] } } : undefined,
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
        key={p.group === 'none' ? 'flat' : 'group'}
        gridRef={ref}
        rowData={SAMPLE}
        columnDefs={[
          { headerName: '기본', children: BASE_COLUMNS.slice(0, 3).map(c => (c.field === 'id' ? { ...c, pinned: 'left' } : c.field === 'dbms' ? { ...c, rowGroup: p.group !== 'none', hide: p.group !== 'none' } : c)) },
          { headerName: '상세', children: BASE_COLUMNS.slice(3).map(c => (c.field === 'rowCnt' ? { ...c, aggFunc: 'sum' } : c)) },
          { field: 'updatedAt', headerName: '수정일', width: 110, cellClass: p.dates ? 'excelDate' : undefined },
        ]}
        rowSelection={{ mode: 'multiRow' }}
        excelStyles={[
          { id: 'header', font: { bold: true, color: '#FFFFFF' }, interior: { color: '#3E3E3E', pattern: 'Solid' } },
          { id: 'title', font: { bold: true, size: 14 }, alignment: { horizontal: 'Center' } },
          { id: 'excelDate', dataType: 'DateTime', numberFormat: { format: 'yyyy-mm-dd' } },
        ]}
      />
    </>
  );
}

// 피벗 차트: 피벗 모드 그리드 + 아래에 차트 (데이터·피벗 키가 바뀌면 차트도 갱신)
function PivotChartDemo({ p, ctx }) {
  const ref = useRef(null);
  const box = useRef(null);
  const chart = useRef(null);
  const make = api => {
    chart.current?.destroyChart();
    chart.current = api.createPivotChart({ chartType: p.type, chartContainer: box.current });
    ctx.log(`createPivotChart → ${chart.current?.chartId}`);
  };
  useEffect(() => () => chart.current?.destroyChart(), []);
  return (
    <>
      <Grid
        key={`${p.type}${p.pivotCol}`}
        gridRef={ref}
        height={240}
        rowData={SALES}
        enableCharts
        pivotMode
        columnDefs={[
          { field: 'region', headerName: '지역', rowGroup: true },
          { field: 'year', headerName: '연도', pivot: p.pivotCol === 'year' },
          { field: 'product', headerName: '제품', pivot: p.pivotCol === 'product' },
          { field: 'sales', headerName: '매출', aggFunc: 'sum' },
        ]}
        autoGroupColumnDef={{ minWidth: 140 }}
        onGridReady={e => make(e.api)}
        onFilterChanged={() => ctx.log('filterChanged → 차트 갱신')}
      />
      <div ref={box} style={{ height: 300, marginTop: 10 }} />
    </>
  );
}

// 크로스 필터 차트: 차트를 누르면 그리드가 걸러지고, 다른 차트도 같이 바뀜
function CrossFilterDemo({ p, ctx }) {
  const ref = useRef(null);
  const left = useRef(null);
  const right = useRef(null);
  const charts = useRef([]);
  const make = api => {
    charts.current.forEach(c => c?.destroyChart());
    charts.current = [
      api.createCrossFilterChart({ chartType: p.type, cellRange: { columns: ['dbms', 'rowCnt'] }, aggFunc: p.agg, chartContainer: left.current }),
      api.createCrossFilterChart({ chartType: 'pie', cellRange: { columns: ['status'] }, aggFunc: 'count', chartContainer: right.current }),
    ];
  };
  useEffect(() => () => charts.current.forEach(c => c?.destroyChart()), []);
  return (
    <>
      <div className="pg-split">
        <div ref={left} style={{ height: 280 }} />
        <div ref={right} style={{ height: 280 }} />
      </div>
      <Grid
        key={`${p.type}${p.agg}`}
        gridRef={ref}
        height={260}
        style={{ marginTop: 10 }}
        rowData={SAMPLE}
        columnDefs={BASE_COLUMNS.map(c => (c.field === 'dbms' || c.field === 'status' ? { ...c, filter: 'r2SetColumnFilter' } : c))}
        enableCharts
        onGridReady={e => make(e.api)}
        onFilterChanged={e => ctx.log(`filterChanged → ${JSON.stringify(e.api.getFilterModel())}`)}
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
    desc: '외부 라이브러리 없이 xlsx 를 직접 생성합니다. 그룹 헤더 병합, prepend/appendContent(mergeAcross), excelStyles(dataType 포함), rowHeight, addImageToCell(차트 이미지), 다중 시트, 틀 고정, 행 그룹 개요(접기), 엑셀 표, 인쇄 설정.',
    keywords: ['exportDataAsExcel', 'getDataAsExcel', 'getMultipleSheetsAsExcel', 'exportMultipleSheetsAsExcel', 'getSheetDataForExcel', 'excelStyles', 'prependContent', 'appendContent', 'mergeAcross', 'addImageToCell', 'rowHeight', 'sheetName', 'xlsx', 'freezeRows', 'freezeColumns', 'rowGroupExpandState', 'suppressRowOutline', 'exportAsExcelTable', 'dataType', 'DateTime', 'Formula', 'autoConvertFormulas', 'pageSetup', 'margins', 'headerFooterConfig'],
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
      {
        key: 'freeze',
        type: 'select',
        default: 'headers',
        label: 'freezeRows / freezeColumns',
        desc: "엑셀에서 스크롤해도 고정될 행·열. freezeRows: 'headers' 는 머리글(앞 내용 + 그룹 헤더 + 컬럼 헤더)까지, freezeColumns: 'pinned' 는 그리드에서 왼쪽 고정한 컬럼(여기선 ID)까지. 숫자도 됩니다.",
        options: [
          { value: 'none', label: '없음', desc: '고정 안 함' },
          { value: 'headers', label: "freezeRows: 'headers'", desc: '머리글 행 고정' },
          { value: 'both', label: "+ freezeColumns: 'pinned'", desc: '머리글 행 + 왼쪽 고정 컬럼' },
        ],
      },
      {
        key: 'group',
        type: 'select',
        default: 'none',
        label: 'rowGroupExpandState',
        desc: '행 그룹(여기선 DBMS)이 있을 때 엑셀 개요(왼쪽 +/− 버튼)로 묶습니다. 접힌 그룹의 하위 행도 모두 내보냅니다. suppressRowOutline: true 면 개요 없이 평평하게.',
        options: [
          { value: 'none', label: '그룹 없음', desc: '행 그룹 끔' },
          { value: 'expanded', desc: '모두 펼친 상태로' },
          { value: 'collapsed', desc: '모두 접힌 상태로 (그룹 행만 보임)' },
          { value: 'match', desc: '그리드에서 펼친 상태 그대로' },
        ],
      },
      {
        key: 'table',
        type: 'boolean',
        default: false,
        label: 'exportAsExcelTable',
        desc: '컬럼 헤더 행 ~ 마지막 데이터 행을 엑셀 "표"로 만듭니다 (필터 버튼·줄무늬 스타일). 위의 제목·그룹 헤더 행과 아래 합계 행은 표 밖에 남습니다. 헤더 이름이 겹치면 표 규칙상 뒤에 숫자를 붙입니다.',
        on: '엑셀 표 (필터 버튼)',
        off: '일반 범위',
      },
      {
        key: 'dates',
        type: 'boolean',
        default: true,
        label: "excelStyles dataType: 'DateTime'",
        desc: "수정일 컬럼에 dataType: 'DateTime' + numberFormat 스타일을 줍니다. 문자열 '2026-01-15' 가 엑셀 날짜 값으로 들어가 정렬·계산이 됩니다. 'Formula' 를 주면 '=' 로 시작하는 값이 수식으로 들어갑니다 (전체에 적용은 autoConvertFormulas).",
        on: '엑셀 날짜 형식 (yyyy-mm-dd)',
        off: '문자열 그대로',
      },
      {
        key: 'print',
        type: 'boolean',
        default: false,
        label: 'pageSetup · headerFooterConfig',
        desc: "인쇄 설정. pageSetup: { orientation, pageSize }, margins(인치), headerFooterConfig 로 머리글·바닥글 (&[Page] / &[Pages] 쪽 번호, &[Date] 날짜).",
        on: 'A4 가로 + 가운데 머리글 + 오른쪽 쪽 번호',
        off: '엑셀 기본 인쇄 설정',
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
  freezeRows: 'headers',          // 머리글 고정
  freezeColumns: 'pinned',        // 왼쪽 고정 컬럼까지
  rowGroupExpandState: 'collapsed', // 행 그룹 → 엑셀 개요(접힘)
  exportAsExcelTable: { name: 'Tasks' }, // 엑셀 표 (필터 버튼)
  pageSetup: { orientation: 'Landscape', pageSize: 'A4' },
  headerFooterConfig: { all: { footer: [{ value: '&[Page] / &[Pages]', position: 'Right' }] } },
});

// 날짜·수식 셀: excelStyles 의 dataType
// { id: 'excelDate', dataType: 'DateTime', numberFormat: { format: 'yyyy-mm-dd' } }  ← colDef.cellClass: 'excelDate'
// { id: 'formula', dataType: 'Formula' }  ← 값이 '=SUM(B2:B10)' 이면 수식으로`,
    usage: {
      file: 'assets/ExcelDownload.jsx',
      code: `gridRef.current.api.getChartImageDataURL({ chartId }).then(imageDataURL => {
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
    desc: 'enableCharts 후 범위를 선택해 우클릭 → 범위 차트, 또는 api.createRangeChart. 비숫자 첫 컬럼이 카테고리, 숫자 컬럼이 시리즈이며 데이터가 바뀌면 차트도 갱신됩니다. 차트 제목줄의 ⚙ 로 설정 패널을 열어 종류 · 데이터(가로축 항목, 계열 켜고 끄기) · 꾸미기(제목, 범례, 값 표시, 색, 축 제목)를 바꿉니다. PNG 저장 지원.',
    keywords: ['enableCharts', 'createRangeChart', 'chartType', 'groupedColumn', 'stackedColumn', 'normalizedColumn', 'groupedBar', 'line', 'area', 'pie', 'donut', 'chartContainer', 'getChartModels', 'getChartRef', 'updateChart', 'downloadChart', 'getChartImageDataURL', 'chartRange', 'onChartCreated', 'openChartToolPanel', 'closeChartToolPanel', 'chartThemeOverrides', 'chartOptions', 'suppressChartToolPanelsButton', 'onChartOptionsChanged'],
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

// 설정 패널 열기 / 꾸미기 코드로 바꾸기
api.openChartToolPanel({ chartId: chartRef.chartId, panel: 'format' }); // 'chart' | 'data' | 'format'
api.updateChart({
  chartId: chartRef.chartId,
  chartThemeOverrides: { common: { title: { text: '소유자별 행 수' }, legend: { position: 'top' } } },
  chartOptions: { labels: true, palette: 'ocean', yTitle: '행 수' },
});
chartRef.destroyChart();`,
  },
  {
    id: 'pivot-chart',
    category: CAT,
    name: '피벗 차트',
    desc: 'api.createPivotChart — 피벗 모드의 표시 행(행 그룹)이 항목, 피벗 결과 컬럼(피벗 값 × 값 컬럼)이 계열이 됩니다. 그룹을 펼치거나 피벗 컬럼·필터를 바꾸면 차트도 따라 바뀝니다. 피벗 모드에서 우클릭 › 피벗 차트 로도 만들 수 있습니다.',
    keywords: ['createPivotChart', 'pivotMode', 'pivot', 'enableCharts', 'chartContainer', 'pivotChart', 'getChartModels'],
    controls: [
      {
        key: 'pivotCol',
        type: 'select',
        default: 'year',
        label: '피벗 컬럼',
        desc: 'pivot: true 인 컬럼. 이 컬럼의 값마다 결과 컬럼이 생기고, 차트에서는 계열(색)이 됩니다.',
        options: [
          { value: 'year', label: '연도', desc: '2024 · 2025 두 계열' },
          { value: 'product', label: '제품', desc: '노트북 · 모니터 · 키보드 세 계열' },
        ],
      },
      {
        key: 'type',
        type: 'select',
        default: 'groupedColumn',
        label: 'chartType',
        desc: '피벗 차트 종류. 누적형은 지역별 합계 비교, 묶은형은 계열끼리 비교에 맞습니다.',
        options: [
          { value: 'groupedColumn', desc: '묶은 세로 막대' },
          { value: 'stackedColumn', desc: '누적 세로 막대 — 지역 합계 + 구성' },
          { value: 'normalizedColumn', desc: '100% 누적 — 구성 비율' },
          { value: 'line', desc: '꺾은선' },
        ],
      },
    ],
    render: (p, ctx) => <PivotChartDemo p={p} ctx={ctx} />,
    code: p => `<R2Grid
  enableCharts
  pivotMode
  columnDefs={[
    { field: 'region', rowGroup: true },
    { field: '${p.pivotCol}', pivot: true },
    { field: 'sales', aggFunc: 'sum' },
  ]}
  onGridReady={e => {
    chartRef = e.api.createPivotChart({
      chartType: '${p.type}',
      chartContainer: containerRef.current, // 없으면 떠 있는 창
    });
  }}
/>`,
  },
  {
    id: 'cross-filter-chart',
    category: CAT,
    name: '크로스 필터 차트',
    desc: 'api.createCrossFilterChart — 첫 컬럼 값별로 나머지 숫자 컬럼을 집계해 그립니다. 막대·조각을 누르면 그 값으로 그리드에 Set 필터가 걸리고, 같은 그리드의 다른 크로스 필터 차트도 걸러진 값으로 바뀝니다. 전체 값은 옅게, 걸러진 값은 진하게 표시됩니다.',
    keywords: ['createCrossFilterChart', 'crossFilter', 'aggFunc', 'cellRange', 'enableCharts', 'r2SetColumnFilter', 'chartContainer', 'filterChanged'],
    controls: [
      {
        key: 'type',
        type: 'select',
        default: 'groupedColumn',
        label: 'chartType',
        desc: '왼쪽 차트(DBMS별 행 수) 종류. 크로스 필터는 누적형을 지원하지 않습니다. 오른쪽은 상태별 개수 원형 차트로 고정.',
        options: [
          { value: 'groupedColumn', desc: '세로 막대' },
          { value: 'groupedBar', desc: '가로 막대' },
          { value: 'line', desc: '꺾은선 — 점을 눌러 필터' },
          { value: 'donut', desc: '도넛' },
        ],
      },
      {
        key: 'agg',
        type: 'select',
        default: 'sum',
        label: 'aggFunc',
        desc: '같은 카테고리 행들의 값을 합치는 방법. 값 컬럼 없이 카테고리만 주면 개수(count)를 셉니다.',
        options: [
          { value: 'sum', desc: '합계' },
          { value: 'avg', desc: '평균' },
          { value: 'count', desc: '행 개수' },
          { value: 'max', desc: '최댓값' },
        ],
      },
    ],
    render: (p, ctx) => <CrossFilterDemo p={p} ctx={ctx} />,
    code: p => `// 막대 클릭 = 그 값만, Ctrl/⌘+클릭 = 추가·제외, 선택된 하나를 다시 클릭 = 해제
api.createCrossFilterChart({
  chartType: '${p.type}',
  cellRange: { columns: ['dbms', 'rowCnt'] }, // [카테고리, 값...]
  aggFunc: '${p.agg}',
  chartContainer: leftRef.current,
});
api.createCrossFilterChart({
  chartType: 'pie',
  cellRange: { columns: ['status'] },          // 값 컬럼 없음 → 개수
  aggFunc: 'count',
  chartContainer: rightRef.current,
});`,
  },
];
