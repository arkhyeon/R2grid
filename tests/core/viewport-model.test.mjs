import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const ranges = [];
let P;
const ds = {
  init(p) { P = p; p.setRowCount(100); },
  setViewportRange(f, l) {
    ranges.push([f, l]);
    const m = {};
    for (let i = f; i <= l; i++) m[i] = { id: i, price: i * 10 };
    P.setRowData(m);
  },
  destroy() { ranges.push('destroy'); },
};
const flashes = [];
const g = new GridCore({ rowModelType: 'viewport', viewportDatasource: ds, getRowId: p => String(p.data.id), columnDefs: [{ field: 'id' }, { field: 'price' }], rowSelection: { mode: 'multiRow' } });
g.setViewportSize(800, 400);
check('행 수·빈 칸', [g.displayedNodes.length, g.displayedNodes.every(n => n.stub)], [100, true]);
g.vpEnsureRange(0, 9);
check('보이는 범위 + 여유를 페이지 단위로', ranges.at(-1), [0, 14]);
check('받은 행', [g.displayedNodes[3].data.price, g.displayedNodes[3].id, g.displayedNodes[20].stub], [30, '3', true]);
g.vpEnsureRange(1, 8);
check('같은 범위면 다시 요청 안 함', ranges.length, 1);
g.api.getRowNode('3').setSelected(true);
g.vpEnsureRange(40, 49);
check('범위 이동', ranges.at(-1), [35, 54]);
check('범위 밖 행은 비움', [g.displayedNodes[3].stub, g.displayedNodes[40].data.price], [true, 400]);
g.vpEnsureRange(0, 9);
check('다시 들어오면 선택 유지', g.displayedNodes[3].selected, true);
// 실시간 갱신: 같은 행에 새 데이터
const before = g.displayedNodes[5];
P.setRowData({ 5: { id: 5, price: 999 } });
check('값 갱신(같은 노드)', [g.displayedNodes[5] === before, g.getCellValue(before, g.getColumn('price'))], [true, 999]);
// 행 수 변경
P.setRowCount(20, true);
check('행 수 줄이기(받은 행 유지)', [g.displayedNodes.length, g.displayedNodes[5].stub], [20, false]);
// 정렬해도 그리드가 순서를 바꾸지 않음
g.api.applyColumnState({ state: [{ colId: 'price', sort: 'desc' }] });
check('정렬은 데이터 소스 몫', g.displayedNodes[0].data?.id, 0);
g.destroy();
check('destroy', ranges.at(-1), 'destroy');
