// agSparklineCellRenderer — 셀 안의 작은 차트 (SVG). AG sparklineOptions 의 주요 옵션 지원:
//  type: 'line' | 'area' | 'bar', direction('horizontal'|'vertical' — bar), xKey/yKey(객체 배열), stroke, strokeWidth, fill,
//  marker{enabled,size,fill,stroke}, padding{top,right,bottom,left}, min/max, highlight 마지막/최대/최소(markerFormatter 대신 itemStyler 일부)
import React from 'react';

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function toPoints(value, opts) {
  if (!Array.isArray(value)) return [];
  return value.map((d, i) => {
    if (Array.isArray(d)) return { x: d[0], y: num(d[1]), i };
    if (d && typeof d === 'object') return { x: opts.xKey ? d[opts.xKey] : i, y: num(d[opts.yKey || 'y']), i };
    return { x: i, y: num(d), i };
  });
}

export function SparklineCell({ value, width, height, options = {}, params }) {
  const pts = toPoints(value, options);
  if (!pts.length) return null;
  const pad = { top: 4, right: 4, bottom: 4, left: 4, ...(options.padding || {}) };
  const w = Math.max(10, width - pad.left - pad.right);
  const h = Math.max(6, height - pad.top - pad.bottom);
  const ys = pts.map(p => p.y).filter(v => v != null);
  if (!ys.length) return null;
  const type = options.type || 'line';
  let min = options.min ?? Math.min(...ys);
  let max = options.max ?? Math.max(...ys);
  if (type === 'bar') {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const stroke = options.stroke || 'var(--r2-accent-color, #2196f3)';
  const fill = options.fill || 'color-mix(in srgb, transparent, var(--r2-accent-color, #2196f3) 25%)';
  const strokeWidth = options.strokeWidth ?? 1.5;
  const n = pts.length;
  const sx = i => pad.left + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const sy = v => pad.top + h - ((v - min) / (max - min)) * h;
  const style = typeof options.itemStyler === 'function' ? options.itemStyler : null;
  let body;
  if (type === 'bar') {
    const vertical = options.direction !== 'horizontal'; // AG: 'vertical' = 세로 막대(컬럼)
    const zero = vertical ? sy(0) : null;
    if (vertical) {
      const bw = Math.max(1, (w / n) * 0.8);
      body = pts.map((p, i) => {
        if (p.y == null) return null;
        const x = pad.left + (i * w) / n + (w / n - bw) / 2;
        const y = Math.min(sy(p.y), zero);
        const s = style ? style({ datum: value[i], yValue: p.y, first: i === 0, last: i === n - 1, min: p.y === Math.min(...ys), max: p.y === Math.max(...ys) }) || {} : {};
        return <rect key={i} x={x} y={y} width={bw} height={Math.max(1, Math.abs(sy(p.y) - zero))} fill={s.fill || options.fill || stroke} />;
      });
    } else {
      const bh = Math.max(1, (h / n) * 0.8);
      const sxv = v => pad.left + ((v - min) / (max - min)) * w;
      const zx = sxv(0);
      body = pts.map((p, i) => {
        if (p.y == null) return null;
        const y = pad.top + (i * h) / n + (h / n - bh) / 2;
        const s = style ? style({ datum: value[i], yValue: p.y, first: i === 0, last: i === n - 1 }) || {} : {};
        return <rect key={i} x={Math.min(sxv(p.y), zx)} y={y} width={Math.max(1, Math.abs(sxv(p.y) - zx))} height={bh} fill={s.fill || options.fill || stroke} />;
      });
    }
  } else {
    const valid = pts.filter(p => p.y != null);
    const d = valid.map((p, k) => `${k ? 'L' : 'M'}${sx(p.i).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    const area =
      type === 'area' && valid.length
        ? `${d}L${sx(valid[valid.length - 1].i).toFixed(1)},${(pad.top + h).toFixed(1)}L${sx(valid[0].i).toFixed(1)},${(pad.top + h).toFixed(1)}Z`
        : null;
    const mk = options.marker || {};
    body = (
      <>
        {area && <path d={area} fill={fill} stroke="none" />}
        <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
        {mk.enabled &&
          valid.map(p => (
            <circle key={p.i} cx={sx(p.i)} cy={sy(p.y)} r={(mk.size ?? 3) / 2} fill={mk.fill || stroke} stroke={mk.stroke || 'none'} />
          ))}
      </>
    );
  }
  return (
    <svg className="r2-sparkline" width={width} height={height} role="img" aria-label="sparkline" style={{ display: 'block' }}>
      {body}
    </svg>
  );
}
