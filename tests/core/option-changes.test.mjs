// 실행 중 옵션 변경이 화면(행 모델)에 반영되는지
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');

const rows = () => [
  { g: 'A', v: 1, n: 'b' },
  { g: 'A', v: 2, n: 'a' },
  { g: 'B', v: 10, n: 'c' },
];
const mk = o => {
  const c = new GridCore({
    rowData: rows(),
    columnDefs: [{ field: 'g', rowGroup: true, hide: true }, { field: 'v', aggFunc: 'sum' }, { field: 'n' }],
    groupDefaultExpanded: -1,
    ...o,
  });
  c.setViewportSize(800, 400);
  return c;
};
const shown = c => c.displayedNodes.map(n => (n.group ? `G:${n.key}` : n.data.n));

const a = mk({});
a.api.setGridOption('groupHideOpenParents', true);
check('groupHideOpenParents 켜기 → 펼친 그룹 행 숨김', shown(a), ['b', 'a', 'c']);

const b = mk({});
b.api.setGridOption('aggFuncs', { sum: ({ values }) => values.length });
check(
  'aggFuncs 바꾸기 → 다시 집계',
  b.groupTop.map(n => n.aggData.v),
  [2, 1],
);

const c = mk({});
c.api.setGridOption('grandTotalRow', 'bottom');
check('grandTotalRow 켜기', shown(c).at(-1), 'G:null');

const d = mk({ quickFilterText: 'zzz' });
check('빠른 검색 적용', d.api.getDisplayedRowCount(), 0);
d.api.setGridOption('alwaysPassFilter', n => n.data?.n === 'c');
check('alwaysPassFilter 바꾸기 → 다시 거름', shown(d), ['G:B', 'c']);

const e = new GridCore({ rowData: [{ s: 'b' }, { s: 'A' }, { s: 'a' }], columnDefs: [{ field: 's', sort: 'asc' }] });
e.setViewportSize(800, 400);
const before = e.displayedNodes.map(n => n.data.s);
e.api.setGridOption('accentedSort', true);
check(
  'accentedSort 바꾸기 → 다시 정렬',
  [before, e.displayedNodes.map(n => n.data.s)],
  [
    ['A', 'a', 'b'],
    ['a', 'A', 'b'],
  ],
);
