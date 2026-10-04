import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useGridFilter } from '../../grid/index.js';
import { BASE_COLUMNS, SAMPLE } from '../data.js';
import { Grid } from './_shared.jsx';

const CAT = '필터 · 정렬';

const FILTER_COLS = [
  { field: 'id', headerName: 'ID', width: 90, filter: 'agNumberColumnFilter' },
  { field: 'taskName', headerName: '작업명', width: 150, filter: 'agTextColumnFilter' },
  { field: 'dbms', headerName: 'DBMS', width: 120, filter: 'agSetColumnFilter' },
  { field: 'owner', headerName: '소유자', width: 120, filter: true },
  { field: 'rowCnt', headerName: '행 수', width: 130, filter: 'agNumberColumnFilter', valueFormatter: p => p.value.toLocaleString() },
  { field: 'updatedAt', headerName: '수정일', width: 130, filter: 'agDateColumnFilter', cellDataType: 'dateString' },
];

function Sorting({ p, ctx }) {
  const defs = useMemo(
    () => [
      ...BASE_COLUMNS.map(c => (c.field === 'status' ? { ...c, comparator: (a, b) => ['오류', '진행', '대기', '완료'].indexOf(a) - ['오류', '진행', '대기', '완료'].indexOf(b), headerName: '상태(커스텀 순서)' } : c)),
    ],
    [],
  );
  return (
    <Grid
      key={`${p.multiKey}${p.order}`}
      rowData={SAMPLE}
      columnDefs={defs}
      multiSortKey={p.multiKey === 'ctrl' ? 'ctrl' : undefined}
      sortingOrder={p.order === 'desc-first' ? ['desc', 'asc', null] : undefined}
      accentedSort={p.accented}
      onSortChanged={e => ctx.log(`sortChanged: ${e.api.getColumnState().filter(s => s.sort).sort((a, b) => a.sortIndex - b.sortIndex).map(s => `${s.colId} ${s.sort}`).join(', ') || '(없음)'}`)}
    />
  );
}

function ColumnFilters({ ctx }) {
  const ref = useRef(null);
  const set = m => ref.current.api.setFilterModel(m);
  return (
    <>
      <div className="pg-toolbar">
        <button onClick={() => set({ dbms: { filterType: 'set', values: ['Oracle', 'Tibero'] } })}>DBMS = Oracle, Tibero</button>
        <button onClick={() => set({ rowCnt: { filterType: 'number', type: 'inRange', filter: 1_000_000, filterTo: 3_000_000 } })}>행 수 100만~300만</button>
        <button onClick={() => set({ taskName: { filterType: 'text', operator: 'OR', conditions: [{ type: 'endsWith', filter: '1' }, { type: 'endsWith', filter: '2' }] } })}>작업명 끝 1 또는 2</button>
        <button onClick={() => set({ updatedAt: { filterType: 'date', type: 'greaterThan', dateFrom: '2026-06-01 00:00:00' } })}>수정일 6월 이후</button>
        <button onClick={() => set(null)}>필터 해제</button>
      </div>
      <Grid
        gridRef={ref}
        rowData={SAMPLE}
        columnDefs={FILTER_COLS}
        onFilterChanged={e => ctx.log(`filterChanged → ${e.api.getDisplayedRowCount()}행 · ${JSON.stringify(e.api.getFilterModel())}`)}
      />
    </>
  );
}

function QuickFilter() {
  const [text, setText] = useState('oracle 대기');
  return (
    <>
      <div className="pg-toolbar">
        <input value={text} onChange={e => setText(e.target.value)} placeholder="빠른 검색 (공백 = AND)" style={{ width: 260 }} />
        <span className="pg-note">모든 표시 컬럼의 값에서 대소문자 무시 검색</span>
      </div>
      <Grid rowData={SAMPLE} columnDefs={BASE_COLUMNS} quickFilterText={text} />
    </>
  );
}

function Floating({ p }) {
  return <Grid key={String(p.button)} rowData={SAMPLE} columnDefs={FILTER_COLS.map(c => ({ ...c, floatingFilter: true, suppressFloatingFilterButton: !p.button }))} />;
}

// reactive 커스텀 필터: model / onModelChange + useGridFilter
function MinCountFilter({ model, onModelChange, getValue }) {
  const doesFilterPass = useCallback(({ node }) => getValue(node) >= model, [model]);
  useGridFilter({ doesFilterPass });
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <b style={{ fontSize: 12 }}>최소 행 수</b>
      {[null, 1_000_000, 2_500_000, 4_000_000].map(v => (
        <label key={String(v)} style={{ fontSize: 13 }}>
          <input type="radio" checked={model === v} onChange={() => onModelChange(v)} /> {v == null ? '전체' : `${(v / 10000).toLocaleString()}만 이상`}
        </label>
      ))}
    </div>
  );
}
function CustomFilter({ ctx }) {
  const ref = useRef(null);
  return (
    <>
      <div className="pg-toolbar">
        <button onClick={() => ref.current.api.setFilterModel({ rowCnt: 2_500_000 })}>setFilterModel(250만)</button>
        <button onClick={() => ref.current.api.setFilterModel(null)}>해제</button>
        <span className="pg-note">행 수 헤더의 필터 아이콘 → 라디오 선택</span>
      </div>
      <Grid
        gridRef={ref}
        rowData={SAMPLE}
        columnDefs={BASE_COLUMNS.map(c => (c.field === 'rowCnt' ? { ...c, filter: MinCountFilter } : c))}
        onFilterChanged={e => ctx.log(`filterChanged → ${e.api.getDisplayedRowCount()}행 · model=${JSON.stringify(e.api.getFilterModel())}`)}
      />
    </>
  );
}

function Advanced({ ctx }) {
  const ref = useRef(null);
  return (
    <>
      <div className="pg-toolbar">
        <button
          onClick={() =>
            ref.current.api.setAdvancedFilterModel({
              filterType: 'join',
              type: 'AND',
              conditions: [
                { filterType: 'text', colId: 'dbms', type: 'equals', filter: 'Oracle' },
                { filterType: 'join', type: 'OR', conditions: [{ filterType: 'number', colId: 'rowCnt', type: 'greaterThan', filter: 4_000_000 }, { filterType: 'text', colId: 'status', type: 'equals', filter: '오류' }] },
              ],
            })
          }
        >
          setAdvancedFilterModel
        </button>
        <button onClick={() => ref.current.api.showAdvancedFilterBuilder()}>빌더 열기</button>
        <button onClick={() => ref.current.api.setAdvancedFilterModel(null)}>해제</button>
      </div>
      <Grid
        gridRef={ref}
        height={400}
        rowData={SAMPLE}
        columnDefs={BASE_COLUMNS}
        enableAdvancedFilter
        onFilterChanged={e => ctx.log(`filterChanged → ${e.api.getDisplayedRowCount()}행`)}
      />
    </>
  );
}

function External({ p }) {
  const ref = useRef(null);
  const status = p.status;
  return (
    <Grid
      gridRef={ref}
      rowData={SAMPLE}
      columnDefs={BASE_COLUMNS}
      isExternalFilterPresent={() => status !== '전체'}
      doesExternalFilterPass={node => node.data.status === status}
      onGridReady={() => {}}
      key={status}
    />
  );
}

export default [
  {
    id: 'sorting',
    category: CAT,
    name: '정렬',
    desc: '헤더 클릭 정렬, Shift(또는 Ctrl)+클릭 다중 정렬, comparator 로 커스텀 순서, sortingOrder 로 순환 순서 지정.',
    keywords: ['sort', 'sortable', 'sortIndex', 'multiSortKey', 'sortingOrder', 'comparator', 'accentedSort', 'postSortRows', 'onSortChanged', 'applyColumnState', 'suppressMultiSort'],
    controls: [
      { key: 'multiKey', type: 'select', options: ['shift', 'ctrl'], default: 'shift', desc: 'multiSortKey' },
      { key: 'order', type: 'select', options: ['asc-first', 'desc-first'], default: 'asc-first', desc: 'sortingOrder' },
      { key: 'accented', type: 'boolean', default: false, desc: 'accentedSort (localeCompare)' },
    ],
    render: (p, ctx) => <Sorting p={p} ctx={ctx} />,
    code: p => `<AgGridReact${p.multiKey === 'ctrl' ? "\n  multiSortKey=\"ctrl\"" : ''}${p.order === 'desc-first' ? "\n  sortingOrder={['desc', 'asc', null]}" : ''}${p.accented ? '\n  accentedSort' : ''}
  columnDefs={[
    { field: 'status', comparator: (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b) },
  ]}
  onSortChanged={e => console.log(e.api.getColumnState())}
/>

api.applyColumnState({ state: [{ colId: 'rowCnt', sort: 'desc' }], defaultState: { sort: null } });`,
  },
  {
    id: 'column-filters',
    category: CAT,
    name: '컬럼 필터 (텍스트/숫자/날짜/Set)',
    desc: '헤더의 필터 아이콘. agTextColumnFilter / agNumberColumnFilter / agDateColumnFilter / agSetColumnFilter(filter: true 기본). 조건 2개(AND/OR), setFilterModel 로 코드 제어.',
    keywords: ['filter', 'agTextColumnFilter', 'agNumberColumnFilter', 'agDateColumnFilter', 'agSetColumnFilter', 'filterParams', 'setFilterModel', 'getFilterModel', 'setColumnFilterModel', 'getColumnFilterInstance', 'onFilterChanged', 'maxNumConditions', 'buttons', 'debounceMs', 'filterValueGetter', 'inRange'],
    controls: [],
    render: (p, ctx) => <ColumnFilters ctx={ctx} />,
    code: () => `const columnDefs = [
  { field: 'id', filter: 'agNumberColumnFilter' },
  { field: 'taskName', filter: 'agTextColumnFilter' },
  { field: 'dbms', filter: 'agSetColumnFilter' },
  { field: 'owner', filter: true },                       // 기본 = Set 필터
  { field: 'updatedAt', filter: 'agDateColumnFilter' },
];

api.setFilterModel({
  dbms: { filterType: 'set', values: ['Oracle', 'Tibero'] },
  rowCnt: { filterType: 'number', type: 'inRange', filter: 1000000, filterTo: 3000000 },
});`,
    usage: {
      file: 'page/work/workGroup/WorkGroupList.jsx',
      code: `{
  headerName: '테이블',
  field: 'tbl_name',
  flex: 0.7,
  filter: 'agTextColumnFilter',
  filterParams: { maxNumConditions: 1 },
},`,
    },
  },
  {
    id: 'quick-filter',
    category: CAT,
    name: '빠른 검색 (Quick Filter)',
    desc: 'quickFilterText 한 줄로 모든 컬럼을 검색합니다. 공백으로 나눈 단어는 AND.',
    keywords: ['quickFilterText', 'getQuickFilterText', 'quickFilterParser', 'quickFilterMatcher', 'includeHiddenColumnsInQuickFilter', 'resetQuickFilter'],
    controls: [],
    render: () => <QuickFilter />,
    code: () => `const [text, setText] = useState('');

<input value={text} onChange={e => setText(e.target.value)} />
<AgGridReact quickFilterText={text} rowData={rowData} columnDefs={columnDefs} />`,
  },
  {
    id: 'floating-filters',
    category: CAT,
    name: '플로팅 필터',
    desc: 'floatingFilter: true 면 헤더 아래에 필터 입력 줄이 생깁니다. 텍스트/숫자/날짜는 바로 입력, Set·복합 조건은 요약 표시.',
    keywords: ['floatingFilter', 'floatingFilterComponent', 'floatingFilterComponentParams', 'suppressFloatingFilterButton', 'floatingFiltersHeight'],
    controls: [{ key: 'button', type: 'boolean', default: true, desc: '필터 버튼 표시 (suppressFloatingFilterButton 반대)' }],
    render: p => <Floating p={p} />,
    code: p => `<AgGridReact
  defaultColDef={{ floatingFilter: true${p.button ? '' : ', suppressFloatingFilterButton: true'} }}
  columnDefs={columnDefs}
/>`,
  },
  {
    id: 'custom-filter',
    category: CAT,
    name: '커스텀 필터 컴포넌트',
    desc: 'colDef.filter 에 컴포넌트를 넘깁니다. reactive 방식: props.model / onModelChange + useGridFilter({ doesFilterPass }). reactiveCustomComponents: false 면 ref 로 isFilterActive / doesFilterPass / getModel / setModel 을 노출하는 구형 방식.',
    keywords: ['filter', 'useGridFilter', 'doesFilterPass', 'onModelChange', 'model', 'getValue', 'afterGuiAttached', 'isFilterActive', 'getModel', 'setModel', 'filterChangedCallback', 'reactiveCustomComponents', 'getColumnFilterInstance'],
    controls: [],
    render: (p, ctx) => <CustomFilter ctx={ctx} />,
    code: () => `import { useGridFilter } from 'ag-grid-react';

function MinCountFilter({ model, onModelChange, getValue }) {
  const doesFilterPass = useCallback(({ node }) => getValue(node) >= model, [model]);
  useGridFilter({ doesFilterPass });
  return (
    <div>
      {[null, 1000000, 2500000].map(v => (
        <label key={v}><input type="radio" checked={model === v} onChange={() => onModelChange(v)} /> {v ?? '전체'}</label>
      ))}
    </div>
  );
}

<AgGridReact columnDefs={[{ field: 'rowCnt', filter: MinCountFilter }]} />`,
  },
  {
    id: 'advanced-filter',
    category: CAT,
    name: '고급 필터 (식 / 빌더)',
    desc: '헤더 위 입력줄에 [컬럼] 연산자 값 식을 AND/OR/괄호로 조합합니다. 빌더 팝업으로 조건을 편집할 수도 있습니다. 켜면 컬럼별 필터는 비활성화됩니다.',
    keywords: ['enableAdvancedFilter', 'setAdvancedFilterModel', 'getAdvancedFilterModel', 'showAdvancedFilterBuilder', 'hideAdvancedFilterBuilder', 'includeHiddenColumnsInAdvancedFilter', 'join', 'AND', 'OR'],
    controls: [],
    render: (p, ctx) => <Advanced ctx={ctx} />,
    code: () => `<AgGridReact enableAdvancedFilter ... />

// 입력줄 예:  [DBMS] = "Oracle" AND ([행 수] > 4000000 OR [상태] = "오류")
api.setAdvancedFilterModel({
  filterType: 'join', type: 'AND',
  conditions: [
    { filterType: 'text', colId: 'dbms', type: 'equals', filter: 'Oracle' },
    { filterType: 'number', colId: 'rowCnt', type: 'greaterThan', filter: 4000000 },
  ],
});`,
  },
  {
    id: 'external-filter',
    category: CAT,
    name: '외부 필터',
    desc: '그리드 밖 UI 상태로 행을 거릅니다. isExternalFilterPresent + doesExternalFilterPass, 상태가 바뀌면 api.onFilterChanged().',
    keywords: ['isExternalFilterPresent', 'doesExternalFilterPass', 'onFilterChanged'],
    controls: [{ key: 'status', type: 'select', options: ['전체', '대기', '진행', '완료', '오류'], default: '진행' }],
    render: p => <External p={p} />,
    code: p => `const statusRef = useRef('${p.status}');

<AgGridReact
  isExternalFilterPresent={() => statusRef.current !== '전체'}
  doesExternalFilterPass={node => node.data.status === statusRef.current}
/>

// 상태 변경 시
statusRef.current = next;
gridRef.current.api.onFilterChanged();`,
  },
];
