import React, { useMemo, useState } from 'react';
import { moonTheme } from '../../grid/index.js';
import { BASE_COLUMNS, makeRows, SAMPLE } from '../data.js';
import { Grid, IMPORT_LINE, jsxProps } from './_shared.jsx';

const CAT = '시작하기';

function QuickStart({ p, ctx }) {
  const rowData = useMemo(() => makeRows(p.rows), [p.rows]);
  return (
    <Grid
      rowData={rowData}
      columnDefs={BASE_COLUMNS}
      defaultColDef={{ flex: p.flex ? 1 : undefined, minWidth: 90, filter: p.filter, sortable: true, resizable: true }}
      onGridReady={() => ctx.log('gridReady')}
      onRowClicked={e => ctx.log(`rowClicked: ${e.data.taskName}`)}
      onSortChanged={e => ctx.log(`sortChanged: ${JSON.stringify(e.api.getColumnState().filter(s => s.sort).map(s => s.colId + ':' + s.sort))}`)}
    />
  );
}

function Theme({ p }) {
  const theme = useMemo(
    () =>
      moonTheme.withParams({
        accentColor: p.accentColor || undefined,
        fontSize: p.fontSize,
        spacing: p.spacing,
        headerBackgroundColor: p.headerBg || undefined,
      }),
    [p.accentColor, p.fontSize, p.spacing, p.headerBg],
  );
  return (
    <div data-r2-theme-mode={p.dark ? 'dark' : undefined} style={{ padding: p.dark ? 8 : 0, background: p.dark ? '#181818' : undefined, borderRadius: 8 }}>
      <Grid
        theme={theme}
        rowData={SAMPLE.slice(0, 50)}
        columnDefs={BASE_COLUMNS}
        rowHeight={p.rowHeight}
        headerHeight={p.headerHeight}
        rowSelection={{ mode: 'multiRow' }}
        cellSelection
      />
    </div>
  );
}

const KO = {
  page: '쪽',
  of: '/',
  to: '~',
  noRowsToShow: '조회된 데이터가 없습니다',
};
function Locale({ p }) {
  return (
    <Grid
      rowData={p.empty ? [] : SAMPLE.slice(0, 60)}
      columnDefs={BASE_COLUMNS}
      defaultColDef={{ flex: 1, minWidth: 100, filter: true }}
      pagination
      paginationPageSize={20}
      localeText={p.custom ? KO : undefined}
    />
  );
}

export default [
  {
    id: 'quick-start',
    category: CAT,
    name: '기본 그리드',
    desc: 'columnDefs + rowData 만으로 동작합니다. defaultColDef 로 공통 컬럼 속성을 지정하고, 이벤트는 on<이벤트명> prop 으로 받습니다.',
    keywords: ['R2Grid', 'columnDefs', 'rowData', 'defaultColDef', 'onGridReady', 'onRowClicked', 'flex', 'sortable', 'resizable'],
    controls: [
      {
        key: 'rows',
        type: 'select',
        default: 1000,
        label: '행 개수',
        desc: '데모용 rowData 길이. 화면에 보이는 행만 그리므로(가상화) 개수가 늘어도 스크롤 성능은 같습니다.',
        options: [
          { value: 20, desc: '스크롤 없이 한 화면' },
          { value: 1000, desc: '일반 목록 규모' },
          { value: 10000, desc: '대량 — 정렬·필터 속도 확인용' },
        ],
      },
      {
        key: 'flex',
        type: 'boolean',
        default: true,
        label: 'defaultColDef.flex',
        desc: '모든 컬럼에 flex: 1 을 줍니다. flex 컬럼은 width 대신 남는 폭을 비율로 나눠 갖고, 그리드 폭이 바뀌면 다시 계산됩니다.',
        on: '그리드 폭을 컬럼들이 꽉 채움 (minWidth 90 보다 좁아지지 않음)',
        off: '각 컬럼의 width 를 그대로 사용 — 남는 폭은 비고, 넘치면 가로 스크롤',
      },
      {
        key: 'filter',
        type: 'boolean',
        default: true,
        label: 'defaultColDef.filter',
        desc: '모든 컬럼에 기본 필터를 켭니다. 헤더 메뉴(≡)에 필터 탭이 생기고, 필터가 걸린 컬럼은 헤더에 필터 아이콘이 표시됩니다.',
        on: '헤더 메뉴에서 컬럼 값으로 거르기 가능',
        off: '필터 UI 없음 (api.setFilterModel 로도 걸 수 없음)',
      },
    ],
    render: (p, ctx) => <QuickStart p={p} ctx={ctx} />,
    code: p => `${IMPORT_LINE}

const columnDefs = [
  { field: 'id', headerName: 'ID', width: 80 },
  { field: 'taskName', headerName: '작업명' },
  { field: 'rowCnt', headerName: '행 수', type: 'numericColumn',
    valueFormatter: p => p.value?.toLocaleString() },
];

export default function Page() {
  const rowData = useMemo(() => makeRows(${p.rows}), []);
  return (
    <div style={{ height: 360 }}>
      <R2Grid
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={{ ${p.flex ? 'flex: 1, ' : ''}minWidth: 90, filter: ${p.filter}, sortable: true }}
        onRowClicked={e => console.log(e.data)}
      />
    </div>
  );
}`,
    usage: {
      file: 'components/PageTemplate/Table.jsx',
      code: `<R2Grid
  {...props}
  gridOptions={mergedGridOptions}
  columnDefs={processedColDefs}
  localeText={R2_GRID_LOCALE_KR}
  onColumnVisible={saveVisibleColumnsToCookie}
  ref={ref}
  defaultColDef={defaultColDef}
  columnMenu="legacy"
  ...
/>`,
    },
  },
  {
    id: 'theme',
    category: CAT,
    name: '테마 · 다크 모드',
    desc: 'moonTheme.withParams 로 색/크기를 바꾸고, 조상 요소의 data-r2-theme-mode="dark" 로 다크 스킴을 켭니다. provideGlobalGridOptions 로 전역 테마를 지정할 수 있습니다.',
    keywords: ['theme', 'moonTheme', 'withParams', 'accentColor', 'data-r2-theme-mode', 'dark', 'provideGlobalGridOptions', 'rowHeight', 'headerHeight', 'colorSchemeDark'],
    controls: [
      {
        key: 'dark',
        type: 'boolean',
        default: false,
        label: 'data-r2-theme-mode',
        desc: '그리드 조상 요소에 data-r2-theme-mode="dark" 를 붙이면 그 아래 그리드가 다크 색으로 바뀝니다. 여기선 데모 영역만, 페이지 전체는 왼쪽 위 ☾.',
        on: '이 데모 영역만 다크',
        off: '라이트 (부모 페이지 설정을 따름)',
      },
      {
        key: 'accentColor',
        type: 'text',
        default: '#fb5b5b',
        label: 'accentColor',
        desc: '테마 강조색. 선택 행 배경, 포커스 테두리, 체크박스, 셀 범위 선택, 정렬 아이콘 등 강조 요소 전부에 쓰입니다. CSS 색 값(#hex, rgb()) 입력.',
      },
      {
        key: 'headerBg',
        type: 'text',
        default: '',
        label: 'headerBackgroundColor',
        desc: '헤더 행 배경색. 비우면 테마 기본(배경색에 아주 옅은 회색).',
      },
      { key: 'fontSize', type: 'number', default: 13, label: 'fontSize', desc: '셀·헤더 글자 크기(px). 행 높이는 따로 지정하지 않으면 글자 크기와 spacing 으로 계산됩니다.' },
      { key: 'spacing', type: 'number', default: 8, label: 'spacing', desc: '간격 기준값(px). 셀 좌우 패딩, 아이콘 사이, 메뉴 여백 등이 이 값의 배수로 정해집니다. 키우면 전체가 성기게 됩니다.' },
      { key: 'rowHeight', type: 'number', default: 32, label: 'rowHeight', desc: '모든 행의 높이(px). 테마 계산값보다 우선합니다. 행마다 다르게 하려면 getRowHeight.' },
      { key: 'headerHeight', type: 'number', default: 36, label: 'headerHeight', desc: '컬럼 헤더 행 높이(px). 그룹 헤더 행은 groupHeaderHeight 로 따로 지정.' },
    ],
    render: p => <Theme p={p} />,
    code: p => `import { moonTheme } from 'r2grid';

const myTheme = moonTheme.withParams({
  accentColor: '${p.accentColor}',${p.headerBg ? `\n  headerBackgroundColor: '${p.headerBg}',` : ''}
  fontSize: ${p.fontSize},
  spacing: ${p.spacing},
});

// 다크: 조상 요소에 data-r2-theme-mode="dark"
<div data-r2-theme-mode=${p.dark ? '"dark"' : '{undefined}'}>
  <R2Grid
    theme={myTheme}
${jsxProps([
  ['rowHeight', p.rowHeight],
  ['headerHeight', p.headerHeight],
])}
    rowData={rowData}
    columnDefs={columnDefs}
  />
</div>`,
    usage: {
      file: 'assets/theme.jsx',
      code: `const applyThemeAttr = dark => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  // R2grid Theming API: 조상 요소의 data-r2-theme-mode 로 다크 스킴 전환
  if (dark) root.setAttribute('data-r2-theme-mode', 'dark');
  else root.removeAttribute('data-r2-theme-mode');
};`,
    },
  },
  {
    id: 'locale',
    category: CAT,
    name: '로케일 (한국어)',
    desc: '기본 문구는 한국어입니다. localeText 로 일부 키만 덮어쓸 수 있고 getLocaleText 콜백도 지원합니다.',
    keywords: ['localeText', 'R2_GRID_LOCALE_KR', 'getLocaleText', 'noRowsToShow', '한국어'],
    controls: [
      {
        key: 'custom',
        type: 'boolean',
        default: true,
        label: 'localeText',
        desc: '키별 문구를 덮어씁니다. 준 키만 바뀌고 나머지는 기본 한국어(R2_GRID_LOCALE_KR). 여기선 page·of·to·noRowsToShow 를 바꿉니다 — 아래 페이지 표시줄 확인.',
        on: "페이지 표시줄 '쪽', 빈 데이터 '조회된 데이터가 없습니다'",
        off: "기본 문구 '페이지', '표시할 행이 없습니다'",
      },
      {
        key: 'empty',
        type: 'boolean',
        default: false,
        label: '빈 데이터',
        desc: 'rowData 를 빈 배열로 바꿔 noRowsToShow 오버레이 문구를 보여줍니다.',
        on: '행 0개 — 가운데 안내 문구 표시',
        off: '샘플 60행',
      },
    ],
    render: p => <Locale p={p} />,
    code: p => `import { R2_GRID_LOCALE_KR } from 'r2grid';

<R2Grid
  localeText={${p.custom ? `{ ...R2_GRID_LOCALE_KR, page: '쪽', noRowsToShow: '조회된 데이터가 없습니다' }` : 'R2_GRID_LOCALE_KR'}}
  pagination
  paginationPageSize={20}
  rowData={${p.empty ? '[]' : 'rowData'}}
  columnDefs={columnDefs}
/>`,
    usage: { file: 'components/PageTemplate/Table.jsx', code: `import { R2Grid, R2_GRID_LOCALE_KR } from 'r2grid';\n...\nlocaleText={R2_GRID_LOCALE_KR}` },
  },
];
