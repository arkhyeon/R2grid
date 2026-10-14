// 옵션 이름 목록(optionNames.js)이 소스와 맞는지 + 개발 모드 옵션 이름 검사 동작
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { check } from '../check.mjs';
const { GRID_OPTION_NAMES, COL_DEF_NAMES } = await import('../../src/grid/core/optionNames.js');
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const { resetOptionCheckWarnings } = await import('../../src/grid/core/optionCheck.js');

const root = new URL('../../src/grid/', import.meta.url);
const files = [];
const walk = dir => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
  }
};
walk(root.pathname.replace(/^\/([A-Z]:)/, '$1'));
const src = files.map(f => readFileSync(f, 'utf-8')).join('\n');

const grid = new Set(GRID_OPTION_NAMES);
const col = new Set(COL_DEF_NAMES);
const readGrid = new Set([...src.matchAll(/\b(?:gos|this\.gos|core\.gos)\??\.([a-zA-Z_$][\w$]*)/g)].map(m => m[1]));
const events = new Set([...src.matchAll(/dispatch\(\s*'([a-zA-Z]+)'/g)].map(m => 'on' + m[1][0].toUpperCase() + m[1].slice(1)));
const readCol = new Set([...src.matchAll(/\b(?:colDef|cd|colGroupDef)\??\.([a-zA-Z_$][\w$]*)/g)].map(m => m[1]));
const ignore = new Set(['call', 'apply', 'bind', 'length']);
check(
  '소스에서 읽는 그리드 옵션이 목록에 다 있음',
  [...readGrid].filter(n => !grid.has(n) && !ignore.has(n)),
  [],
);
check(
  '내보내는 이벤트(onX)가 목록에 다 있음',
  [...events].filter(n => !grid.has(n)),
  [],
);
check(
  '소스에서 읽는 컬럼 옵션이 목록에 다 있음',
  [...readCol].filter(n => !col.has(n) && !ignore.has(n)),
  [],
);

// 경고 동작 (debug 로 켬)
const warns = [];
console.debug = () => {};
const orig = console.warn;
console.warn = m => warns.push(m);
resetOptionCheckWarnings();
const c = new GridCore({
  debug: true,
  rowData: [],
  rowSelecton: { mode: 'multiRow' },
  columnDefs: [
    { field: 'a', sortabel: true, headerName: 'A' },
    { headerName: 'G', children: [{ field: 'b' }] },
  ],
});
c.api.setGridOption('paginationPageSzie', 10);
c.api.setGridOption('pagination', true);
console.warn = orig;
const short = warns.map(w => w.replace(/^\[R2grid\] /, '').replace(/ \(이 경고 끄기.*$/, ''));
check('오타 경고 + 제안', short, [
  "알 수 없는 그리드 옵션 'rowSelecton' — 'rowSelection' 를 쓰려던 건가요?",
  "알 수 없는 컬럼 옵션 'sortabel' — 'sortable' 를 쓰려던 건가요?",
  "알 수 없는 그리드 옵션 'paginationPageSzie' — 'paginationPageSize' 를 쓰려던 건가요?",
]);
const w2 = [];
console.warn = m => w2.push(m);
resetOptionCheckWarnings();
new GridCore({ debug: true, suppressPropertyNamesCheck: true, rowData: [], foo: 1, columnDefs: [{ field: 'a', bar: 1 }] });
new GridCore({ rowData: [], foo: 1, columnDefs: [] });
console.warn = orig;
check('suppressPropertyNamesCheck · 개발 모드 아님 → 경고 없음', w2, []);
