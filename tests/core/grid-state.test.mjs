import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');

const rows = [
  { id: 1, dept: 'A', name: 'kim', amt: 10 },
  { id: 2, dept: 'A', name: 'lee', amt: 20 },
  { id: 3, dept: 'B', name: 'park', amt: 5 },
  { id: 4, dept: 'B', name: 'choi', amt: 7 },
];
const defs = () => [{ field: 'dept' }, { field: 'name', filter: 'r2TextColumnFilter' }, { field: 'amt', width: 120 }];
const mk = extra => {
  const c = new GridCore({ columnDefs: defs(), rowData: rows.map(r => ({ ...r })), getRowId: p => String(p.data.id), rowSelection: { mode: 'multiRow' }, ...extra });
  c.setViewportSize(800, 400);
  return c;
};

// 1) 상태 만들기
const a = mk();
a.api.applyColumnState({ state: [{ colId: 'amt', sort: 'desc' }] });
a.api.setColumnsVisible(['name'], false);
a.api.setColumnsPinned(['dept'], 'left');
a.api.setRowGroupColumns(['dept']);
a.api.setColumnAggFunc('amt', 'sum');
a.api.setFilterModel({ name: { filterType: 'text', type: 'notEqual', filter: 'choi' } });
const gA = a.displayedNodes.find(n => n.group && n.key === 'A');
a.setNodeExpanded(gA, true);
const st = a.api.getState();
check('rowGroup', st.rowGroup, { groupColIds: ['dept'] });
check('aggregation', st.aggregation, { aggregationModel: [{ colId: 'amt', aggFunc: 'sum' }] });
check('sort', st.sort, { sortModel: [{ colId: 'amt', sort: 'desc' }] });
check('visibility', st.columnVisibility, { hiddenColIds: ['name'] });
check('pinning', st.columnPinning, { leftColIds: ['dept'], rightColIds: [] });
check('filter', st.filter, { filterModel: { name: { filterType: 'text', type: 'notEqual', filter: 'choi' } } });
check('expansion', st.rowGroupExpansion?.expandedRowGroupIds?.length, 1);
check('getColumnState 집계/그룹', a.api.getColumnState().filter(s => s.colId === 'amt' || s.colId === 'dept').map(s => [s.colId, s.aggFunc, s.rowGroup]), [
  ['dept', null, true],
  ['amt', 'sum', false],
]);

// 2) initialState 로 다른 그리드에 복원
const b = mk({ initialState: JSON.parse(JSON.stringify(st)) });
check('복원 그룹', b.rowGroupColumns().map(c => c.colId), ['dept']);
check('복원 집계', b.getColumn('amt').colDef.aggFunc, 'sum');
check('복원 숨김/고정', [b.getColumn('name').visible, b.getColumn('dept').pinned], [false, 'left']);
check('복원 필터', b.api.getFilterModel(), st.filter.filterModel);
const gB = b.displayedNodes.find(n => n.group && n.key === 'A');
check('복원 펼침 + 합계', [gB?.expanded, gB?.aggData?.amt], [true, 30]);
check('복원 표시 행', b.displayedNodes.map(n => (n.group ? `G:${n.key}` : n.data.name)), ['G:A', 'lee', 'kim', 'G:B']);

// 3) setState: 빠진 항목은 기본값
b.api.setState({ sort: { sortModel: [{ colId: 'amt', sort: 'asc' }] } });
check('setState 리셋', [b.rowGroupColumns().length, b.getColumn('name').visible, Object.keys(b.api.getFilterModel() || {}).length, b.getColumn('amt').sort], [0, true, 0, 'asc']);
b.api.setState(st, ['filter']);
check('setState ignore', [b.rowGroupColumns().length, Object.keys(b.api.getFilterModel() || {}).length], [1, 0]);

// 4) stateUpdated
const c = mk();
const got = [];
c.api.addEventListener('stateUpdated', e => got.push(e.sources.join(',')));
c.api.applyColumnState({ state: [{ colId: 'name', sort: 'asc' }] });
c.api.setColumnsVisible(['amt'], false);
await new Promise(r => setTimeout(r, 10));
check('stateUpdated 묶음', got, ['sort,columnVisibility']);

// 5) 값 컬럼 API
const d = mk({ columnDefs: [{ field: 'dept', rowGroup: true }, { field: 'name' }, { field: 'amt', enableValue: true }] });
d.api.addValueColumns(['amt']);
check('addValueColumns 기본 sum', d.api.getValueColumns().map(c2 => [c2.colId, c2.colDef.aggFunc]), [['amt', 'sum']]);
check('그룹 합계', d.displayedNodes.filter(n => n.group).map(n => n.aggData?.amt), [30, 12]);
d.api.setColumnAggFunc('amt', 'max');
check('setColumnAggFunc', d.displayedNodes.filter(n => n.group).map(n => n.aggData?.amt), [20, 7]);
d.api.setGridOption('columnDefs', [{ field: 'dept', rowGroup: true }, { field: 'name' }, { field: 'amt', enableValue: true }]);
check('colDef 재설정 후 유지', d.getColumn('amt').colDef.aggFunc, 'max');
d.api.removeValueColumns(['amt']);
check('removeValueColumns', d.api.getValueColumns().length, 0);

// 6) 일괄 편집
const e = mk({ defaultColDef: { editable: true } });
const changes = [];
e.api.addEventListener('cellValueChanged', ev => changes.push(`${ev.data.id}:${ev.oldValue}->${ev.newValue}`));
e.api.startBatchEdit();
const n1 = e.api.getRowNode('1');
const amt = e.getColumn('amt');
e.startEdit(n1, amt, null);
e.setEditorValue(99);
e.stopEditing(false);
check('보류 중 화면값/데이터', [e.getCellValue(n1, amt), n1.data.amt, changes.length, e.api.isBatchEditing()], [99, 10, 0, true]);
check('getEditRowValues', e.api.getEditRowValues(n1), { amt: 99 });
e.api.commitBatchEdit();
check('commit 반영', [n1.data.amt, changes, e.api.isBatchEditing()], [99, ['1:10->99'], false]);
e.api.startBatchEdit();
e.startEdit(n1, amt, null);
e.setEditorValue(5);
e.stopEditing(false);
e.api.cancelBatchEdit();
check('cancel 버림', [e.getCellValue(n1, amt), n1.data.amt, changes.length], [99, 99, 1]);

// 7) 컬럼 그룹 표시 API
const f = mk({ columnDefs: [{ field: 'dept', pinned: 'left' }, { headerName: 'G', children: [{ field: 'name' }, { field: 'amt' }] }] });
check('getCenterDisplayedColumnGroups', f.api.getCenterDisplayedColumnGroups().map(x => x.groupId ?? x.colId).filter(x => !String(x).startsWith('r2-Grid')), [f.getColumn('name').groupChain[0].groupId]);
check('getLeftDisplayedColumnGroups', f.api.getLeftDisplayedColumnGroups().map(x => x.colId), ['dept']);
