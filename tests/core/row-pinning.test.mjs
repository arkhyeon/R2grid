import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const rows = () => [1, 2, 3, 4, 5].map(i => ({ id: i, name: 'n' + i, amt: i * 10 }));
const mk = extra => {
  const c = new GridCore({ columnDefs: [{ field: 'name' }, { field: 'amt', editable: true }], rowData: rows(), getRowId: p => String(p.data.id), enableRowPinning: true, ...extra });
  c.setViewportSize(800, 400);
  return c;
};
const names = list => list.map(n => n.data?.name);
const a = mk();
const ev = [];
a.api.addEventListener('pinnedRowsChanged', e => ev.push(e.source));
a.pinRowManual(a.api.getRowNode('2'), 'top', 'contextMenu');
a.pinRowManual(a.api.getRowNode('4'), 'bottom', 'contextMenu');
check('고정 영역', [names(a.pinnedTop), names(a.pinnedBottom)], [['n2'], ['n4']]);
check('원본 본문 유지', names(a.displayedNodes), ['n1', 'n2', 'n3', 'n4', 'n5']);
check('sibling', [a.pinnedTop[0].pinnedSibling === a.api.getRowNode('2'), a.api.getRowNode('2').pinnedSibling === a.pinnedTop[0]], [true, true]);
check('이벤트', ev, ['contextMenu', 'contextMenu']);
// 복제 행 편집 → 원본 data 반영
a.pinnedTop[0].setDataValue('amt', 99);
check('편집 공유', a.api.getRowNode('2').data.amt, 99);
// 정렬해도 유지
a.api.applyColumnState({ state: [{ colId: 'amt', sort: 'desc' }] });
check('정렬 후 유지', names(a.pinnedTop), ['n2']);
// 위 → 아래 이동, 해제
a.pinRowManual(a.pinnedTop[0], 'bottom');
check('이동', [names(a.pinnedTop), names(a.pinnedBottom)], [[], ['n4', 'n2']]);
a.pinRowManual(a.pinnedBottom[0], null);
check('해제', [names(a.pinnedBottom), a.api.getRowNode('4').pinnedSibling ?? null], [['n2'], null]);
// 상태
const st = a.api.getState();
check('state', st.rowPinning, { top: [], bottom: ['2'] });
// 데이터 갱신(getRowId): data 교체 따라감, 삭제되면 빠짐
a.api.setGridOption('rowData', rows().map(r => (r.id === 2 ? { ...r, name: 'N2' } : r)));
check('데이터 갱신 반영', names(a.pinnedBottom), ['N2']);
a.api.applyTransaction({ remove: [{ id: 2 }] });
check('삭제 시 해제', [a.pinnedBottom.length, a.api.getState().rowPinning ?? null], [0, null]);
// initialState / setState
const b = mk({ initialState: { rowPinning: { top: ['3', '1'], bottom: ['5'] } } });
check('initialState', [names(b.pinnedTop), names(b.pinnedBottom)], [['n3', 'n1'], ['n5']]);
b.api.setState({});
check('setState 빈 → 해제', b.pinnedTop.length + b.pinnedBottom.length, 0);
// isRowPinned / isRowPinnable / 'top' 전용
const c = mk({ enableRowPinning: 'top', isRowPinned: n => (n.data.id === 5 ? 'top' : n.data.id === 1 ? 'bottom' : null), isRowPinnable: n => n.data.id !== 3 });
check('isRowPinned + top 전용', [names(c.pinnedTop), names(c.pinnedBottom)], [['n5'], []]);
check('isRowPinnable', [c.pinRowManual(c.api.getRowNode('3'), 'top'), c.pinRowManual(c.api.getRowNode('2'), 'bottom')], [false, false]);
// 사용자 pinnedTopRowData 와 같이
const d = mk({ pinnedTopRowData: [{ name: 'TOTAL' }] });
d.pinRowManual(d.api.getRowNode('1'), 'top');
check('pinnedTopRowData 와 함께', names(d.pinnedTop), ['TOTAL', 'n1']);
check('사용자 고정행은 고정 대상 아님', d.isRowPinnableNode(d.pinnedTop[0]), false);
// 그룹 모드: 리프만
const g = mk({ columnDefs: [{ field: 'name' }, { field: 'grp', rowGroup: true, hide: true }, { field: 'amt' }], rowData: rows().map(r => ({ ...r, grp: r.id % 2 ? 'odd' : 'even' })) });
const grpNode = g.displayedNodes.find(n => n.group);
check('그룹 행 고정 불가', g.isRowPinnableNode(grpNode), false);
// 컨텍스트 메뉴 기본 항목
let items;
const e = mk({ getContextMenuItems: p => ((items = p.defaultItems), []) });
e.openContextMenu({ node: e.api.getRowNode('1'), column: e.getColumn('name'), x: 0, y: 0 });
check('컨텍스트 메뉴', items.slice(0, 2), ['pinRowSubMenu', 'separator']);
// rowData 전체 교체 (getRowId 없음) → 해제
const f = mk({ getRowId: undefined });
f.pinRowManual(f.displayedNodes[0], 'top');
f.api.setGridOption('rowData', rows());
check('getRowId 없는 교체 → 해제', f.pinnedTop.length, 0);
