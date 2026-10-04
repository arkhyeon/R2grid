// 스토리 공용 헬퍼
import React from 'react';
import { AgGridReact } from '../../grid/index.js';

export { AgGridReact };

// 높이 있는 컨테이너 + 그리드 (그리드는 부모 높이를 채움)
export function Grid({ height = 360, gridRef, style, ...props }) {
  return (
    <div style={{ height, ...style }}>
      <AgGridReact ref={gridRef} {...props} />
    </div>
  );
}

// 코드 스니펫용: JS 값 → 소스 표기
export function lit(v) {
  if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
  if (Array.isArray(v)) return `[${v.map(lit).join(', ')}]`;
  if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${lit(x)}`).join(', ')} }`;
  return String(v);
}

// JSX prop 한 줄: boolean true → 이름만, 문자열 → ="..", 그 외 → {..}
export function jsxProp(name, v) {
  if (v === undefined || v === null || v === false) return null;
  if (v === true) return name;
  if (typeof v === 'string') return `${name}="${v}"`;
  return `${name}={${lit(v)}}`;
}

export function jsxProps(entries, indent = '      ') {
  return entries
    .map(([k, v]) => jsxProp(k, v))
    .filter(Boolean)
    .map(s => `${indent}${s}`)
    .join('\n');
}

export const IMPORT_LINE = `import { AgGridReact } from 'ag-grid-react'; // R2grid: alias 로 같은 이름 사용`;
