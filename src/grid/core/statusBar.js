// 상태 표시줄(statusBar) 계산: 행 수 / 선택 수 / 범위 집계 (version 단위 캐시)
export const statusBarMethods = {
  getStatusCounts() {
    if (this.__scVersion === this.version) return this.__sc;
    let total = 0;
    let filtered = 0;
    if (this.groupMode) {
      // 그룹 모드: 리프(데이터) 행 기준
      for (const n of this.rootNodes) if (!n.group) total++;
      for (const n of this.filteredNodes || []) if (!n.group) filtered++;
    } else {
      total = this.rootNodes.length;
      filtered = this.filteredNodes ? this.filteredNodes.length : total;
    }
    this.__sc = { total, filtered, selected: this.selected.size };
    this.__scVersion = this.version;
    return this.__sc;
  },

  // 범위 선택 셀 집계: 2칸 이상일 때만. count 는 빈 값 제외, sum/min/max/avg 는 숫자만
  getStatusAggregation() {
    if (this.__saVersion === this.version) return this.__sa;
    let res = null;
    if (this.ranges.length) {
      const seen = this.ranges.length > 1 ? new Set() : null;
      let cells = 0;
      let count = 0;
      let numCount = 0;
      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      for (const r of this.ranges) {
        const b = this.rangeBounds(r);
        if (!b) continue;
        for (let ri = b.r0; ri <= b.r1; ri++) {
          const node = this.displayedNodes[ri];
          if (!node || node.detail) continue;
          for (let ci = b.c0; ci <= b.c1; ci++) {
            const col = this.displayedColumns[ci];
            if (!col || col.isAuto) continue;
            if (seen) {
              const k = `${ri}:${ci}`;
              if (seen.has(k)) continue;
              seen.add(k);
            }
            cells++;
            const v = this.getCellValue(node, col);
            if (v == null || v === '') continue;
            count++;
            const num = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null;
            if (num == null) continue;
            numCount++;
            sum += num;
            if (num < min) min = num;
            if (num > max) max = num;
          }
        }
      }
      if (cells > 1) res = { count, numCount, sum, min, max, avg: numCount ? sum / numCount : 0 };
    }
    this.__sa = res;
    this.__saVersion = this.version;
    return res;
  },

  registerStatusPanel(key, inst) {
    if (!this.statusPanels) this.statusPanels = new Map();
    if (inst) this.statusPanels.set(key, inst);
    else this.statusPanels.delete(key);
  },

  getStatusPanel(key) {
    return this.statusPanels?.get(key);
  },
};
