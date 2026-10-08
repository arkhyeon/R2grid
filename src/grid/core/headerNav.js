// 헤더 키보드 이동 (AG 헤더 포커스 동작)
//  - 첫 행에서 ↑ → 같은 컬럼 헤더, 헤더에서 ←→ 이동, ↑↓ 로 그룹 헤더/컬럼 헤더/플로팅 필터 줄 이동, 마지막 줄에서 ↓ → 본문 첫 행
//  - Enter: 정렬(Shift = 다중) / 그룹 헤더면 펼침·접기 / 플로팅 필터면 입력칸으로, Space: 선택 컬럼 전체 선택, Alt+↓: 컬럼 메뉴
//  - Tab / Shift+Tab: 다음·이전 헤더 (끝에서 Tab → 본문 첫 셀)
//  - suppressHeaderFocus, navigateToNextHeader, tabToNextHeader, colDef.suppressHeaderKeyboardEvent, headerFocused 이벤트
//  헤더 행 번호: 0..depth-1 = 그룹 헤더 줄, depth = 컬럼 헤더 줄, depth+1 = 플로팅 필터 줄(있을 때)

export const headerNavMethods = {
  headerRowCount() {
    const depth = this.headerGroupDepth || 0;
    return depth + 1 + (this.getFloatingFiltersHeight(1) > 0 ? 1 : 0);
  },

  // 헤더 위치 → 그 줄에서의 대상 (컬럼 줄이면 컬럼, 그룹 줄이면 그룹 또는 위로 늘린 컬럼)
  headerTargetAt(rowIndex, column) {
    const depth = this.headerGroupDepth || 0;
    if (rowIndex >= depth) return { column, group: null, floating: rowIndex > depth };
    const group = column.groupChain?.[rowIndex] || null;
    return { column, group, floating: false };
  },

  setHeaderFocus(rowIndex, colKey, source = 'api') {
    if (this.gos.suppressHeaderFocus) return false;
    const column = this.getColumn(colKey);
    if (!column) return false;
    const count = this.headerRowCount();
    rowIndex = Math.max(0, Math.min(rowIndex, count - 1));
    this.headerFocus = { rowIndex, colId: column.colId };
    this.focus = null;
    this.ensureColumnVisible?.(column.colId);
    this.notify();
    const t = this.headerTargetAt(rowIndex, column);
    this.dispatch('headerFocused', { column: t.group || column, floatingFilter: t.floating, source });
    return true;
  },

  clearHeaderFocus() {
    if (!this.headerFocus) return;
    this.headerFocus = null;
    this.notify();
  },

  // 헤더 위치 객체 (AG HeaderPosition 모양)
  headerPosition(hf) {
    if (!hf) return null;
    const column = this.getColumn(hf.colId);
    const t = this.headerTargetAt(hf.rowIndex, column);
    return { headerRowIndex: hf.rowIndex, column: t.group || column };
  },

  // 위치 함수가 돌려준 HeaderPosition → 내부 포커스로
  applyHeaderPosition(pos) {
    if (!pos) return false;
    const target = pos.column;
    const col = target?.isColumn ? target : target?.children ? firstLeaf(target) : this.getColumn(target);
    if (!col) return false;
    return this.setHeaderFocus(pos.headerRowIndex ?? this.headerGroupDepth ?? 0, col.colId, 'ui');
  },

  handleHeaderKey(e) {
    const hf = this.headerFocus;
    const cols = this.displayedColumns;
    const column = this.getColumn(hf.colId);
    if (!column) {
      this.clearHeaderFocus();
      return false;
    }
    if (column.colDef.suppressHeaderKeyboardEvent?.({ event: e, column, colDef: column.colDef, headerRowIndex: hf.rowIndex, api: this.api, context: this.gos.context })) return false;
    const rtl = this.isRtl?.();
    const key = rtl && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') ? (e.key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft') : e.key;
    const depth = this.headerGroupDepth || 0;
    const count = this.headerRowCount();
    const t = this.headerTargetAt(hf.rowIndex, column);
    // 그룹 줄에선 그룹 단위로 좌우 이동
    const spanOf = c => {
      const g = this.headerTargetAt(hf.rowIndex, c).group;
      if (!g) return [c];
      return cols.filter(x => x.groupChain?.[hf.rowIndex] === g);
    };
    const ci = cols.indexOf(column);
    const prev = () => {
      const span = spanOf(column);
      const i = cols.indexOf(span[0]) - 1;
      return i >= 0 ? cols[i] : null;
    };
    const next = () => {
      const span = spanOf(column);
      const i = cols.indexOf(span[span.length - 1]) + 1;
      return i < cols.length ? cols[i] : null;
    };
    const goBody = () => {
      if (this.pinnedTop?.length) this.focusPinned('top', 0, column.colId);
      else if (this.getRowCountInPage() > 0) this.moveFocusTo(this.pageFirstRow, column.colId);
      else return false;
      this.headerFocus = null;
      this.notify();
      return true;
    };
    // 사용자 지정 이동 (AG navigateToNextHeader / tabToNextHeader)
    const navigate = (fnName, nextPos, fallback) => {
      const fn = this.gos[fnName];
      if (typeof fn === 'function') {
        const res = fn({
          key: e.key,
          previousHeaderPosition: this.headerPosition(hf),
          nextHeaderPosition: nextPos,
          headerRowCount: count,
          event: e,
          backwards: e.shiftKey,
          api: this.api,
          context: this.gos.context,
        });
        if (res === false) return false;
        if (res === null || res === undefined) return true;
        return this.applyHeaderPosition(res) || true;
      }
      return fallback();
    };
    const posOf = (row, col) => (col ? this.headerPosition({ rowIndex: row, colId: col.colId }) : null);

    switch (key) {
      case 'ArrowLeft': {
        const c = prev();
        return navigate('navigateToNextHeader', posOf(hf.rowIndex, c), () => (c ? this.setHeaderFocus(hf.rowIndex, c.colId, 'ui') : true));
      }
      case 'ArrowRight': {
        const c = next();
        return navigate('navigateToNextHeader', posOf(hf.rowIndex, c), () => (c ? this.setHeaderFocus(hf.rowIndex, c.colId, 'ui') : true));
      }
      case 'ArrowUp': {
        if (e.altKey) return false;
        const row = hf.rowIndex - 1;
        return navigate('navigateToNextHeader', row >= 0 ? posOf(row, column) : null, () => (row >= 0 ? this.setHeaderFocus(row, column.colId, 'ui') : true));
      }
      case 'ArrowDown': {
        if (e.altKey) {
          this.openPopup({ type: 'columnMenu', column, anchorColId: column.colId });
          return true;
        }
        const row = hf.rowIndex + 1;
        return navigate('navigateToNextHeader', row < count ? posOf(row, column) : null, () => (row < count ? this.setHeaderFocus(row, column.colId, 'ui') : goBody() || true));
      }
      case 'Tab': {
        const c = e.shiftKey ? (ci > 0 ? cols[ci - 1] : null) : ci < cols.length - 1 ? cols[ci + 1] : null;
        return navigate('tabToNextHeader', posOf(hf.rowIndex, c), () => {
          if (c) return this.setHeaderFocus(hf.rowIndex, c.colId, 'ui');
          if (!e.shiftKey) return goBody();
          return false; // 첫 헤더에서 Shift+Tab → 그리드 밖으로
        });
      }
      case 'Enter': {
        if (t.group) {
          if (t.group.expandable) this.setColumnGroupOpened(t.group, !t.group.expanded, 'uiColumnExpanded');
          return true;
        }
        if (t.floating) {
          const input = this.eRoot?.querySelector(`.r2-header-row-column-filter .r2-header-cell[col-id="${CSS.escape(column.colId)}"] input`);
          input?.focus();
          return true;
        }
        if (column.isSortable?.()) {
          const multiKey = this.gos.multiSortKey === 'ctrl' ? e.ctrlKey || e.metaKey : e.shiftKey;
          this.toggleColumnSort(column, multiKey && !this.gos.suppressMultiSort);
        }
        return true;
      }
      case ' ':
        if (column.autoType === 'selection' && hf.rowIndex === depth) {
          this.toggleHeaderCheckbox();
          return true;
        }
        return false;
      case 'Escape':
        return false;
      default:
        return false;
    }
  },
};

function firstLeaf(group) {
  for (const c of group.children || []) {
    if (c.isColumn) return c;
    const x = firstLeaf(c);
    if (x) return x;
  }
  return null;
}
