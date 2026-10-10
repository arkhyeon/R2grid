import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGridFilter } from '../../grid/index.js';
import { BASE_COLUMNS, SAMPLE } from '../data.js';
import { Grid } from './_shared.jsx';

const CAT = '필터 · 정렬';

const FILTER_COLS = [
  { field: 'id', headerName: 'ID', width: 90, filter: 'r2NumberColumnFilter' },
  { field: 'taskName', headerName: '작업명', width: 150, filter: 'r2TextColumnFilter' },
  { field: 'dbms', headerName: 'DBMS', width: 120, filter: 'r2SetColumnFilter' },
  { field: 'owner', headerName: '소유자', width: 120, filter: true },
  { field: 'rowCnt', headerName: '행 수', width: 130, filter: 'r2NumberColumnFilter', valueFormatter: p => p.value.toLocaleString() },
  { field: 'updatedAt', headerName: '수정일', width: 130, filter: 'r2DateColumnFilter', cellDataType: 'dateString' },
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

// 날짜 입력 사용자 컴포넌트 예: 'YYYY.MM.DD' 로 직접 타이핑 + 오늘 버튼
function DotDateInput({ date, onDateChanged, placeholder }) {
  const fmt = d => (d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '');
  const [text, setText] = useState(() => fmt(date));
  useEffect(() => setText(fmt(date)), [date?.getTime()]);
  return (
    <span style={{ display: 'flex', gap: 4, width: '100%' }}>
      <input
        className="r2-input-field-input r2-text-field-input"
        style={{ flex: 1, minWidth: 0 }}
        placeholder={placeholder || 'YYYY.MM.DD'}
        value={text}
        onChange={e => {
          const v = e.target.value;
          setText(v);
          const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/.exec(v.trim());
          if (m) onDateChanged(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
          else if (!v.trim()) onDateChanged(null);
        }}
      />
      <button type="button" onClick={() => onDateChanged(new Date())}>
        오늘
      </button>
    </span>
  );
}

function ColumnFilters({ p, ctx }) {
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
        key={String(p.dateComponent)}
        gridRef={ref}
        rowData={SAMPLE}
        columnDefs={FILTER_COLS}
        dateComponent={p.dateComponent ? DotDateInput : undefined}
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
// 핸들러 방식: 컴포넌트는 state.model 을 그리고 바꾸기만 — 거르기·모델 보관은 그리드
function RangeFilterView({ state, onModelChange, onAction }) {
  const m = state?.model || {};
  const set = (k, v) => onModelChange({ ...m, [k]: v === '' ? undefined : Number(v) });
  return (
    <div style={{ display: 'grid', gap: 6, padding: 8, width: 200 }}>
      <label>
        이상 <input type="number" value={m.from ?? ''} onChange={e => set('from', e.target.value)} onKeyDown={e => e.key === 'Enter' && onAction('apply')} style={{ width: 120 }} />
      </label>
      <label>
        이하 <input type="number" value={m.to ?? ''} onChange={e => set('to', e.target.value)} onKeyDown={e => e.key === 'Enter' && onAction('apply')} style={{ width: 120 }} />
      </label>
    </div>
  );
}
const RANGE_HANDLER = () => ({
  doesFilterPass: ({ model, data }) => (model.from == null || data.rowCnt >= model.from) && (model.to == null || data.rowCnt <= model.to),
  getModelAsString: m => (m ? `${m.from?.toLocaleString() ?? ''} ~ ${m.to?.toLocaleString() ?? ''}` : ''),
});

function CustomFilter({ p, ctx }) {
  const ref = useRef(null);
  if (p.handler) {
    return (
      <>
        <div className="pg-toolbar">
          <button onClick={() => ref.current.api.setFilterModel({ rowCnt: { from: 1_000_000, to: 2_000_000 } })}>setFilterModel(100만~200만)</button>
          <button onClick={() => ref.current.api.doFilterAction({ action: 'reset' })}>doFilterAction(reset)</button>
          <span className="pg-note">행 수 필터: 값 입력 → 적용 버튼 (Enter 도 적용)</span>
        </div>
        <Grid
          key="handler"
          gridRef={ref}
          rowData={SAMPLE}
          enableFilterHandlers
          filterHandlers={{ range: RANGE_HANDLER }}
          defaultColDef={{ floatingFilter: true }}
          columnDefs={BASE_COLUMNS.map(c => (c.field === 'rowCnt' ? { ...c, filter: { component: RangeFilterView, handler: 'range' }, filterParams: { buttons: ['reset', 'apply'] } } : c))}
          onFilterChanged={e => ctx.log(`filterChanged → ${e.api.getDisplayedRowCount()}행 · model=${JSON.stringify(e.api.getFilterModel())}`)}
        />
      </>
    );
  }
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

function Advanced({ p, ctx }) {
  const ref = useRef(null);
  const [outer, setOuter] = useState(null);
  return (
    <>
      {p.outside && (
        <div ref={setOuter} style={{ marginBottom: 8 }}>
          <span className="pg-note">↓ 그리드 밖(페이지 상단 검색 영역 등)에 둔 고급 필터 입력줄</span>
        </div>
      )}
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
        key={`${p.outside}`}
        gridRef={ref}
        height={400}
        rowData={SAMPLE}
        columnDefs={BASE_COLUMNS}
        enableAdvancedFilter
        advancedFilterParent={p.outside ? outer : null}
        advancedFilterParams={{ buttons: p.buttons === 'all' ? ['apply', 'clear', 'reset', 'cancel'] : ['apply'] }}
        advancedFilterBuilderParams={{ showMoveButtons: p.move }}
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
      {
        key: 'multiKey',
        type: 'select',
        default: 'shift',
        label: 'multiSortKey',
        desc: '여러 컬럼으로 정렬할 때 누르고 클릭할 키. 키 없이 헤더를 클릭하면 그 컬럼 하나로만 정렬합니다. 헤더에 정렬 순서 번호가 붙습니다.',
        options: [
          { value: 'shift', desc: 'Shift+헤더 클릭 = 정렬 컬럼 추가' },
          { value: 'ctrl', desc: 'Ctrl(Mac ⌘)+헤더 클릭 = 정렬 컬럼 추가' },
        ],
      },
      {
        key: 'order',
        type: 'select',
        default: 'asc-first',
        label: 'sortingOrder',
        desc: '헤더를 누를 때마다 바뀌는 정렬 순환 순서.',
        options: [
          { value: 'asc-first', desc: "['asc','desc',null] — 오름 → 내림 → 해제" },
          { value: 'desc-first', desc: "['desc','asc',null] — 내림 → 오름 → 해제 (최신순 목록에 적합)" },
        ],
      },
      {
        key: 'accented',
        type: 'boolean',
        default: false,
        label: 'accentedSort',
        desc: '문자열 비교를 localeCompare 로 할지. 악센트·한글 자모를 언어 규칙대로 비교하지만 대량 데이터에선 느립니다.',
        on: '언어 규칙 비교 (느림)',
        off: '코드값 비교 (빠름, 대부분 충분)',
      },
    ],
    render: (p, ctx) => <Sorting p={p} ctx={ctx} />,
    code: p => `<R2Grid${p.multiKey === 'ctrl' ? "\n  multiSortKey=\"ctrl\"" : ''}${p.order === 'desc-first' ? "\n  sortingOrder={['desc', 'asc', null]}" : ''}${p.accented ? '\n  accentedSort' : ''}
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
    desc: '헤더의 필터 아이콘. r2TextColumnFilter / r2NumberColumnFilter / r2DateColumnFilter / r2SetColumnFilter(filter: true 기본). 조건 2개(AND/OR), setFilterModel 로 코드 제어.',
    keywords: ['filter', 'r2TextColumnFilter', 'r2NumberColumnFilter', 'r2DateColumnFilter', 'r2SetColumnFilter', 'filterParams', 'setFilterModel', 'getFilterModel', 'setColumnFilterModel', 'getColumnFilterInstance', 'onFilterChanged', 'maxNumConditions', 'buttons', 'debounceMs', 'filterValueGetter', 'inRange', 'dateComponent', 'dateComponentParams', 'minValidYear', 'maxValidYear', 'minValidDate', 'maxValidDate'],
    controls: [
      {
        key: 'dateComponent',
        type: 'boolean',
        default: false,
        label: 'dateComponent',
        desc: "날짜 필터의 입력 칸을 직접 만든 컴포넌트로 바꿉니다. props 로 date(Date|null)·onDateChanged(Date|null)·placeholder 를 받습니다. 그리드 전체(gridOptions), 컬럼(colDef), 필터(filterParams) 어디에 둬도 되고 좁은 쪽이 우선. 추가 값은 dateComponentParams.",
        on: "'YYYY.MM.DD' 직접 입력 + 오늘 버튼 (수정일 컬럼 필터에서 확인)",
        off: '브라우저 기본 날짜 입력',
      },
    ],
    render: (p, ctx) => <ColumnFilters p={p} ctx={ctx} />,
    code: () => `const columnDefs = [
  { field: 'id', filter: 'r2NumberColumnFilter' },
  { field: 'taskName', filter: 'r2TextColumnFilter' },
  { field: 'dbms', filter: 'r2SetColumnFilter' },
  { field: 'owner', filter: true },                       // 기본 = Set 필터
  { field: 'updatedAt', filter: 'r2DateColumnFilter' },
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
  filter: 'r2TextColumnFilter',
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
<R2Grid quickFilterText={text} rowData={rowData} columnDefs={columnDefs} />`,
  },
  {
    id: 'floating-filters',
    category: CAT,
    name: '플로팅 필터',
    desc: 'floatingFilter: true 면 헤더 아래에 필터 입력 줄이 생깁니다. 텍스트/숫자/날짜는 바로 입력, Set·복합 조건은 요약 표시.',
    keywords: ['floatingFilter', 'floatingFilterComponent', 'floatingFilterComponentParams', 'suppressFloatingFilterButton', 'floatingFiltersHeight'],
    controls: [{
        key: 'button',
        type: 'boolean',
        default: true,
        label: 'suppressFloatingFilterButton (반대)',
        desc: '플로팅 필터 칸 오른쪽의 필터 버튼 표시 여부. 버튼은 전체 필터 팝업(조건 선택·AND/OR)을 엽니다. 칸에 직접 입력하면 기본 조건(포함/같음)으로 바로 걸립니다.',
        on: '칸 + 버튼 — 세부 조건은 버튼으로',
        off: '입력 칸만 (suppressFloatingFilterButton: true)',
      }],
    render: p => <Floating p={p} />,
    code: p => `<R2Grid
  defaultColDef={{ floatingFilter: true${p.button ? '' : ', suppressFloatingFilterButton: true'} }}
  columnDefs={columnDefs}
/>`,
  },
  {
    id: 'custom-filter',
    category: CAT,
    name: '커스텀 필터 컴포넌트',
    desc: 'colDef.filter 에 컴포넌트를 넘깁니다. reactive 방식: props.model / onModelChange + useGridFilter({ doesFilterPass }). reactiveCustomComponents: false 면 ref 로 isFilterActive / doesFilterPass / getModel / setModel 을 노출하는 구형 방식.',
    keywords: ['filter', 'useGridFilter', 'doesFilterPass', 'onModelChange', 'model', 'getValue', 'afterGuiAttached', 'isFilterActive', 'getModel', 'setModel', 'filterChangedCallback', 'reactiveCustomComponents', 'getColumnFilterInstance', 'enableFilterHandlers', 'filterHandlers', 'handler', 'getColumnFilterHandler', 'doFilterAction', 'onAction', 'onStateChange'],
    controls: [
      {
        key: 'handler',
        type: 'boolean',
        default: false,
        label: 'filter: { component, handler }',
        desc: "핸들러 방식. 거르기(doesFilterPass)와 화면(component)을 나눕니다. 모델은 그리드가 보관하고 component 는 state.model 을 그린 뒤 onModelChange / onAction('apply'|'clear'|'reset'|'cancel') 만 부릅니다. filterParams.buttons 에 'apply' 가 있으면 적용 버튼을 누를 때 반영. 거르기 로직은 handler(gridOptions.filterHandlers 의 키나 함수) 또는 filter.doesFilterPass.",
        on: '행 수: 범위 입력 + 적용·초기화 버튼, 플로팅 필터에 getModelAsString',
        off: 'useGridFilter 방식 (컴포넌트가 doesFilterPass 등록)',
      },
    ],
    render: (p, ctx) => <CustomFilter p={p} ctx={ctx} />,
    code: () => `import { useGridFilter } from 'r2grid';

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

<R2Grid columnDefs={[{ field: 'rowCnt', filter: MinCountFilter }]} />`,
  },
  {
    id: 'advanced-filter',
    category: CAT,
    name: '고급 필터 (식 / 빌더)',
    desc: '헤더 위 입력줄에 [컬럼] 연산자 값 식을 AND/OR/괄호로 조합합니다. 빌더 팝업으로 조건을 편집할 수도 있습니다. 켜면 컬럼별 필터는 비활성화됩니다.',
    keywords: ['enableAdvancedFilter', 'setAdvancedFilterModel', 'getAdvancedFilterModel', 'showAdvancedFilterBuilder', 'hideAdvancedFilterBuilder', 'includeHiddenColumnsInAdvancedFilter', 'join', 'AND', 'OR', 'advancedFilterParent', 'advancedFilterParams', 'advancedFilterBuilderParams', 'showMoveButtons', 'suppressBuilderButton'],
    controls: [
      {
        key: 'outside',
        type: 'boolean',
        default: false,
        label: 'advancedFilterParent',
        desc: '입력줄을 넣을 그리드 밖 DOM 요소. 페이지 상단 검색 영역 등에 두고 싶을 때. null 이면 그리드 위.',
        on: '그리드 위쪽 별도 영역에 입력줄',
        off: '그리드 안 헤더 위',
      },
      {
        key: 'buttons',
        type: 'select',
        default: 'apply',
        label: 'advancedFilterParams.buttons',
        desc: "입력줄 오른쪽 버튼과 순서. 'apply' 적용, 'clear' 입력만 비움, 'reset' 비우고 해제까지, 'cancel' 적용된 식으로 되돌림. suppressBuilderButton 으로 빌더 버튼 숨김.",
        options: [
          { value: 'apply', desc: "['apply'] (기본)" },
          { value: 'all', desc: "['apply', 'clear', 'reset', 'cancel']" },
        ],
      },
      {
        key: 'move',
        type: 'boolean',
        default: true,
        label: 'advancedFilterBuilderParams.showMoveButtons',
        desc: '빌더에서 조건·그룹을 위/아래로 옮기는 버튼. 이 밖에 minWidth(팝업 최소 폭), buttons(아래 버튼 목록)도 정할 수 있습니다.',
        on: '조건마다 ▲▼ 버튼',
        off: '이동 버튼 없음',
      },
    ],
    render: (p, ctx) => <Advanced p={p} ctx={ctx} />,
    code: () => `<R2Grid enableAdvancedFilter ... />

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
    controls: [{
        key: 'status',
        type: 'select',
        default: '진행',
        label: '외부 조건 (상태)',
        desc: '그리드 밖 UI 값으로 거르는 외부 필터. isExternalFilterPresent() 가 true 면 doesExternalFilterPass(node) 로 행마다 판정하고, 값이 바뀌면 api.onFilterChanged() 로 다시 거릅니다. 컬럼 필터와 AND 로 결합.',
        options: [
          { value: '전체', desc: 'isExternalFilterPresent = false — 외부 필터 꺼짐' },
          { value: '대기', desc: "상태가 '대기' 인 행만" },
          { value: '진행', desc: "상태가 '진행' 인 행만" },
          { value: '완료', desc: "상태가 '완료' 인 행만" },
          { value: '오류', desc: "상태가 '오류' 인 행만" },
        ],
      }],
    render: p => <External p={p} />,
    code: p => `const statusRef = useRef('${p.status}');

<R2Grid
  isExternalFilterPresent={() => statusRef.current !== '전체'}
  doesExternalFilterPass={node => node.data.status === statusRef.current}
/>

// 상태 변경 시
statusRef.current = next;
gridRef.current.api.onFilterChanged();`,
  },
];
