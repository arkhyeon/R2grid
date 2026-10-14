import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const mk = o => {
  const c = new GridCore(o);
  c.setViewportSize(800, 400);
  return c;
};
const key = (k, o = {}) => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, stopPropagation() {}, ...o });

// bulk edit
const ev = [];
let g = mk({
  cellSelection: true,
  undoRedoCellEditing: true,
  columnDefs: [
    { field: 'a', editable: true },
    { field: 'b', editable: true },
    { field: 'c', editable: false },
  ],
  rowData: [
    { a: 1, b: 2, c: 3 },
    { a: 4, b: 5, c: 6 },
    { a: 7, b: 8, c: 9 },
  ],
  onBulkEditingStarted: () => ev.push('start'),
  onBulkEditingStopped: e => ev.push(`stop:${e.changes.length}`),
  onCellValueChanged: e => ev.push(`cvc:${e.colDef.field}:${e.source}`),
});
g.addCellRange({ rowStartIndex: 0, rowEndIndex: 1, columns: ['a', 'b', 'c'] });
g.startEdit(g.displayedNodes[0], g.getColumn('a'));
g.editing.primary.setValue(0);
g.handleKeyDown(key('Enter', { ctrlKey: true }));
check(
  'bulk: 범위 편집 가능 칸 모두',
  g.displayedNodes.map(n => [n.data.a, n.data.b, n.data.c]),
  [
    [0, 0, 3],
    [0, 0, 6],
    [7, 8, 9],
  ],
);
check('bulk: 이벤트', [ev[0], ev[ev.length - 1], ev.filter(x => x.startsWith('cvc')).length, ev.includes('cvc:a:bulk')], ['start', 'stop:4', 4, true]);
check('bulk: 편집 끝남', !!g.editing, false);
g.api.undoCellEditing();
check(
  'bulk: 되돌리기 한 번',
  g.displayedNodes.map(n => [n.data.a, n.data.b]),
  [
    [1, 2],
    [4, 5],
    [7, 8],
  ],
);
// 숫자 컬럼에 문자열 입력 → 숫자로
g = mk({
  cellSelection: true,
  columnDefs: [
    { field: 's', editable: true },
    { field: 'n', editable: true },
  ],
  rowData: [
    { s: 'x', n: 1 },
    { s: 'y', n: 2 },
  ],
});
g.addCellRange({ rowStartIndex: 0, rowEndIndex: 1, columns: ['s', 'n'] });
g.startEdit(g.displayedNodes[0], g.getColumn('s'));
g.editing.primary.setValue('42');
g.handleKeyDown(key('Enter', { metaKey: true }));
check(
  'bulk: 컬럼 타입에 맞춰 변환',
  g.displayedNodes.map(n => [n.data.s, n.data.n]),
  [
    ['42', 42],
    ['42', 42],
  ],
);
// 범위 없으면 그냥 Enter 처럼 아님 → 일반 동작 (편집 끝, 한 칸만)
g = mk({ columnDefs: [{ field: 'a', editable: true }], rowData: [{ a: 1 }, { a: 2 }] });
g.startEdit(g.displayedNodes[0], g.getColumn('a'));
g.editing.primary.setValue(9);
g.handleKeyDown(key('Enter', { ctrlKey: true }));
check('범위 없을 때 Ctrl+Enter = 일반 확정', [g.displayedNodes[0].data.a, g.displayedNodes[1].data.a, !!g.editing], [9, 2, false]);

// alwaysPassFilter
g = mk({
  columnDefs: [{ field: 'a', filter: 'r2NumberColumnFilter' }],
  rowData: [{ a: 1 }, { a: 2 }, { a: 3, keep: true }],
  alwaysPassFilter: n => !!n.data.keep,
});
g.api.setFilterModel({ a: { filterType: 'number', type: 'equals', filter: 1 } });
check(
  'alwaysPassFilter',
  g.displayedNodes.map(n => n.data.a),
  [1, 3],
);
g.api.setGridOption('quickFilterText', 'zzz');
check(
  'alwaysPassFilter + 빠른 검색',
  g.displayedNodes.map(n => n.data.a),
  [3],
);

// resetRowDataOnUpdate
g = mk({ getRowId: p => String(p.data.id), columnDefs: [{ field: 'id' }], rowData: [{ id: 1 }, { id: 2 }], rowSelection: { mode: 'multiRow' } });
const n1 = g.api.getRowNode('1');
g.api.selectAll();
g.api.setGridOption('rowData', [{ id: 1 }, { id: 2 }]);
check('기본: 같은 id 노드 재사용·선택 유지', [g.api.getRowNode('1') === n1, g.api.getSelectedRows().length], [true, 2]);
g.api.setGridOption('resetRowDataOnUpdate', true);
g.api.setGridOption('rowData', [{ id: 1 }, { id: 2 }]);
check('resetRowDataOnUpdate: 새 노드·선택 초기화', [g.api.getRowNode('1') === n1, g.api.getSelectedRows().length, g.api.getRowNode('2')?.id], [false, 0, '2']);

// rowNumbers valueGetter
g = mk({ rowNumbers: { valueGetter: p => `#${p.node.rowIndex + 1}` }, columnDefs: [{ field: 'a' }], rowData: [{ a: 1 }] });
check(
  'rowNumbers valueGetter',
  g.getCellValue(g.displayedNodes[0], g.getColumn('r2-Grid-RowNumbersColumn') || g.allColumns.find(c => c.autoType === 'rowNumbers')),
  '#1',
);
