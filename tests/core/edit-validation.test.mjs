import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const mk = o => {
  const c = new GridCore(o);
  c.setViewportSize(800, 400);
  return c;
};
const cols = [
  { field: 'n', editable: true, cellEditor: 'r2NumberCellEditor', cellEditorParams: { min: 0, max: 100 } },
  { field: 's', editable: true, cellEditor: 'r2TextCellEditor', cellEditorParams: { maxLength: 3 } },
  { field: 'd', editable: true, cellEditor: 'r2DateStringCellEditor', cellEditorParams: { min: '2026-01-01' } },
  {
    field: 'q',
    editable: true,
    cellEditor: 'r2NumberCellEditor',
    cellEditorParams: { step: 5, getValidationErrors: ({ value, internalErrors }) => (value === 7 ? ['7 안 됨'] : internalErrors) },
  },
];
const rows = () => [{ n: 10, s: 'ab', d: '2026-05-01', q: 5 }];

// revert (기본): 틀린 값은 원래대로
let g = mk({ columnDefs: cols, rowData: rows() });
let node = g.displayedNodes[0];
g.startEdit(node, g.getColumn('n'));
g.editing.primary.setValue(150);
check('min/max 오류', g.editing.primary.errors, ['100 이하여야 합니다']);
check(
  'validateEdit',
  g.api.validateEdit().map(x => [x.column.colId, x.messages]),
  [['n', ['100 이하여야 합니다']]],
);
check('revert: 끝내기 성공', g.stopEditing(false), true);
check('revert: 값 그대로', node.data.n, 10);
g.startEdit(node, g.getColumn('n'));
g.editing.primary.setValue(50);
check('정상 값 오류 없음', g.api.validateEdit(), null);
g.stopEditing(false);
check('정상 값 반영', node.data.n, 50);

// 글자 수 · 날짜 · step · 사용자 함수
g.startEdit(node, g.getColumn('s'));
g.editing.primary.setValue('abcd');
check('maxLength', g.editing.primary.errors, ['3자 이하로 입력하세요']);
g.stopEditing(true);
g.startEdit(node, g.getColumn('d'));
g.editing.primary.setValue('2025-12-31');
check('날짜 min', g.editing.primary.errors, ['2026-01-01 이후 날짜여야 합니다']);
g.stopEditing(true);
g.startEdit(node, g.getColumn('q'));
g.editing.primary.setValue(12);
check('step', g.editing.primary.errors, ['5 단위로 입력하세요']);
g.editing.primary.setValue(7);
check('getValidationErrors 우선', g.editing.primary.errors, ['7 안 됨']);
g.editing.primary.setValue(15);
check('step 정상', g.editing.primary.errors, null);
g.stopEditing(false);
check('q 반영', node.data.q, 15);

// block: 편집이 안 끝남, 취소는 됨
g = mk({ columnDefs: cols, rowData: rows(), invalidEditValueMode: 'block' });
node = g.displayedNodes[0];
g.startEdit(node, g.getColumn('n'));
g.editing.primary.setValue(-1);
check('block: 끝내기 막힘', [g.stopEditing(false), !!g.editing], [false, true]);
check('block: 다른 칸 편집 시작 막힘', [g.startEdit(node, g.getColumn('s')), g.editing.colId], [false, 'n']);
g.editing.primary.setValue(1);
check('block: 고치면 끝남', [g.stopEditing(false), node.data.n], [true, 1]);
g.startEdit(node, g.getColumn('n'));
g.editing.primary.setValue(-5);
g.stopEditing(true);
check('block: 취소는 됨', [!!g.editing, node.data.n], [false, 1]);

// fullRow: getFullRowEditValidationErrors
let seen;
g = mk({
  columnDefs: cols,
  rowData: rows(),
  editType: 'fullRow',
  getFullRowEditValidationErrors: ({ editorsState }) => {
    seen = editorsState.map(e => e.colId);
    const n = editorsState.find(e => e.colId === 'n');
    const q = editorsState.find(e => e.colId === 'q');
    return n.newValue > q.newValue ? ['n 은 q 보다 클 수 없음'] : null;
  },
});
node = g.displayedNodes[0];
g.startEdit(node, g.getColumn('n'));
g.editing.cells.get('n').setValue(20);
g.editing.cells.get('s').setValue('xy');
check('행 검사 오류', g.editing.rowErrors, ['n 은 q 보다 클 수 없음']);
check('editorsState 칸', seen, ['n', 's', 'd', 'q']);
check('행 오류는 지금 칸에 표시', g.editErrorsFor(g.editing.primary), ['n 은 q 보다 클 수 없음']);
g.stopEditing(false);
check('행 오류 revert: 행 전체 원래대로', [node.data.n, node.data.s], [10, 'ab']);
g.startEdit(node, g.getColumn('n'));
g.editing.cells.get('n').setValue(3);
g.editing.cells.get('s').setValue('xy');
g.stopEditing(false);
check('행 정상 반영', [node.data.n, node.data.s], [3, 'xy']);
