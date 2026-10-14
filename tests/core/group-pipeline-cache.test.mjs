// 그룹 파이프라인 재사용(펼침·정렬만 바뀌면 필터·집계·정렬 결과 재사용)이 틀린 결과를 내지 않는지
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');

const rows = () => [
  { id: 1, g: 'A', v: 3 },
  { id: 2, g: 'A', v: 1 },
  { id: 3, g: 'B', v: 10 },
  { id: 4, g: 'B', v: 5 },
];
const mk = o => {
  const c = new GridCore({
    rowData: rows(),
    getRowId: p => String(p.data.id),
    columnDefs: [
      { field: 'g', rowGroup: true, hide: true },
      { field: 'v', aggFunc: 'sum', editable: true },
    ],
    ...o,
  });
  c.setViewportSize(800, 400);
  return c;
};
const view = c => c.displayedNodes.map(n => (n.group ? `${n.key}=${n.aggData?.v}` : n.data.v));

const a = mk({});
a.api.expandAll();
check('펼치기: 집계 그대로', view(a), ['A=4', 3, 1, 'B=15', 10, 5]);
a.api.collapseAll();
a.api.getRowNode('2').setDataValue('v', 100);
a.api.expandAll();
check('값 편집 후 펼치기: 새 집계', view(a), ['A=103', 3, 100, 'B=15', 10, 5]);

const b = mk({ groupDefaultExpanded: -1 });
b.api.applyColumnState({ state: [{ colId: 'v', sort: 'asc' }] });
check('정렬 asc (그룹도 집계값 순)', view(b), ['A=4', 1, 3, 'B=15', 5, 10]);
b.api.getDisplayedRowAtIndex(0).setExpanded(false);
b.api.getDisplayedRowAtIndex(0).setExpanded(true);
check('정렬 상태에서 접었다 펼치기: 순서 유지', view(b), ['A=4', 1, 3, 'B=15', 5, 10]);
b.setColumnSort(b.getColumn('v'), 'desc', false, 'api');
check('정렬 방향 바꾸기: 다시 정렬', view(b), ['B=15', 10, 5, 'A=4', 3, 1]);

const c = mk({ groupDefaultExpanded: -1 });
c.api.applyTransaction({ update: [{ id: 3, g: 'B', v: 0 }] });
c.api.collapseAll();
c.api.expandAll();
check('트랜잭션 후 펼치기: 새 집계', view(c), ['A=4', 3, 1, 'B=5', 0, 5]);

const d = mk({ groupDefaultExpanded: -1 });
d.api.collapseAll();
d.api.setFilterModel({ v: { filterType: 'number', type: 'greaterThan', filter: 2 } });
d.api.expandAll();
check('필터 바꾼 뒤 펼치기: 거른 결과로 집계', view(d), ['A=3', 3, 'B=15', 10, 5]);

const e = mk({ groupDefaultExpanded: -1 });
e.rootNodes[0].data.v = 50; // api 없이 직접 바꾸고
e.api.refreshClientSideRowModel();
check('직접 바꾼 값 + refreshClientSideRowModel: 다시 집계', view(e), ['A=51', 50, 1, 'B=15', 10, 5]);
