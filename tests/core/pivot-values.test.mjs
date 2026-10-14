// 피벗 결과 값을 직접 계산한 값과 비교 (피벗 키별 묶음 집계가 순서·값을 바꾸지 않는지)
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');

let seed = 3;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rows = Array.from({ length: 2000 }, (_, i) => ({ id: i, g: `G${Math.floor(rnd() * 7)}`, m: `M${Math.floor(rnd() * 5)}`, v: Math.round(rnd() * 100) }));

const make = aggFunc => {
  const c = new GridCore({
    rowData: rows,
    pivotMode: true,
    columnDefs: [
      { field: 'g', rowGroup: true },
      { field: 'm', pivot: true },
      { field: 'v', aggFunc },
    ],
  });
  c.setViewportSize(1200, 600);
  return c;
};
const expected = fn => {
  const out = {};
  for (const r of rows) ((out[r.g] ||= {})[r.m] ||= []).push(r.v);
  return Object.fromEntries(Object.entries(out).map(([g, ms]) => [g, Object.fromEntries(Object.entries(ms).map(([m, vs]) => [m, fn(vs)]))]));
};
const actual = c => {
  const res = {};
  for (const n of c.displayedNodes) {
    if (!n.group) continue;
    const ms = {};
    for (const col of c.pivotResultColumns) {
      const v = c.getCellValue(n, col);
      if (v != null) ms[col.colDef.pivotKeys[0]] = v;
    }
    res[n.key] = ms;
  }
  return res;
};
const sortObj = o =>
  JSON.parse(JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v)));

check('피벗 sum = 직접 계산', sortObj(actual(make('sum'))), sortObj(expected(vs => vs.reduce((a, b) => a + b, 0))));
check('피벗 first = 원래 순서의 첫 값', sortObj(actual(make('first'))), sortObj(expected(vs => vs[0])));
check('피벗 last = 원래 순서의 마지막 값', sortObj(actual(make('last'))), sortObj(expected(vs => vs[vs.length - 1])));
check('피벗 count', sortObj(actual(make('count'))), sortObj(expected(vs => vs.length)));
