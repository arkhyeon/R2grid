// R2grid 진입점 — ag-grid-react / ag-grid-community / ag-grid-enterprise 와 같은 이름으로 export.
// CLM30 교체 시 Vite alias 로 'ag-grid-react', 'ag-grid-community', 'ag-grid-enterprise' 를 이 파일로 연결한다.
export { AgGridReact } from './react/AgGridReact.jsx';
export { useGridCellEditor } from './react/editors.jsx';
export { useGridFilter } from './react/filters.jsx';
export { GridCore } from './core/GridCore.js';
export { RowNode } from './core/RowNode.js';
export { Column, ColumnGroup } from './core/Column.js';
export { AG_GRID_LOCALE_KR } from './core/locale.js';
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
