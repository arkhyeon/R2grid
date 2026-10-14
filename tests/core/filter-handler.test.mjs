import { check } from '../check.mjs';
const { GridCore } = await import('../../src/grid/core/GridCore.js');
const tick = () => new Promise(r => setTimeout(r, 5));
const rows = [{ n: 1 }, { n: 5 }, { n: 10 }, { n: 20 }];
const Comp = () => null;
// doesFilterPass 방식
let g = new GridCore({ enableFilterHandlers: true, columnDefs: [{ field: 'n', filter: { component: Comp, doesFilterPass: ({ model, data }) => data.n >= model.min } }], rowData: rows });
g.setViewportSize(800, 400);
g.api.setFilterModel({ n: { min: 5 } });
await tick();
check('doesFilterPass', g.displayedNodes.map(n => n.data.n), [5, 10, 20]);
check('핸들러 조회', typeof g.api.getColumnFilterHandler('n').doesFilterPass, 'function');
check('필터 활성', g.getColumn('n').filterActive, true);
// handler 키 (gridOptions.filterHandlers)
const log = [];
g = new GridCore({
  enableFilterHandlers: true,
  filterHandlers: {
    range: ({ column }) => ({
      init: p => log.push(`init:${column.colId}:${JSON.stringify(p.model)}`),
      refresh: p => log.push(`refresh:${JSON.stringify(p.model)}`),
      doesFilterPass: ({ model, data }) => data.n >= model.from && data.n <= model.to,
      getModelAsString: m => (m ? `${m.from}~${m.to}` : ''),
      processModelToApply: m => (m && m.from > m.to ? { from: m.to, to: m.from } : m),
    }),
  },
  columnDefs: [{ field: 'n', filter: { component: Comp, handler: 'range' }, filterParams: { buttons: ['apply', 'reset'] } }],
  rowData: rows,
});
g.setViewportSize(800, 400);
const col = g.getColumn('n');
g.getFilterHandler(col);
g.setHandlerFilterModel(col, { from: 12, to: 2 });
check('processModelToApply 적용', [g.api.getFilterModel().n, g.displayedNodes.map(n => n.data.n)], [{ from: 2, to: 12 }, [5, 10]]);
check('init·refresh 호출', log, ['init:n:null', 'refresh:{"from":2,"to":12}']);
// apply 버튼 흐름: 화면 상태만 바꾸고 doFilterAction('apply') 때 적용
g.setHandlerFilterState(col, { model: { from: 15, to: 30 } });
check('적용 전엔 그대로', g.displayedNodes.map(n => n.data.n), [5, 10]);
g.api.doFilterAction({ colId: 'n', action: 'apply' });
check('apply', g.displayedNodes.map(n => n.data.n), [20]);
g.setHandlerFilterState(col, { model: { from: 0, to: 1 } });
g.api.doFilterAction({ action: 'cancel' });
check('cancel → 적용된 값 상태로', g.getHandlerFilterState(col).model, { from: 15, to: 30 });
g.api.doFilterAction({ colId: 'n', action: 'reset' });
check('reset → 해제', [g.api.getFilterModel(), g.displayedNodes.length], [{}, 4]);
