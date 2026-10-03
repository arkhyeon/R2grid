// Phase 4 검증용: CLM30 실제 화면 설정을 그대로 본뜬 그리드들
import React, { useMemo, useRef, useState } from 'react';
import Table from './Table.jsx';

const Section = ({ title, children, note }) => (
  <section className="p4-section">
    <h2>{title}</h2>
    {note && <p className="p4-note">{note}</p>}
    {children}
  </section>
);

// ── UserGroupRole: treeData + getDataPath + aggFunc ─────────────────
function RoleCheckbox(props, setRoles) {
  const { value, node, colDef } = props;
  const checked = colDef.field === 'read' ? value === 1 : value === 2;
  return (
    <input
      type="checkbox"
      className="role-cb"
      checked={checked}
      onChange={() => setRoles(node)}
      onClick={e => e.stopPropagation()}
    />
  );
}

function TreeDemo({ log }) {
  const [roles] = useState(() => {
    const out = [];
    let mid = 1;
    ['프로젝트', '업무', '이력'].forEach((d1, a) => {
      out.push({ mid: mid++, depth1: d1, permission: 2 });
      ['현황', '등록', '설정'].forEach((d2, b) => {
        out.push({ mid: mid++, depth1: d1, depth2: `${d1} ${d2}`, permission: (a + b) % 3 });
        if (b === 1) {
          ['상세A', '상세B'].forEach((d3, c) =>
            out.push({ mid: mid++, depth1: d1, depth2: `${d1} ${d2}`, depth3: `${d2} ${d3}`, permission: c ? 0 : 2 }),
          );
        }
      });
    });
    return out;
  });
  const columnDefs = useMemo(
    () => [
      { field: 'mid', suppressColumnsToolPanel: true, hide: true },
      { field: 'depth1', suppressColumnsToolPanel: true, hide: true },
      { field: 'depth2', suppressColumnsToolPanel: true, hide: true },
      { field: 'depth3', suppressColumnsToolPanel: true, hide: true },
      {
        headerName: '읽기',
        field: 'read',
        menuTabs: [],
        valueGetter: ({ data }) => (data.permission === 0 || !data?.permission ? 0 : 1),
        aggFunc: ({ values }) => (values.includes(0) ? 0 : 1),
        cellRenderer: 'roleCheckbox',
      },
      {
        headerName: '쓰기',
        field: 'write',
        menuTabs: [],
        valueGetter: ({ data }) => (data.permission === 2 ? 2 : 0),
        aggFunc: ({ values }) => (values.includes(0) || values.includes(1) ? 0 : 2),
        cellRenderer: 'roleCheckbox',
      },
      { field: 'permission', aggFunc: 'min', suppressColumnsToolPanel: true, hide: true },
    ],
    [],
  );
  return (
    <Table
      id="UserGroupRoleTable"
      height="330px"
      rowData={roles}
      columnDefs={columnDefs}
      defaultColDef={{ sortable: false }}
      autoGroupColumnDef={{ headerName: '메뉴', minWidth: 220, menuTabs: [] }}
      groupDefaultExpanded={1}
      treeData
      getRowId={params => String(params.data.mid)}
      getDataPath={({ depth1, depth2, depth3 }) => {
        if (depth3) return [depth1, depth2, depth3];
        if (depth2) return [depth1, depth2];
        return [depth1];
      }}
      suppressAggFuncInHeader
      animateRows
      components={{ roleCheckbox: props => RoleCheckbox(props, n => log(`roleCheckbox: ${n.key}`)) }}
    />
  );
}

// ── MessageAddress: rowGroup + groupSelectsChildren ─────────────────
const msgGridOption = {
  groupSelectsChildren: true,
  columnDefs: [{ headerName: '그룹', field: 'group', flex: 1, rowGroup: true, suppressColumnsToolPanel: true, hide: true }],
  defaultColDef: { editable: false, resizable: true, sortable: true, menuTabs: [] },
  rowSelection: { mode: 'multiRow', checkboxes: true, enableSelectionWithoutKeys: true, enableClickSelection: true },
};
function GroupDemo({ log }) {
  const ref = useRef(null);
  const userList = useMemo(
    () => ['개발팀', '운영팀', '보안팀'].flatMap((gname, gi) => Array.from({ length: 3 + gi }, (_, i) => ({ uid: `user${gi}${i}`, group: gname }))),
    [],
  );
  return (
    <>
      <Table
        id="MessageAddressTable"
        ref={ref}
        height="300px"
        rowData={userList}
        gridOptions={msgGridOption}
        columnDefs={msgGridOption.columnDefs}
        autoGroupColumnDef={{ headerCheckboxSelection: true, headerName: '유저', field: 'uid', flex: 1, cellRendererParams: { checkbox: true } }}
      />
      <button
        className="p4-btn"
        onClick={() => {
          const selectedNodes = ref.current.api.getSelectedNodes();
          log(`선택 uid: ${selectedNodes.map(n => n.data.uid).join(', ') || '(없음)'}`);
        }}
      >
        확인 (getSelectedNodes → data.uid)
      </button>
    </>
  );
}

// ── WorkGroupPlanModal: SSRM ───────────────────────────────────────
function SsrmPlanDemo({ log }) {
  const onGridReady = e => {
    e.api.setGridOption('loading', true);
    e.api.setGridOption('serverSideDatasource', {
      getRows: props => {
        log(`getRows ${props.request.startRow}~${props.request.endRow}`);
        new Promise(res => setTimeout(() => res(PLAN_ROWS), 400))
          .then(res => props.success({ rowData: res }))
          .catch(() => props.fail())
          .finally(() => props.api.setGridOption('loading', false));
      },
    });
  };
  return (
    <Table
      id="WorkGroupPlanModalTable"
      columnDefs={[
        {
          field: 'explan',
          headerName: '실행 계획 정보',
          flex: 1,
          cellStyle: { whiteSpace: 'normal', overflowWrap: 'break-word' },
          autoHeight: true,
          valueFormatter: ({ data }) => data,
        },
      ]}
      height="260px"
      cellSelection
      rowModelType="serverSide"
      onGridReady={onGridReady}
    />
  );
}
const PLAN_ROWS = [
  'SELECT STATEMENT  Cost=12',
  '  TABLE ACCESS BY INDEX ROWID TB_ORDER (cost=4 card=120)',
  '    INDEX RANGE SCAN IX_ORDER_01 — 조건: ORDER_DT BETWEEN :1 AND :2 그리고 STATUS IN (\'A\',\'B\',\'C\') 인 경우 인덱스 범위 스캔이 수행되며 이 줄은 일부러 길게 작성해서 autoHeight 로 행 높이가 늘어나는지 확인합니다.',
  '  NESTED LOOPS',
  '    TABLE ACCESS FULL TB_CUSTOMER',
];

// 대용량 SSRM (블록 단위 지연 로딩)
function SsrmLargeDemo({ log }) {
  const total = 2350;
  const logRef = useRef(log);
  logRef.current = log;
  const datasource = useMemo(
    () => ({
      getRows: params => {
        const { startRow, endRow, sortModel } = params.request;
        logRef.current(`[대용량] getRows ${startRow}~${endRow} sort=${JSON.stringify(sortModel)}`);
        setTimeout(() => {
          const desc = sortModel[0]?.colId === 'no' && sortModel[0].sort === 'desc';
          const rows = [];
          for (let i = startRow; i < Math.min(endRow, total); i++) {
            const no = desc ? total - i : i + 1;
            rows.push({ no, name: `서버행_${no}`, amount: no * 1000 });
          }
          params.success({ rowData: rows });
        }, 250);
      },
    }),
    [],
  );
  return (
    <Table
      id="SsrmLarge"
      height="260px"
      rowModelType="serverSide"
      cacheBlockSize={100}
      columnDefs={[
        { field: 'no', headerName: 'No', width: 90, flex: 0 },
        { field: 'name', headerName: '이름' },
        { field: 'amount', headerName: '금액', type: 'numericColumn', valueFormatter: p => p.value?.toLocaleString() },
      ]}
      serverSideDatasource={datasource}
    />
  );
}

// ── WorkGroupPrioritySetting + ConditionInfo: 행 드래그 / 상단 고정행 ──────────
const getPinnedRowStyle = ({ node }) => (node.rowPinned ? { fontWeight: 'bold', fontStyle: 'italic' } : 0);
function RowDragDemo({ log }) {
  const [conditionList] = useState(() =>
    Array.from({ length: 6 }, (_, i) => ({ seq: i + 1, mc_id: `COL_${i + 1}`, comp_op: i % 3, value: `값${i + 1}` })),
  );
  // CLM ConditionInfo 처럼 같은 객체 참조를 유지 (pinnedTopRowData={[defaultConditionInfo]})
  const [defaultConditionInfo] = useState(() => ({ mc_id: '', comp_op: null, value: '' }));
  return (
    <div className="p4-row2">
      <div>
        <h3>rowDragManaged + rowDragEntireRow (WorkGroupPrioritySetting)</h3>
        <Table
          id="PriorityTable"
          height="260px"
          rowData={useMemo(() => Array.from({ length: 8 }, (_, i) => ({ prio: i + 1, name: `업무그룹 ${String.fromCharCode(65 + i)}` })), [])}
          columnDefs={useMemo(() => [{ field: 'prio', headerName: '순위', width: 80, flex: 0, valueGetter: p => p.node.rowIndex + 1 }, { field: 'name', headerName: '업무그룹' }], [])}
          rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
          rowDragManaged
          animateRows
          rowDragEntireRow
          onRowDragEnd={props => {
            props.api.refreshCells();
            const order = [];
            props.api.forEachNode(n => order.push(n.data.name.slice(-1)));
            log(`rowDragEnd 순서: ${order.join('')}`);
          }}
        />
      </div>
      <div>
        <h3>colDef.rowDrag + pinnedTopRowData + singleClickEdit (ConditionInfo)</h3>
        <Table
          id="ConditionInfoTable"
          height="260px"
          context={{ editable: true }}
          rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
          rowData={conditionList}
          columnDefs={useMemo(
            () => [
              { field: 'mc_id', headerName: '컬럼', rowDrag: props => props.context.editable, flex: 1.1 },
              { field: 'comp_op', headerName: '연산자', cellEditor: 'agRichSelectCellEditor', cellEditorParams: { values: [0, 1, 2] }, valueFormatter: ({ value }) => ['=', '>', '<'][value] ?? '연산자...' },
              { field: 'value', headerName: '값' },
            ],
            [],
          )}
          defaultColDef={{ editable: props => props.context.editable }}
          pinnedTopRowData={[defaultConditionInfo]}
          getRowStyle={getPinnedRowStyle}
          onCellEditingStopped={({ rowPinned, colDef, newValue, oldValue }) =>
            log(`cellEditingStopped rowPinned=${rowPinned} ${colDef.field}: ${oldValue} → ${newValue}`)
          }
          onRowDragEnd={props => {
            const tempList = [];
            props.api.forEachNode((cl, i) => tempList.push({ ...cl.data, seq: i + 1 }));
            log(`조건 순서: ${tempList.map(t => t.mc_id).join(',')}`);
          }}
          stopEditingWhenCellsLoseFocus
          singleClickEdit
          rowDragManaged
          animateRows
        />
      </div>
    </div>
  );
}

// ── DestructionManagementControl: editType fullRow + undoRedo ─────────────
function FullRowDemo({ log }) {
  const ref = useRef(null);
  const [projectList] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `프로젝트${i + 1}`, averageWork: 10 + i, criticalRate: 50 + i })),
  );
  return (
    <>
      <Table
        id="DestructionManagementControlTable"
        rowData={projectList}
        columnDefs={useMemo(
          () => [
            { field: 'name', headerName: '프로젝트', editable: false },
            { field: 'averageWork', headerName: '평균 작업', editable: true },
            { field: 'criticalRate', headerName: '임계율', editable: true },
          ],
          [],
        )}
        rowNumbers
        onRowValueChanged={({ data }) => log(`rowValueChanged: ${JSON.stringify(data)}`)}
        undoRedoCellEditing
        editType="fullRow"
        autoSizeStrategy={{ type: 'fitCellContents' }}
        ref={ref}
        height="260px"
      />
      <button className="p4-btn" onClick={() => ref.current.api.undoCellEditing()}>
        undo (Ctrl+Z)
      </button>
      <button className="p4-btn" onClick={() => ref.current.api.redoCellEditing()}>
        redo (Ctrl+Y)
      </button>
    </>
  );
}

// ── WorkGroupList: columnGroupShow + marryChildren + column.originalParent.colGroupDef ──
const STAGE = { y: 'O', n: 'X' };
const MODEL = { 1: '원본>임시영역>분리보관', 2: '원본>분리보관', 3: '원본' };
const makeStageData = (column, data) => {
  const myColumn = column.colId;
  const parentColumn = column.originalParent.colGroupDef.field;
  const stageData = data[parentColumn];
  const stageNo = parentColumn.replace(/\D/g, '');
  const ynKey = `stage_${stageNo}_yn`;
  if (myColumn !== ynKey && stageData[ynKey] === 'n') return '';
  const v = stageData[myColumn];
  return myColumn.endsWith('_model') ? MODEL[v] : myColumn.endsWith('_yn') ? STAGE[v] : v;
};
const stageGroup = n => ({
  headerName: `${n}단계`,
  field: `stage${n}_info`,
  marryChildren: true,
  children: [
    { headerName: '파기모델', field: `stage_${n}_model`, flex: 0.73, columnGroupShow: 'open', valueGetter: ({ column, data }) => makeStageData(column, data) },
    { headerName: '사용', field: `stage_${n}_yn`, flex: 0.2, valueGetter: ({ column, data }) => makeStageData(column, data), cellStyle: { textAlign: 'center' } },
    { headerName: '추출방식', field: `stage_${n}_extr`, flex: 0.4, columnGroupShow: 'open', valueGetter: ({ column, data }) => makeStageData(column, data) },
    { headerName: '파기구분', field: `stage_${n}_type`, flex: 0.35, valueGetter: ({ column, data }) => makeStageData(column, data) },
  ],
});
function ColumnGroupDemo({ log }) {
  const [rows] = useState(() =>
    Array.from({ length: 30 }, (_, i) => {
      const r = { bs_cd_name: `업무${i + 1}`, bs_cd: `BS${String(i + 1).padStart(3, '0')}`, tbl_name: `TB_${i}` };
      [1, 2].forEach(n => {
        r[`stage${n}_info`] = {
          [`stage_${n}_yn`]: (i + n) % 3 ? 'y' : 'n',
          [`stage_${n}_model`]: (i % 3) + 1,
          [`stage_${n}_extr`]: i % 2 ? '업무맵' : '계층쿼리',
          [`stage_${n}_type`]: i % 2 ? '삭제' : '업데이트',
        };
      });
      return r;
    }),
  );
  const columnDefs = useMemo(
    () => [
      { headerName: '업무 코드명', field: 'bs_cd_name', flex: 0.5 },
      { headerName: '업무 코드', field: 'bs_cd', flex: 0.4 },
      { headerName: '테이블', field: 'tbl_name', flex: 0.7 },
      stageGroup(1),
      stageGroup(2),
    ],
    [],
  );
  return (
    <Table
      id="WorkGroupListTable"
      rowNumbers
      rowData={rows}
      columnDefs={columnDefs}
      rowSelection={{ mode: 'singleRow', checkboxes: false, enableClickSelection: true }}
      suppressRowTransform
      reactiveCustomComponents
      onColumnGroupOpened={e => log(`columnGroupOpened: ${e.columnGroup.getGroupId()} open=${e.columnGroup.isExpanded()}`)}
      onColumnMoved={e => log(`columnMoved: ${e.column?.getColId()} → ${e.toIndex}`)}
      onGridReady={e => {
        window.__wgApi = e.api;
      }}
      height="280px"
    />
  );
}

export default function Phase4Demo({ log }) {
  return (
    <div className="p4">
      <Section title="컬럼 그룹 접기 — WorkGroupList" note="columnGroupShow:'open' + marryChildren + column.originalParent.colGroupDef.field">
        <ColumnGroupDemo log={log} />
      </Section>
      <Section title="트리 데이터 — UserGroupRole" note="treeData + getDataPath + aggFunc(함수/min) + groupDefaultExpanded=1">
        <TreeDemo log={log} />
      </Section>
      <Section title="행 그룹 — MessageAddress" note="rowGroup + hide + groupSelectsChildren + autoGroupColumnDef(field: uid)">
        <GroupDemo log={log} />
      </Section>
      <Section title="SSRM — WorkGroupPlanModal" note="rowModelType=serverSide + setGridOption('serverSideDatasource') + autoHeight">
        <div className="p4-row2">
          <SsrmPlanDemo log={log} />
          <SsrmLargeDemo log={log} />
        </div>
      </Section>
      <Section title="행 드래그 / 상단 고정행">
        <RowDragDemo log={log} />
      </Section>
      <Section title="fullRow 편집 + undo/redo — DestructionManagementControl">
        <FullRowDemo log={log} />
      </Section>
    </div>
  );
}
