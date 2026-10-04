// R2grid 진입점 — ag-grid-react / ag-grid-community / ag-grid-enterprise 와 같은 이름으로 export.
// CLM30 교체 시 Vite alias 로 'ag-grid-react', 'ag-grid-community', 'ag-grid-enterprise' 를 이 파일로 연결한다.
//
// R2 이름(점진 전환용): 아래 별칭과 AG 이름 둘 다 동작한다.
//  - 컴포넌트: R2Grid (= AgGridReact)            - 로케일: R2_GRID_LOCALE_KR (= AG_GRID_LOCALE_KR)
//  - 내장 이름: r2TextColumnFilter, r2SelectCellEditor, r2GroupCellRenderer, r2ColumnsToolPanel,
//    r2TotalRowCountComponent ... (ag 접두 → r2 접두 어디서나)
//  - colId: r2-Grid-SelectionColumn / r2-Grid-RowNumbersColumn / r2-Grid-AutoColumn 으로 조회 가능
//    (api.getColumn 등 — 실제 colId 값은 AG 와 같은 ag-Grid-* 유지: 저장된 컬럼 상태·쿠키 호환)
export { AgGridReact, AgGridReact as R2Grid } from './react/AgGridReact.jsx';
export { useGridCellEditor } from './react/editors.jsx';
export { useGridFilter } from './react/filters.jsx';
export { GridCore } from './core/GridCore.js';
export { RowNode } from './core/RowNode.js';
export { Column, ColumnGroup } from './core/Column.js';
export { AG_GRID_LOCALE_KR, AG_GRID_LOCALE_KR as R2_GRID_LOCALE_KR } from './core/locale.js';
export {
  provideGlobalGridOptions,
  getGlobalGridOptions,
  ModuleRegistry,
  LicenseManager,
  GRID_VERSION,
} from './core/globals.js';
export {
  themeQuartz,
  themeAlpine,
  themeBalham,
  themeMaterial,
  createTheme,
  createPart,
  colorSchemeLight,
  colorSchemeLightWarm,
  colorSchemeLightCold,
  colorSchemeDark,
  colorSchemeDarkWarm,
  colorSchemeDarkBlue,
  colorSchemeVariable,
  iconSetQuartz,
  iconSetQuartzLight,
  iconSetQuartzBold,
  iconSetQuartzRegular,
  iconSetAlpine,
  iconSetMaterial,
  checkboxStyleDefault,
  inputStyleBase,
  inputStyleBordered,
  tabStyleQuartz,
} from './core/theme.js';
export * from './modules.js';
