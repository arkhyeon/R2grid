import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const cols = () => [
  { field: 'a', width: 100, pinned: 'left' },
  { field: 'b', width: 100, pinned: 'left' },
  { field: 'c', width: 100 },
  { field: 'd', width: 100, pinned: 'right' },
  { field: 'e', width: 100, pinned: 'right' },
];
const pins = g => g.allColumns.filter(c => c.pinned).map(c => `${c.colId}:${c.pinned}`);
let ev = [];
let g = new GridCore({ columnDefs: cols(), rowData: [{}], onColumnPinned: e => ev.push(e.source) });
g.setViewportSize(800, 300);
check('넓으면 그대로', pins(g), ['a:left', 'b:left', 'd:right', 'e:right']);
g.setViewportSize(300, 300); // 고정 400 > 250 → 오른쪽 d, 왼쪽 a 해제 (200 남음)
check('좁으면 오른쪽 안쪽→왼쪽 바깥 번갈아 해제', pins(g), ['b:left', 'e:right']);
check('source', ev.includes('viewportSizeFeature'), true);
// lockPinned 는 안 풂
g = new GridCore({ columnDefs: cols().map(c => (c.field === 'd' ? { ...c, lockPinned: true } : c)), rowData: [{}] });
g.setViewportSize(300, 300);
check('lockPinned 건너뜀', pins(g), ['b:left', 'd:right']);
// processUnpinnedColumns
let seen;
g = new GridCore({ columnDefs: cols(), rowData: [{}], processUnpinnedColumns: p => { seen = [p.columns.map(c => c.colId), p.viewportWidth]; return p.columns.filter(c => c.colId === 'a'); } });
g.setViewportSize(300, 300);
check('processUnpinnedColumns 인자', seen, [['d', 'a'], 300]);
check('processUnpinnedColumns 결과만 해제', pins(g), ['b:left', 'd:right', 'e:right']);

// hidePaddedHeaderRows
const defs = [
  { headerName: 'G', groupId: 'G', children: [{ headerName: 'H', columnGroupShow: 'open', children: [{ field: 'x' }] }, { field: 'y' }] },
  { field: 'z' },
];
g = new GridCore({ columnDefs: defs, rowData: [{}] });
g.setViewportSize(800, 300);
check('기본 깊이 2', g.headerGroupDepth, 2);
g.api.setGridOption('hidePaddedHeaderRows', true);
check('닫힌 그룹이라 x 숨김 → 깊이 1', [g.displayedColumns.map(c => c.colId), g.headerGroupDepth], [['y', 'z'], 1]);
g.api.setColumnGroupOpened('G', true);
check('열면 다시 2', g.headerGroupDepth, 2);
