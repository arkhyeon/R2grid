// GridCore 와 기능 파일들이 같이 쓰는 상수·작은 헬퍼
export const DEFAULT_ROW_HEIGHT = 42;
export const DEFAULT_HEADER_HEIGHT = 48;
export const DEFAULT_DETAIL_ROW_HEIGHT = 300;

export const BUILTIN_COLUMN_TYPES = {
  numericColumn: { headerClass: 'r2-right-aligned-header', cellClass: 'r2-right-aligned-cell' },
  rightAligned: { headerClass: 'r2-right-aligned-header', cellClass: 'r2-right-aligned-cell' },
};

export const COL_DEF_EVENTS = new Set(['cellClicked', 'cellDoubleClicked', 'cellContextMenu', 'cellValueChanged']);

export function camelToHuman(field) {
  if (!field) return '';
  const last = String(field).split('.').pop();
  return last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

export function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}
