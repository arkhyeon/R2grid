// SSRM 트랜잭션 · 선택 상태 검증 (헤드리스)
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const tick = (ms = 10) => new Promise(r => setTimeout(r, ms));

let SERVER = Array.from({ length: 250 }, (_, i) => ({ id: i, v: `r${i}` }));
let delay = 0;
const datasource = {
  getRows(p) {
    const { startRow, endRow } = p.request;
    setTimeout(() => p.success({ rowData: SERVER.slice(startRow, endRow), rowCount: SERVER.length }), delay);
  },
};
const mk = extra => {
  const c = new GridCore({
    columnDefs: [{ field: 'id' }, { field: 'v' }],
    rowModelType: 'serverSide',
    serverSideDatasource: datasource,
    cacheBlockSize: 100,
    getRowId: p => String(p.data.id),
    rowSelection: { mode: 'multiRow' },
    ...extra,
  });
  c.setViewportSize(800, 400);
  return c;
};
const ids = (c, a, b) => c.displayedNodes.slice(a, b).map(n => (n.stub ? 'S' : n.data.id));

const c = mk();
c.ssrmEnsureRows(0, 0);
await tick();
check('로드', [c.api.getDisplayedRowCount(), ids(c, 0, 3)], [250, [0, 1, 2]]);

// update
let r = c.api.applyServerSideTransaction({ update: [{ id: 1, v: 'X' }] });
check('update', [r.status, r.update.length, c.api.getRowNode('1').data.v], ['Applied', 1, 'X']);
// add at index 0
r = c.api.applyServerSideTransaction({ add: [{ id: 1000, v: 'new' }], addIndex: 0 });
check('add', [r.status, r.add.length, c.api.getDisplayedRowCount(), ids(c, 0, 3)], ['Applied', 1, 251, [1000, 0, 1]]);
// remove
r = c.api.applyServerSideTransaction({ remove: [{ id: 0 }, { id: 2 }] });
check('remove', [r.remove.length, c.api.getDisplayedRowCount(), ids(c, 0, 3)], [2, 249, [1000, 1, 3]]);
check('rowIndex 재계산', c.api.getRowNode('3').rowIndex, 2);
// 블록 경계가 밀려서 block 0 (0~99) 은 실제 행만, block 1 은 일부 stub → 미로드
check('블록 상태 (끝에 stub 생긴 블록은 다시 요청)', Object.keys(c.getCacheBlockState()), []);
// 안 불러온 행 update 는 무시
r = c.api.applyServerSideTransaction({ update: [{ id: 200, v: 'Z' }] });
check('미로드 update 무시', r.update.length, 0);

// 로딩 중 → StoreLoading, Async 는 로드 뒤 적용
delay = 30;
const d = mk();
d.ssrmEnsureRows(0, 0);
await tick(1);
r = d.api.applyServerSideTransaction({ add: [{ id: 2000 }] });
check('로딩 중 sync', r.status, 'StoreLoading');
let asyncRes = null;
const flushed = [];
d.api.addEventListener('asyncTransactionsFlushed', e => flushed.push(e.results.length));
d.api.applyServerSideTransactionAsync({ add: [{ id: 2000, v: 'a' }], addIndex: 0 }, res => (asyncRes = res));
await tick(100);
check('async 로드 뒤 적용', [asyncRes?.status, ids(d, 0, 2), flushed], ['Applied', [2000, 0], [1]]);
delay = 0;

// 선택 상태: selectAll → 안 불러온 행도 선택으로 로드
const e = mk();
e.ssrmEnsureRows(0, 0);
await tick();
e.api.selectAll();
e.setNodeSelected(e.api.getRowNode('5'), false, false, 'checkboxSelected');
check('selectAll + 해제', e.api.getServerSideSelectionState(), { selectAll: true, toggledNodes: ['5'] });
check('헤더 체크박스 일부', e.getHeaderCheckboxState(), null);
e.ssrmEnsureRows(150, 150);
await tick();
check('나중 로드 행도 선택', [e.api.getRowNode('150').selected, e.api.getRowNode('5').selected], [true, false]);
// 정렬 → 리셋 → 다시 로드돼도 선택 유지
e.api.applyColumnState({ state: [{ colId: 'v', sort: 'asc' }] });
e.ssrmEnsureRows(0, 0);
await tick();
check('리셋 후 유지', [e.api.getRowNode('0').selected, e.api.getRowNode('5').selected], [true, false]);
// set / deselectAll
e.api.setServerSideSelectionState({ selectAll: false, toggledNodes: ['3', '7'] });
check(
  'setServerSideSelectionState',
  e.api
    .getSelectedNodes()
    .map(n => n.id)
    .sort(),
  ['3', '7'],
);
check('getState rowSelection', e.api.getState().rowSelection, { selectAll: false, toggledNodes: ['3', '7'] });
e.api.deselectAll();
check('deselectAll', [e.api.getSelectedNodes().length, e.getHeaderCheckboxState()], [0, false]);
// 클릭 단독 선택 (clearOthers) → 안 불러온 toggled 도 정리
e.api.setServerSideSelectionState({ selectAll: true, toggledNodes: [] });
e.setNodeSelected(e.api.getRowNode('4'), true, true, 'rowClicked');
check('단독 선택', e.api.getServerSideSelectionState(), { selectAll: false, toggledNodes: ['4'] });
// initialState 로 복원
const f = mk({ initialState: { rowSelection: { selectAll: true, toggledNodes: ['1'] } } });
f.ssrmEnsureRows(0, 0);
await tick();
check('initialState 복원', [f.api.getRowNode('0').selected, f.api.getRowNode('1').selected], [true, false]);
// applyServerSideRowData
const g = mk({ serverSideDatasource: { getRows() {} } });
g.api.applyServerSideRowData({ successParams: { rowData: SERVER.slice(0, 100), rowCount: 250 } });
check('applyServerSideRowData', [g.api.getDisplayedRowCount(), ids(g, 98, 101), Object.keys(g.getCacheBlockState())], [250, [98, 99, 'S'], ['0']]);
