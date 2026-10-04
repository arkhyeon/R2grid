import React, { useMemo, useState } from 'react';
import { themeQuartz } from '../../grid/index.js';
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
      themeQuartz.withParams({
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

function Migration() {
  return (
    <div className="pg-doc">
      <p>
        CLM30 코드는 그대로 두고 <b>vite alias</b> 로 <code>ag-grid-react</code> · <code>ag-grid-community</code> · <code>ag-grid-enterprise</code> ·{' '}
        <code>@ag-grid-community/locale</code> import 를 R2grid 로 연결합니다. props / gridOptions / GridApi / 이벤트 이름은 AG-Grid v34 와 동일합니다.
      </p>
      <table>
        <tbody>
          <tr>
            <th>바뀌는 것</th>
            <td>
              CSS 클래스 접두사 <code>ag-</code> → <code>r2-</code>, CSS 변수 <code>--ag-*</code> → <code>--r2-*</code>, 다크모드 속성 <code>data-ag-theme-mode</code> → <code>data-r2-theme-mode</code>
            </td>
          </tr>
          <tr>
            <th>그대로인 것</th>
            <td>
              컴포넌트/함수 이름(<code>AgGridReact</code>, <code>themeQuartz</code>, <code>AG_GRID_LOCALE_KR</code>…), 내장 컴포넌트 이름(<code>agTextColumnFilter</code>…), 자동 컬럼 id(<code>ag-Grid-SelectionColumn</code>…), 모든 api 메서드
            </td>
          </tr>
          <tr>
            <th>라이선스</th>
            <td>
              <code>LicenseManager.setLicenseKey</code> / <code>ModuleRegistry.registerModules</code> 는 호환용 빈 함수 — 엔터프라이즈 키 불필요 <span className="pg-badge-ok">✓</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default [
  {
    id: 'quick-start',
    category: CAT,
    name: '기본 그리드',
    desc: 'columnDefs + rowData 만으로 동작합니다. defaultColDef 로 공통 컬럼 속성을 지정하고, 이벤트는 on<이벤트명> prop 으로 받습니다.',
    keywords: ['AgGridReact', 'columnDefs', 'rowData', 'defaultColDef', 'onGridReady', 'onRowClicked', 'flex', 'sortable', 'resizable'],
    controls: [
      { key: 'rows', type: 'select', options: [20, 1000, 10000], default: 1000, desc: '행 개수' },
      { key: 'flex', type: 'boolean', default: true, desc: 'defaultColDef.flex — 남는 폭을 비율로 채움' },
      { key: 'filter', type: 'boolean', default: true, desc: 'defaultColDef.filter — 컬럼 필터 사용' },
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
      <AgGridReact
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
      code: `<AgGridReact
  {...props}
  gridOptions={mergedGridOptions}
  columnDefs={processedColDefs}
  localeText={AG_GRID_LOCALE_KR}
  onColumnVisible={saveVisibleColumnsToCookie}
  ref={ref}
  defaultColDef={defaultColDef}
  columnMenu="legacy"
  ...
/>`,
    },
  },
  {
    id: 'migration',
    category: CAT,
    name: 'AG-Grid → R2grid 교체',
    desc: '기존 코드의 import 경로를 바꾸지 않고 번들러 alias 만으로 교체합니다.',
    keywords: ['alias', 'vite', 'ag-grid-react', 'ag-grid-community', 'ag-grid-enterprise', 'LicenseManager', 'ModuleRegistry', 'AllEnterpriseModule', 'r2-', 'data-r2-theme-mode'],
    controls: [],
    render: () => <Migration />,
    code: () => `// vite.config.mjs (CLM30 feature/clm-datagrid 브랜치)
const DATAGRID =
  process.env.R2GRID_PATH ||
  ['../r2grid/src/grid', '../clm-datagrid/src/grid']
    .map(p => path.resolve(__dirname, p))
    .find(p => fs.existsSync(p));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^(ag-grid-(react|community|enterprise)|@ag-grid-community\\/locale)$/,
        replacement: \`\${DATAGRID}/index.js\` },
    ],
    dedupe: ['react', 'react-dom'], // React 2벌 방지
  },
  cacheDir: 'node_modules/.vite-datagrid',
});`,
    usage: {
      file: 'main.jsx',
      code: `import { AllEnterpriseModule, LicenseManager, ModuleRegistry, provideGlobalGridOptions, themeQuartz } from 'ag-grid-enterprise';

LicenseManager.setLicenseKey(
  'Using_this_{AG_Grid}_Enterprise_key_...',   // (키 생략) R2grid 에서는 호환용 빈 함수
);
ModuleRegistry.registerModules([AllEnterpriseModule]);
const gridTheme = themeQuartz.withParams({ accentColor: '#4db8ff' }, 'dark');
provideGlobalGridOptions({ theme: gridTheme });`,
    },
  },
  {
    id: 'theme',
    category: CAT,
    name: '테마 · 다크 모드',
    desc: 'themeQuartz.withParams 로 색/크기를 바꾸고, 조상 요소의 data-r2-theme-mode="dark" 로 다크 스킴을 켭니다. provideGlobalGridOptions 로 전역 테마를 지정할 수 있습니다.',
    keywords: ['theme', 'themeQuartz', 'withParams', 'accentColor', 'data-r2-theme-mode', 'dark', 'provideGlobalGridOptions', 'rowHeight', 'headerHeight', 'colorSchemeDark'],
    controls: [
      { key: 'dark', type: 'boolean', default: false, desc: '이 그리드 영역만 다크 (페이지 다크는 왼쪽 위 ☾)' },
      { key: 'accentColor', type: 'text', default: '#fb5b5b', desc: '강조색 (선택/포커스/체크박스)' },
      { key: 'headerBg', type: 'text', default: '', desc: 'headerBackgroundColor' },
      { key: 'fontSize', type: 'number', default: 13, desc: '글자 크기(px)' },
      { key: 'spacing', type: 'number', default: 8, desc: '기본 간격(px) — 패딩/아이콘 간격의 기준' },
      { key: 'rowHeight', type: 'number', default: 32 },
      { key: 'headerHeight', type: 'number', default: 36 },
    ],
    render: p => <Theme p={p} />,
    code: p => `import { themeQuartz } from 'ag-grid-community';

const myTheme = themeQuartz.withParams({
  accentColor: '${p.accentColor}',${p.headerBg ? `\n  headerBackgroundColor: '${p.headerBg}',` : ''}
  fontSize: ${p.fontSize},
  spacing: ${p.spacing},
});

// 다크: 조상 요소에 data-r2-theme-mode="dark"
<div data-r2-theme-mode=${p.dark ? '"dark"' : '{undefined}'}>
  <AgGridReact
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
  // ag-grid 34 Theming API: 조상 요소의 data-r2-theme-mode 로 다크 스킴 전환
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
    keywords: ['localeText', 'AG_GRID_LOCALE_KR', 'getLocaleText', 'noRowsToShow', '@ag-grid-community/locale'],
    controls: [
      { key: 'custom', type: 'boolean', default: true, desc: '일부 문구 덮어쓰기' },
      { key: 'empty', type: 'boolean', default: false, desc: '빈 데이터 (noRowsToShow 문구 확인)' },
    ],
    render: p => <Locale p={p} />,
    code: p => `import { AG_GRID_LOCALE_KR } from '@ag-grid-community/locale';

<AgGridReact
  localeText={${p.custom ? `{ ...AG_GRID_LOCALE_KR, page: '쪽', noRowsToShow: '조회된 데이터가 없습니다' }` : 'AG_GRID_LOCALE_KR'}}
  pagination
  paginationPageSize={20}
  rowData={${p.empty ? '[]' : 'rowData'}}
  columnDefs={columnDefs}
/>`,
    usage: { file: 'components/PageTemplate/Table.jsx', code: `import { AG_GRID_LOCALE_KR } from '@ag-grid-community/locale';\n...\nlocaleText={AG_GRID_LOCALE_KR}` },
  },
];
