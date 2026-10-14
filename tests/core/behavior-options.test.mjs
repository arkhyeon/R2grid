// 붙여넣기 빈 줄 · 수정 트랜잭션 후 모델 유지 · 변경 감지 끄기 · getDocument
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const mk = o => {
  const c = new GridCore({ getRowId: p => String(p.data.id), rowData: [{ id: 1, a: 'x', v: 3 }, { id: 2, a: 'y', v: 1 }, { id: 3, a: 'z', v: 2 }], columnDefs: [{ field: 'a' }, { field: 'v', editable: true }], ...o });
  c.setViewportSize(800, 400);
  return c;
};
const vs = c => c.displayedNodes.map(n => n.data.v);
// 붙여넣기
const p0 = mk({ cellSelection: true });
p0.setFocusedCell(0, 'v');
p0.setSingleRange?.(0, 'v');
p0.pasteText('9\r\n\r\n');
check('기본: 끝 빈 줄도 붙여넣음 (두 번째 행 비움)', vs(p0), [9, null, 2]);
const p1 = mk({ cellSelection: true, suppressLastEmptyLineOnPaste: true });
p1.setFocusedCell(0, 'v');
p1.setSingleRange?.(0, 'v');
p1.pasteText('9\r\n\r\n');
check('suppressLastEmptyLineOnPaste: 끝 빈 줄 버림', vs(p1), [9, 1, 2]);
// 수정 트랜잭션
const s0 = mk({});
s0.api.applyColumnState({ state: [{ colId: 'v', sort: 'asc' }] });
s0.api.applyTransaction({ update: [{ id: 2, a: 'y', v: 10 }] });
check('기본: 수정 후 다시 정렬', vs(s0), [2, 3, 10]);
const s1 = mk({ suppressModelUpdateAfterUpdateTransaction: true });
s1.api.applyColumnState({ state: [{ colId: 'v', sort: 'asc' }] });
s1.api.applyTransaction({ update: [{ id: 2, a: 'y', v: 10 }] });
check('suppressModelUpdateAfterUpdateTransaction: 순서 그대로, 값만', vs(s1), [10, 2, 3]);
s1.api.applyTransaction({ add: [{ id: 4, a: 'w', v: 0 }] });
check('추가가 있으면 평소대로 다시 정렬', vs(s1), [0, 2, 3, 10]);
const g1 = mk({ suppressModelUpdateAfterUpdateTransaction: true, columnDefs: [{ field: 'a', rowGroup: true, hide: true }, { field: 'v', aggFunc: 'sum' }], rowData: [{ id: 1, a: 'x', v: 3 }, { id: 2, a: 'x', v: 1 }] });
g1.api.applyTransaction({ update: [{ id: 2, a: 'x', v: 5 }] });
check('수정만 트랜잭션도 집계는 갱신', g1.groupTop[0].aggData, { v: 8 });
// 변경 감지
const c0 = mk({ columnDefs: [{ field: 'a', rowGroup: true, hide: true }, { field: 'v', aggFunc: 'sum', editable: true }], suppressChangeDetection: true });
const x = c0.groupTop.find(n => n.key === 'x');
c0.api.getRowNode('1').setDataValue('v', 100);
check('suppressChangeDetection: 편집 뒤 집계 그대로', x.aggData, { v: 3 });
// getDocument
const fake = { body: { tag: 'fake' }, activeElement: null };
const d0 = mk({ getDocument: () => fake });
check('getDocument', [d0.getDocument() === fake, d0.getPopupParent?.() === fake.body], [true, true]);
