import React, { useMemo, useRef, useState } from 'react';
import { BASE_COLUMNS, makeRows, SAMPLE } from '../data.js';
import { Grid } from './_shared.jsx';

const CAT = '행';

function Selection({ p, ctx }) {
  const rowSelection = useMemo(
    () => ({
      mode: p.mode,
      checkboxes: p.checkboxes,
      headerCheckbox: p.headerCheckbox,
      enableClickSelection: p.enableClickSelection,
      enableSelectionWithoutKeys: p.enableSelectionWithoutKeys,
      hideDisabledCheckboxes: p.hideDisabled,
      isRowSelectable: p.onlyActive ? node => node.data?.useYn : undefined,
    }),
    [p.mode, p.checkboxes, p.headerCheckbox, p.enableClickSelection, p.enableSelectionWithoutKeys, p.hideDisabled, p.onlyActive],
  );
  return (
    <Grid
      rowData={SAMPLE}
      columnDefs={[...BASE_COLUMNS, { field: 'useYn', headerName: '사용', width: 80 }]}
      rowSelection={rowSelection}
      onSelectionChanged={e => ctx.log(`selectionChanged: ${e.api.getSelectedRows().length}행 [${e.api.getSelectedRows().slice(0, 5).map(r => r.id).join(',')}${e.api.getSelectedRows().length > 5 ? '…' : ''}]`)}
    />
  );
}

function RowDrag({ p, ctx }) {
  const [rows] = useState(() => makeRows(25));
  const ref = useRef(null);
  const defs = useMemo(
    () => [{ field: 'taskName', headerName: '작업명', rowDrag: !p.entireRow, width: 170 }, ...BASE_COLUMNS.filter(c => c.field !== 'taskName')],
    [p.entireRow],
  );
  return (
    <Grid
      gridRef={ref}
      rowData={rows}
      columnDefs={defs}
      rowDragManaged={p.managed}
      rowDragEntireRow={p.entireRow}
      rowDragMultiRow={p.multiRow}
      rowSelection={p.multiRow ? { mode: 'multiRow' } : undefined}
      onRowDragEnd={e => {
        const order = [];
        e.api.forEachNode(n => order.push(n.data.id));
        ctx.log(`rowDragEnd: ${e.node.data.taskName} → index ${e.overIndex} · 순서 ${order.slice(0, 8).join(',')}…`);
      }}
    />
  );
}

function PinnedRows({ p, ctx }) {
  const [top] = useState(() => [{ id: '★', taskName: '기본 조건 (편집 가능)', dbms: 'ALL', owner: '-', rowCnt: 0, status: '고정' }]);
  const bottom = useMemo(() => [{ id: '합계', taskName: '', dbms: '', owner: '', rowCnt: SAMPLE.reduce((s, r) => s + r.rowCnt, 0), status: '' }], []);
  return (
    <Grid
      rowData={SAMPLE}
      columnDefs={BASE_COLUMNS}
      defaultColDef={{ editable: true }}
      pinnedTopRowData={p.top ? top : undefined}
      pinnedBottomRowData={p.bottom ? bottom : undefined}
      getRowStyle={x => (x.node.rowPinned ? { fontWeight: 'bold', fontStyle: x.node.rowPinned === 'top' ? 'italic' : 'normal' } : undefined)}
      singleClickEdit
      onCellEditingStopped={e => ctx.log(`cellEditingStopped rowPinned=${e.rowPinned} ${e.colDef.field}=${e.value}`)}
    />
  );
}

const ROWS40 = SAMPLE.slice(0, 40);
function RowPinning({ p, ctx }) {
  const isRowPinned = useMemo(() => (p.initial ? node => (node.data.status === '오류' && !node.data.useYn ? 'top' : null) : undefined), [p.initial]);
  return (
    <Grid
      key={String(p.initial)}
      rowData={ROWS40}
      columnDefs={BASE_COLUMNS}
      defaultColDef={{ editable: true }}
      getRowId={x => String(x.data.id)}
      enableRowPinning={p.mode === 'both' ? true : p.mode}
      isRowPinned={isRowPinned}
      isRowPinnable={p.onlyActive ? node => node.data.useYn : undefined}
      onPinnedRowsChanged={e => ctx.log(`pinnedRowsChanged source=${e.source} → rowPinning ${JSON.stringify(e.api.getState().rowPinning ?? null)}`)}
    />
  );
}

function RowHeight({ p }) {
  const rows = useMemo(
    () =>
      SAMPLE.slice(0, 40).map((r, i) => ({
        ...r,
        memo: i % 3 === 0 ? '여러 줄 메모 — wrapText + autoHeight 를 켜면 내용 길이에 맞춰 행 높이가 늘어납니다. 긴 문장이 줄바꿈되어 모두 보입니다.' : '짧은 메모',
      })),
    [],
  );
  const defs = useMemo(
    () => [
      { field: 'id', width: 70 },
      { field: 'taskName', headerName: '작업명', width: 150 },
      { field: 'memo', headerName: '메모', width: 280, wrapText: p.autoHeight, autoHeight: p.autoHeight },
      { field: 'dbms', headerName: 'DBMS', width: 110 },
    ],
    [p.autoHeight],
  );
  return (
    <Grid
      key={String(p.autoHeight) + p.mode}
      rowData={rows}
      columnDefs={defs}
      rowHeight={p.mode === 'fixed' ? p.rowHeight : undefined}
      getRowHeight={p.mode === 'getRowHeight' ? x => (x.data.id % 2 ? 28 : 48) : undefined}
    />
  );
}

function FullWidth() {
  const rows = useMemo(() => SAMPLE.slice(0, 30).flatMap((r, i) => (i % 8 === 7 ? [r, { banner: `── ${Math.floor(i / 8) + 1}구간 소계: ${(i + 1) * 100}건 ──` }] : [r])), []);
  return (
    <Grid
      rowData={rows}
      columnDefs={BASE_COLUMNS}
      isFullWidthRow={x => !!x.rowNode.data?.banner}
      fullWidthCellRenderer={x => <div style={{ padding: '0 14px', lineHeight: '42px', fontWeight: 600, background: 'color-mix(in srgb, transparent, var(--r2-accent-color) 10%)' }}>{x.data.banner}</div>}
    />
  );
}

function RowSpan() {
  const rows = useMemo(() => {
    const regions = ['서울', '서울', '서울', '부산', '부산', '대구', '대구', '대구', '대구', '광주'];
    return regions.map((region, i) => ({ region, ...SAMPLE[i] }));
  }, []);
  const spanOf = x => {
    const i = x.node.rowIndex;
    const all = x.api;
    const prev = i > 0 ? all.getDisplayedRowAtIndex(i - 1)?.data.region : null;
    if (prev === x.data.region) return 1;
    let n = 1;
    while (all.getDisplayedRowAtIndex(i + n)?.data.region === x.data.region) n++;
    return n;
  };
  return (
    <Grid
      rowData={rows}
      suppressRowTransform
      columnDefs={[{ field: 'region', headerName: '지역', width: 100, rowSpan: spanOf, cellClassRules: { 'pg-span-cell': x => spanOf(x) > 1 } }, ...BASE_COLUMNS.slice(1)]}
    />
  );
}

function CellSpan({ p }) {
  const rows = useMemo(() => [...SAMPLE.slice(0, 60)].sort((a, b) => a.dbms.localeCompare(b.dbms) || a.status.localeCompare(b.status)), []);
  return (
    <Grid
      rowData={rows}
      enableCellSpan={p.enabled}
      columnDefs={[
        { field: 'dbms', headerName: 'DBMS', width: 120, spanRows: true },
        { field: 'status', headerName: '상태', width: 90, spanRows: p.custom ? x => x.valueA === x.valueB && x.nodeA.data.dbms === x.nodeB.data.dbms : true },
        ...BASE_COLUMNS.filter(c => c.field !== 'dbms' && c.field !== 'status'),
      ]}
      cellSelection
    />
  );
}

function MasterDetail({ ctx }) {
  const rows = useMemo(() => SAMPLE.slice(0, 20).map(r => ({ ...r, steps: makeRows(4, r.id * 10).map((s, k) => ({ step: k + 1, name: `${r.taskName}-단계${k + 1}`, rowCnt: s.rowCnt, status: s.status })) })), []);
  return (
    <Grid
      rowData={rows}
      columnDefs={[{ field: 'taskName', headerName: '작업명', cellRenderer: 'r2GroupCellRenderer', width: 200 }, ...BASE_COLUMNS.slice(2)]}
      masterDetail
      detailRowHeight={200}
      onRowGroupOpened={e => ctx.log(`rowGroupOpened: ${e.data.taskName} expanded=${e.expanded}`)}
      detailCellRendererParams={{
        detailGridOptions: {
          columnDefs: [
            { field: 'step', headerName: '단계', width: 70 },
            { field: 'name', headerName: '이름', flex: 1 },
            { field: 'rowCnt', headerName: '행 수', type: 'numericColumn' },
            { field: 'status', headerName: '상태' },
          ],
        },
        getDetailRowData: x => x.successCallback(x.data.steps),
      }}
    />
  );
}

export default [
  {
    id: 'row-selection',
    category: CAT,
    name: '행 선택',
    desc: 'rowSelection 객체 하나로 선택 방식을 정합니다. 선택 결과는 api.getSelectedRows() / getSelectedNodes(), 변경은 onSelectionChanged 로 받습니다. 체크박스 컬럼 모양(폭·고정)은 선택 › 체크박스 컬럼 참고.',
    keywords: ['rowSelection', 'singleRow', 'multiRow', 'checkboxes', 'headerCheckbox', 'enableClickSelection', 'enableSelectionWithoutKeys', 'isRowSelectable', 'hideDisabledCheckboxes', 'getSelectedRows', 'getSelectedNodes', 'selectAll', 'deselectAll', 'onSelectionChanged', 'r2-Grid-SelectionColumn'],
    controls: [
      {
        key: 'mode',
        type: 'select',
        default: 'multiRow',
        label: 'rowSelection.mode',
        desc: '한 번에 선택할 수 있는 행 수. getSelectedRows() 결과와 체크박스 동작이 달라집니다.',
        options: [
          { value: 'singleRow', desc: '한 행만 — 다른 행을 고르면 이전 선택이 풀림, 헤더 체크박스 없음' },
          { value: 'multiRow', desc: '여러 행 — 체크박스 누적, Shift+클릭 범위 선택, 헤더 전체 선택 가능' },
        ],
      },
      {
        key: 'checkboxes',
        type: 'boolean',
        default: true,
        label: 'checkboxes',
        desc: '행마다 선택 체크박스를 둘지 (맨 앞 체크박스 컬럼). 함수로 행마다 정할 수도 있습니다.',
        on: '체크박스로 선택',
        off: '체크박스 없음 — 아래 enableClickSelection 을 켜야 마우스로 선택 가능',
      },
      {
        key: 'headerCheckbox',
        type: 'boolean',
        default: true,
        label: 'headerCheckbox',
        desc: 'multiRow 에서 헤더에 전체 선택 체크박스를 둘지. singleRow 에선 무시됩니다.',
        on: '헤더 체크박스로 전체 선택/해제',
        off: '헤더 비움',
      },
      {
        key: 'enableClickSelection',
        type: 'boolean',
        default: false,
        label: 'enableClickSelection',
        desc: "행(셀)을 클릭해서 선택할지. true 는 선택·해제 둘 다, 'enableSelection'/'enableDeselection' 로 한쪽만 허용할 수도 있습니다.",
        on: '행 클릭 = 선택 (Ctrl+클릭 = 추가/해제)',
        off: '클릭해도 선택 안 바뀜 — 체크박스로만',
      },
      {
        key: 'enableSelectionWithoutKeys',
        type: 'boolean',
        default: false,
        label: 'enableSelectionWithoutKeys',
        desc: 'multiRow + 클릭 선택에서 Ctrl 없이 클릭만으로 여러 행을 토글할지.',
        on: '클릭할 때마다 그 행만 선택/해제 (다른 선택 유지)',
        off: '일반 클릭은 그 행만 남기고 나머지 해제, Ctrl+클릭으로 추가',
      },
      {
        key: 'onlyActive',
        type: 'boolean',
        default: false,
        label: 'isRowSelectable',
        desc: '행마다 선택 가능 여부를 정하는 함수. 여기선 사용(useYn)=true 인 행만 허용합니다. 선택 불가 행은 체크박스가 비활성되고 전체 선택에서도 빠집니다.',
        on: "사용 '✓' 행만 선택 가능",
        off: '모든 행 선택 가능',
      },
      {
        key: 'hideDisabled',
        type: 'boolean',
        default: false,
        label: 'hideDisabledCheckboxes',
        desc: '선택 불가 행(isRowSelectable=false)의 체크박스를 비활성으로 보여줄지 아예 숨길지.',
        on: '선택 불가 행은 체크박스 숨김',
        off: '회색 비활성 체크박스 표시',
      },
    ],
    render: (p, ctx) => <Selection p={p} ctx={ctx} />,
    code: p => `<R2Grid
  rowSelection={{
    mode: '${p.mode}',
    checkboxes: ${p.checkboxes},
    headerCheckbox: ${p.headerCheckbox},
    enableClickSelection: ${p.enableClickSelection},
    enableSelectionWithoutKeys: ${p.enableSelectionWithoutKeys},${p.onlyActive ? '\n    isRowSelectable: node => node.data.useYn,' : ''}${p.hideDisabled ? '\n    hideDisabledCheckboxes: true,' : ''}
  }}
  onSelectionChanged={e => console.log(e.api.getSelectedRows())}
  ...
/>`,
    usage: {
      file: 'page/approval/ApprovalInfo/modal/ApprovalUserSelectModal.jsx',
      code: `rowSelection={{
  mode: 'multiRow',
  rowSelection: 'multiple',
  enableClickSelection: true,
  enableSelectionWithoutKeys: true,
}}`,
    },
  },
  {
    id: 'row-drag',
    category: CAT,
    name: '행 드래그',
    desc: 'rowDragManaged 는 정렬/필터가 없을 때 그리드가 직접 순서를 바꿉니다. rowDragEntireRow 는 행 어디서나, colDef.rowDrag 는 핸들로 드래그합니다. onRowDragEnd 에서 forEachNode 로 새 순서를 읽습니다.',
    keywords: ['rowDragManaged', 'rowDragEntireRow', 'rowDragMultiRow', 'rowDrag', 'rowDragText', 'onRowDragEnd', 'onRowDragMove', 'onRowDragEnter', 'forEachNode', 'suppressRowDrag'],
    controls: [
      {
        key: 'managed',
        type: 'boolean',
        default: true,
        label: 'rowDragManaged',
        desc: '그리드가 드래그 중에 행 순서를 직접 바꿀지. 정렬·필터·그룹이 걸려 있으면 순서를 정할 수 없어 동작하지 않습니다(AG 동일).',
        on: '끄는 동안 행이 실제로 이동, 놓으면 그 순서가 rowData 순서',
        off: '행은 그대로 — onRowDragMove/End 이벤트(overIndex)로 직접 처리',
      },
      {
        key: 'entireRow',
        type: 'boolean',
        default: false,
        label: 'rowDragEntireRow',
        desc: '드래그를 시작할 수 있는 위치. 켜면 행 어디서나, 끄면 colDef.rowDrag 가 있는 컬럼의 핸들(⋮⋮)에서만 시작합니다. 행 어디서나 끌면 셀 범위 선택과 겹치므로 둘 중 하나만 쓰세요.',
        on: '행 아무 데나 눌러 끌기',
        off: '작업명 컬럼의 핸들로만 끌기',
      },
      {
        key: 'multiRow',
        type: 'boolean',
        default: false,
        label: 'rowDragMultiRow',
        desc: '선택된 행 중 하나를 끌면 선택된 행 전체를 함께 옮깁니다 (여기선 multiRow 선택도 같이 켬).',
        on: '선택 행들을 묶어서 이동',
        off: '끈 행 하나만 이동',
      },
    ],
    render: (p, ctx) => <RowDrag p={p} ctx={ctx} />,
    code: p => `<R2Grid
  rowDragManaged={${p.managed}}${p.entireRow ? '\n  rowDragEntireRow' : ''}${p.multiRow ? "\n  rowDragMultiRow\n  rowSelection={{ mode: 'multiRow' }}" : ''}
  columnDefs={[{ field: 'taskName', rowDrag: ${!p.entireRow} }, ...]}
  onRowDragEnd={e => {
    const order = [];
    e.api.forEachNode(n => order.push(n.data.id));
  }}
/>`,
    usage: {
      file: 'page/work/workGroup/modal/WorkGroupPrioritySetting.jsx',
      code: `<Table
  rowNumbers
  rowData={settingTpJoinList}
  columnDefs={columnDefs}
  rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
  rowDragManaged
  animateRows
  rowDragEntireRow
  onRowDragEnd={props => props.api.refreshCells()}
/>`,
    },
  },
  {
    id: 'pinned-rows',
    category: CAT,
    name: '고정 행 (상단/하단)',
    desc: 'pinnedTopRowData / pinnedBottomRowData 로 스크롤해도 고정되는 행. 편집·스타일 가능하며 이벤트의 rowPinned 로 구분합니다.',
    keywords: ['pinnedTopRowData', 'pinnedBottomRowData', 'rowPinned', 'getPinnedTopRow', 'getPinnedBottomRowCount', 'getRowStyle', 'singleClickEdit'],
    controls: [
      {
        key: 'top',
        type: 'boolean',
        default: true,
        label: 'pinnedTopRowData',
        desc: '헤더 바로 아래에 고정되는 행 배열. 스크롤·정렬·필터에 영향받지 않습니다. 여기선 클릭 한 번으로 편집 가능한 기본 조건 행.',
        on: '상단 고정 행 1개',
        off: '상단 고정 없음',
      },
      {
        key: 'bottom',
        type: 'boolean',
        default: true,
        label: 'pinnedBottomRowData',
        desc: '맨 아래에 고정되는 행 배열. 합계 행에 주로 씁니다. 값은 그리드가 계산하지 않으므로 직접 넣어야 합니다 (자동 합계는 grandTotalRow).',
        on: '하단 합계 행 고정',
        off: '하단 고정 없음',
      },
    ],
    render: (p, ctx) => <PinnedRows p={p} ctx={ctx} />,
    code: p => `const [top] = useState(() => [defaultCondition]); // 같은 참조 유지 (편집 보존)

<R2Grid${p.top ? '\n  pinnedTopRowData={top}' : ''}${p.bottom ? '\n  pinnedBottomRowData={[totals]}' : ''}
  getRowStyle={p => (p.node.rowPinned ? { fontWeight: 'bold' } : undefined)}
  onCellEditingStopped={e => console.log(e.rowPinned, e.value)}
/>`,
    usage: {
      file: 'page/work/workGroup/work/component/ConditionInfo.jsx',
      code: `onRowDragEnd={onRowDragEnd}
defaultColDef={{ ...defaultColDef, editable: props => props.context.editable }}
pinnedTopRowData={[defaultConditionInfo]}
getRowStyle={getPinnedRowStyle}
onCellEditingStopped={onCellEditingStopped}
stopEditingWhenCellsLoseFocus
singleClickEdit
rowDragManaged`,
    },
  },
  {
    id: 'row-pinning',
    category: CAT,
    name: '행 수동 고정',
    desc: '사용자가 행을 우클릭 → "행 고정" 으로 위/아래에 고정합니다. 원본 행은 본문 제자리에 남고, 같은 data 를 쓰는 복사본이 고정 영역에 붙습니다(편집하면 둘 다 바뀜). 고정 목록은 행 id 로 기억해서 정렬·필터·데이터 갱신에도 유지되고, getState().rowPinning 으로 저장·복원됩니다.',
    keywords: ['enableRowPinning', 'isRowPinned', 'isRowPinnable', 'pinRowSubMenu', 'pinnedRowsChanged', 'rowPinning', 'pinnedSibling', '행 고정'],
    controls: [
      {
        key: 'mode',
        type: 'select',
        default: 'both',
        label: 'enableRowPinning',
        desc: '행 우클릭 메뉴에 "행 고정" 하위 메뉴를 켜고, 어느 쪽에 고정할 수 있는지 정합니다. 그룹 행·합계 행·pinnedTopRowData 행은 고정 대상이 아닙니다. 행을 구분하려면 getRowId 가 필요합니다(없으면 rowData 전체 교체 시 고정이 풀림).',
        options: [
          { value: 'both', label: 'true', desc: '위·아래 둘 다 — 메뉴에 위에 고정 / 아래에 고정 / 고정 해제' },
          { value: 'top', label: "'top'", desc: '위에만 고정 가능 (아래 고정 항목 숨김)' },
          { value: 'bottom', label: "'bottom'", desc: '아래에만 고정 가능' },
          { value: false, label: 'false', desc: '수동 고정 끔 — 메뉴 항목 없음, 이미 고정된 행도 풀림' },
        ],
      },
      {
        key: 'initial',
        type: 'boolean',
        default: true,
        label: 'isRowPinned',
        desc: "행이 처음 만들어질 때(rowData 설정·트랜잭션 추가) 호출돼 'top' | 'bottom' | null 을 돌려주면 그 위치에 바로 고정합니다. 여기선 상태 '오류' 이면서 사용 안 함인 행을 위에 고정.",
        on: "'오류'·미사용 행(4건)이 처음부터 위에 고정",
        off: '처음엔 고정 없음 — 우클릭으로만 고정',
      },
      {
        key: 'onlyActive',
        type: 'boolean',
        default: false,
        label: 'isRowPinnable',
        desc: '행마다 고정 가능 여부를 정하는 콜백. false 를 돌려준 행은 우클릭 메뉴에 "행 고정" 이 나오지 않습니다. 여기선 사용 여부(useYn)가 true 인 행만 허용.',
        on: '사용 여부 false 행은 고정 불가',
        off: '모든 데이터 행 고정 가능',
      },
    ],
    render: (p, ctx) => <RowPinning p={p} ctx={ctx} />,
    code: p => `<R2Grid
  rowData={rowData}
  columnDefs={columnDefs}
  getRowId={p => String(p.data.id)}   // 고정 행을 id 로 기억
  enableRowPinning${p.mode === 'both' ? '' : `={${p.mode === false ? 'false' : `'${p.mode}'`}}`}${p.initial ? "\n  isRowPinned={node => (node.data.status === '오류' && !node.data.useYn ? 'top' : null)}" : ''}${p.onlyActive ? '\n  isRowPinnable={node => node.data.useYn}' : ''}
  onPinnedRowsChanged={e => saveState(e.api.getState().rowPinning)}
/>

// 복원: initialState={{ rowPinning: { top: ['12'], bottom: [] } }}`,
  },
  {
    id: 'row-height',
    category: CAT,
    name: '행 높이 · 자동 높이',
    desc: 'rowHeight 고정, getRowHeight 로 행마다 다르게, wrapText + autoHeight 로 내용에 맞춰 자동 계산합니다.',
    keywords: ['rowHeight', 'getRowHeight', 'autoHeight', 'wrapText', 'resetRowHeights', 'onRowHeightChanged', 'setRowHeight'],
    controls: [
      {
        key: 'mode',
        type: 'select',
        default: 'fixed',
        label: '높이 지정 방식',
        desc: '모든 행을 같은 높이로 할지 행마다 다르게 할지. autoHeight 컬럼이 있으면 그 행은 내용 높이가 우선합니다.',
        options: [
          { value: 'fixed', desc: 'rowHeight — 전체 행 같은 높이 (아래 숫자)' },
          { value: 'getRowHeight', desc: 'getRowHeight(params) — 행마다 계산. 여기선 홀수 id 28px, 짝수 48px' },
        ],
      },
      { key: 'rowHeight', type: 'number', default: 32, label: 'rowHeight', desc: "모든 행 높이(px). '높이 지정 방식'이 fixed 일 때만 적용." },
      {
        key: 'autoHeight',
        type: 'boolean',
        default: true,
        label: 'wrapText + autoHeight',
        desc: '메모 컬럼 속성. wrapText 는 긴 글을 줄바꿈하고, autoHeight 는 그 셀 내용 높이에 맞춰 행 높이를 늘립니다. 행마다 높이를 재야 하므로 행이 아주 많으면 느려질 수 있습니다.',
        on: '긴 메모 행은 여러 줄로 커짐',
        off: '한 줄로 잘리고 … 표시',
      },
    ],
    render: p => <RowHeight p={p} />,
    code: p => `<R2Grid
  ${p.mode === 'fixed' ? `rowHeight={${p.rowHeight}}` : 'getRowHeight={p => (p.data.id % 2 ? 28 : 48)}'}
  columnDefs={[
    { field: 'memo', wrapText: ${p.autoHeight}, autoHeight: ${p.autoHeight} },
  ]}
/>`,
    usage: {
      file: 'page/work/workGroup/work/modal/WorkGroupPlanModal.jsx',
      code: `const columnDefs = [
  {
    field: 'explan',
    headerName: '실행 계획 정보',
    flex: 1,
    cellStyle: { whiteSpace: 'normal', overflowWrap: 'break-word' },
    autoHeight: true,
    valueFormatter: ({ data }) => data,
  },
];`,
    },
  },
  {
    id: 'full-width-rows',
    category: CAT,
    name: '전체 폭 행',
    desc: 'isFullWidthRow 가 true 인 행은 컬럼을 무시하고 fullWidthCellRenderer 로 행 전체를 그립니다 (배너, 소계 등).',
    keywords: ['isFullWidthRow', 'fullWidthCellRenderer', 'fullWidthCellRendererParams', 'embedFullWidthRows'],
    controls: [],
    render: () => <FullWidth />,
    code: () => `<R2Grid
  isFullWidthRow={p => !!p.rowNode.data?.banner}
  fullWidthCellRenderer={p => <div className="banner">{p.data.banner}</div>}
/>`,
  },
  {
    id: 'row-span',
    category: CAT,
    name: '행 병합 (rowSpan)',
    desc: 'colDef.rowSpan(params) 로 아래 행까지 셀을 늘립니다. AG 와 동일하게 suppressRowTransform 과 함께 사용합니다.',
    keywords: ['rowSpan', 'suppressRowTransform', 'r2-cell-span'],
    controls: [],
    render: () => <RowSpan />,
    code: () => `<R2Grid
  suppressRowTransform
  columnDefs={[
    { field: 'region', rowSpan: params => /* 같은 지역 연속 행 수 */ spanOf(params) },
  ]}
/>`,
  },
  {
    id: 'cell-span',
    category: CAT,
    name: '셀 스패닝 (같은 값 자동 병합)',
    desc: 'enableCellSpan + colDef.spanRows: 위아래로 같은 값이 이어지면 한 셀로 합칩니다. spanRows 에 함수를 주면 병합 조건을 직접 정합니다.',
    keywords: ['enableCellSpan', 'spanRows', 'valueA', 'valueB', 'cell spanning'],
    controls: [
      {
        key: 'enabled',
        type: 'boolean',
        default: true,
        label: 'enableCellSpan',
        desc: '그리드 옵션. 켜야 colDef.spanRows 가 동작합니다. 병합은 화면 표시만 바꾸고 데이터·선택·복사는 행 단위 그대로입니다.',
        on: 'DBMS·상태 컬럼에서 연속된 같은 값이 한 칸으로 합쳐짐',
        off: '모든 셀 따로 표시',
      },
      {
        key: 'custom',
        type: 'boolean',
        default: true,
        label: 'spanRows 함수',
        desc: 'spanRows 에 true 대신 함수({ valueA, valueB, nodeA, nodeB })를 주면 위아래 두 행을 합칠지 직접 정합니다. 여기선 상태 컬럼을 같은 DBMS 안에서만 합칩니다.',
        on: 'DBMS 가 바뀌면 같은 상태라도 끊김',
        off: 'spanRows: true — 값만 같으면 DBMS 경계를 넘어서도 합침',
      },
    ],
    render: p => <CellSpan p={p} />,
    code: p => `<R2Grid
  enableCellSpan={${p.enabled}}
  columnDefs={[
    { field: 'dbms', spanRows: true },
    { field: 'status', spanRows: ${p.custom ? '({ valueA, valueB, nodeA, nodeB }) => valueA === valueB && nodeA.data.dbms === nodeB.data.dbms' : 'true'} },
  ]}
/>`,
  },
  {
    id: 'master-detail',
    category: CAT,
    name: '마스터 / 디테일',
    desc: 'masterDetail + detailCellRendererParams(detailGridOptions, getDetailRowData) 로 행을 펼치면 하위 그리드가 열립니다.',
    keywords: ['masterDetail', 'detailCellRendererParams', 'detailGridOptions', 'getDetailRowData', 'detailRowHeight', 'detailRowAutoHeight', 'isRowMaster', 'r2GroupCellRenderer', 'detailCellRenderer', 'onRowGroupOpened'],
    controls: [],
    render: (p, ctx) => <MasterDetail ctx={ctx} />,
    code: () => `<R2Grid
  masterDetail
  detailRowHeight={200}
  columnDefs={[{ field: 'taskName', cellRenderer: 'r2GroupCellRenderer' }, ...]}
  detailCellRendererParams={{
    detailGridOptions: { columnDefs: detailColumns },
    getDetailRowData: params => params.successCallback(params.data.steps),
  }}
/>`,
    usage: {
      file: 'page/approval/ApprovalInfo/ApprovalCheck.jsx',
      code: `isRowMaster={isRowMaster}
rowNumbers
suppressRowTransform
detailCellRendererParams={detailCellRendererParams}
masterDetail
detailRowHeight={200}
rowSelection={rowSelection}
onCellClicked={setOpinionModal}`,
    },
  },
];
