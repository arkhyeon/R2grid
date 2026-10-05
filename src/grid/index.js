// R2grid 진입점 (패키지명 r2grid)
//  - 컴포넌트 R2Grid, 로케일 R2_GRID_LOCALE_KR, 테마 r2Theme
//  - 내장 이름: r2TextColumnFilter, r2SelectCellEditor, r2GroupCellRenderer, r2ColumnsToolPanel, r2TotalRowCountComponent …
//  - 자동 컬럼 colId: r2-Grid-SelectionColumn / r2-Grid-RowNumbersColumn / r2-Grid-AutoColumn
//
// 호환: AG-Grid 이름(AgGridReact, agTextColumnFilter, ag-Grid-*, AG_GRID_LOCALE_KR, themeQuartz,
//       ModuleRegistry·LicenseManager·*Module)도 그대로 받는다 — 옛 코드 이식용. 새 코드는 R2 이름을 쓴다.
import { R2Grid } from './react/R2Grid.jsx';
import { R2_GRID_LOCALE_KR } from './core/locale.js';
import { themeQuartz } from './core/theme.js';

export { R2Grid, R2_GRID_LOCALE_KR };
export const r2Theme = themeQuartz;
export { useGridCellEditor } from './react/editors.jsx';
export { useGridFilter } from './react/filters.jsx';
export { GridCore } from './core/GridCore.js';
export { RowNode } from './core/RowNode.js';
export { Column, ColumnGroup } from './core/Column.js';
export { provideGlobalGridOptions, getGlobalGridOptions, GRID_VERSION } from './core/globals.js';
export {
  createTheme,
  createPart,
  colorSchemeLight,
  colorSchemeLightWarm,
  colorSchemeLightCold,
  colorSchemeDark,
  colorSchemeDarkWarm,
  colorSchemeDarkBlue,
  colorSchemeVariable,
  checkboxStyleDefault,
  inputStyleBase,
  inputStyleBordered,
} from './core/theme.js';

// ── AG-Grid 호환 이름 (이식용) ──
export const AgGridReact = R2Grid;
export const AG_GRID_LOCALE_KR = R2_GRID_LOCALE_KR;
export {
  themeQuartz,
  themeAlpine,
  themeBalham,
  themeMaterial,
  iconSetQuartz,
  iconSetQuartzLight,
  iconSetQuartzBold,
  iconSetQuartzRegular,
  iconSetAlpine,
  iconSetMaterial,
  tabStyleQuartz,
} from './core/theme.js';
export { ModuleRegistry, LicenseManager } from './core/globals.js';
export * from './modules.js';
