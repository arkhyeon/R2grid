// 그룹 합계/총합계 행 검증
import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');

const rows = [
  { g: 'A', v: 1 },
  { g: 'A', v: 2 },
  { g: 'B', v: 10 },
];
const mk = extra => {
  const core = new GridCore({
    columnDefs: [{ field: 'g', rowGroup: true, hide: true }, { field: 'v', aggFunc: 'sum' }],
    rowData: rows.map(r => ({ ...r })),
    groupDefaultExpanded: -1,
    ...extra,
  });
  core.setViewportSize(800, 400);
  return core;
};
const view = core => {
  const auto = core.api.getColumn('r2-Grid-AutoColumn');
  const v = core.api.getColumn('v');
  const out = [];
  core.api.forEachNodeAfterFilterAndSort(() => {});
  for (let i = 0; i < core.api.getDisplayedRowCount(); i++) {
    const n = core.api.getDisplayedRowAtIndex(i);
    out.push(`${n.footer ? 'F' : n.group ? 'G' : 'L'}:${core.getCellValue(n, auto) ?? ''}:${core.getCellValue(n, v) ?? ''}`);
  }
  return out;
};

check('기본(합계행 없음, 그룹행에 집계)', view(mk({})), ['G:A:3', 'L::1', 'L::2', 'G:B:10', 'L::10']);
check('groupTotalRow bottom', view(mk({ groupTotalRow: 'bottom' })), ['G:A:', 'L::1', 'L::2', 'F:합계 A:3', 'G:B:', 'L::10', 'F:합계 B:10']);
check('grandTotalRow bottom', view(mk({ grandTotalRow: 'bottom' })), ['G:A:3', 'L::1', 'L::2', 'G:B:10', 'L::10', 'F:합계:13']);
check('grandTotalRow top + 레거시 groupIncludeFooter', view(mk({ grandTotalRow: 'top', groupIncludeFooter: true })), ['F:합계:13', 'G:A:', 'L::1', 'L::2', 'F:합계 A:3', 'G:B:', 'L::10', 'F:합계 B:10']);
const c = mk({ grandTotalRow: 'pinnedBottom' });
check('pinnedBottom 총합계', [c.api.getPinnedBottomRowCount(), c.getCellValue(c.api.getPinnedBottomRow(0), c.api.getColumn('v'))], [1, 13]);
const d = mk({ groupTotalRow: 'bottom' });
d.api.getDisplayedRowAtIndex(0).setExpanded(false);
check('접힌 그룹은 합계행 없음 + 그룹행 집계 표시', view(d), ['G:A:3', 'G:B:', 'L::10', 'F:합계 B:10']);
d.api.setFilterModel({ v: { filterType: 'number', type: 'greaterThan', filter: 1 } });
d.api.getDisplayedRowAtIndex(0).setExpanded(true);
check('필터 반영 합계', view(d), ['G:A:', 'L::2', 'F:합계 A:2', 'G:B:', 'L::10', 'F:합계 B:10']);
