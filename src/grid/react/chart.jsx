// 통합 차트 렌더러 (SVG) + 차트 창
import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CHART_TYPES, CROSS_FILTER_TYPES } from '../core/charts.js';
import { downloadFile } from '../core/utils.js';
import { Icon } from './common.jsx';
import { PopupLayer, usePopupPosition } from './popup.jsx';

const PALETTE = ['#5090dc', '#ffa03a', '#459d55', '#34bfe1', '#e1cc00', '#9669cb', '#b5b5b5', '#bd5a2a', '#78e0a8', '#fd5c5c'];

function niceScale(min, max, ticks = 5) {
  if (min === max) {
    min = min > 0 ? 0 : min - 1;
    max = max > 0 ? max : max + 1;
  }
  const span = max - min;
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e9) / 1e9);
  return { lo, hi, ticks: out };
}

const fmt = v => (Math.abs(v) >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${+(v / 1e3).toFixed(1)}K` : `${+v.toFixed(2)}`);

export function ChartSvg({ data, type, width, height, title }) {
  const { categories, series, cross } = data;
  // 크로스 필터: 전체(옅게) 위에 걸러진 값(진하게), 누르면 그 카테고리로 필터
  const click = ci => (cross ? { onClick: e => cross.onClick(ci, e), style: { cursor: 'pointer' } } : {});
  const dim = ci => cross && cross.selected.size > 0 && !cross.selected.has(ci);
  const top = title ? 34 : 14;
  const legendH = 28;
  const pad = { top, right: 16, bottom: 44 + legendH, left: 56 };
  const W = width;
  const H = height;
  const pw = Math.max(10, W - pad.left - pad.right);
  const ph = Math.max(10, H - pad.top - pad.bottom);
  const color = i => PALETTE[i % PALETTE.length];
  const n = categories.length;
  const els = [];
  let legend = series.map((s, i) => ({ name: s.name, color: color(i) }));

  if (!series.length || !n) {
    return (
      <svg width={W} height={H} className="r2-chart-svg">
        <text x={W / 2} y={H / 2} textAnchor="middle" fill="currentColor" opacity="0.6">
          숫자 컬럼이 포함된 범위를 선택하세요
        </text>
      </svg>
    );
  }

  if (type === 'pie' || type === 'donut') {
    const s = cross ? { ...series[0], values: series[0].totals } : series[0];
    const total = s.values.reduce((a, v) => a + Math.max(0, v), 0) || 1;
    const cx = pad.left + pw / 2;
    const cy = pad.top + ph / 2;
    const r = Math.min(pw, ph) / 2;
    const ri = type === 'donut' ? r * 0.55 : 0;
    let a0 = -Math.PI / 2;
    s.values.forEach((v, i) => {
      const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, ang) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
      const slice = ro =>
        ri
          ? `M${p(ro, a0)}A${ro},${ro} 0 ${large} 1 ${p(ro, a1)}L${p(ri, a1)}A${ri},${ri} 0 ${large} 0 ${p(ri, a0)}Z`
          : `M${cx},${cy}L${p(ro, a0)}A${ro},${ro} 0 ${large} 1 ${p(ro, a1)}Z`;
      const tip = cross
        ? `${categories[i]}: 전체 ${v.toLocaleString()} / 필터 ${series[0].values[i].toLocaleString()}`
        : `${categories[i]}: ${v.toLocaleString()} (${((v / total) * 100).toFixed(1)}%)`;
      // 크로스 필터: 조각 = 전체(옅게), 안쪽부터 걸러진 비율만큼 진하게 (넓이 비례)
      const ratio = cross ? Math.max(0, Math.min(1, v > 0 ? series[0].values[i] / v : 0)) : 1;
      els.push(
        <path key={i} d={slice(r)} fill={color(i)} opacity={cross ? 0.25 : 1} stroke="var(--r2-background-color, #fff)" strokeWidth="1" {...click(i)}>
          <title>{tip}</title>
        </path>,
      );
      if (cross && ratio > 0) {
        els.push(
          <path key={`f${i}`} d={slice(Math.sqrt(ri * ri + (r * r - ri * ri) * ratio))} fill={color(i)} {...click(i)}>
            <title>{tip}</title>
          </path>,
        );
      }
      a0 = a1;
    });
    legend = categories.map((c, i) => ({ name: c, color: color(i) }));
  } else {
    const horizontal = type === 'groupedBar' || type === 'stackedBar';
    const stacked = /stacked|normalized/i.test(type);
    const normalized = type === 'normalizedColumn';
    // 값 범위
    let min = 0;
    let max = 0;
    const totals = categories.map((_, ci) => series.reduce((a, s) => a + s.values[ci], 0));
    if (stacked) {
      categories.forEach((_, ci) => {
        let pos = 0;
        let neg = 0;
        series.forEach(s => {
          const v = normalized ? (s.values[ci] / (totals[ci] || 1)) * 100 : s.values[ci];
          if (v >= 0) pos += v;
          else neg += v;
        });
        max = Math.max(max, pos);
        min = Math.min(min, neg);
      });
    } else {
      series.forEach(s => [...s.values, ...(cross ? s.totals : [])].forEach(v => {
        max = Math.max(max, v);
        min = Math.min(min, v);
      }));
    }
    const sc = niceScale(min, normalized ? 100 : max);
    const valLen = horizontal ? pw : ph;
    const vpos = v => ((v - sc.lo) / (sc.hi - sc.lo)) * valLen;
    // 그리드 라인 + 값 축
    sc.ticks.forEach((t, i) => {
      if (horizontal) {
        const x = pad.left + vpos(t);
        els.push(<line key={`g${i}`} x1={x} x2={x} y1={pad.top} y2={pad.top + ph} stroke="currentColor" opacity="0.12" />);
        els.push(<text key={`t${i}`} x={x} y={pad.top + ph + 14} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.7">{normalized ? `${t}%` : fmt(t)}</text>);
      } else {
        const y = pad.top + ph - vpos(t);
        els.push(<line key={`g${i}`} x1={pad.left} x2={pad.left + pw} y1={y} y2={y} stroke="currentColor" opacity="0.12" />);
        els.push(<text key={`t${i}`} x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.7">{normalized ? `${t}%` : fmt(t)}</text>);
      }
    });
    const band = (horizontal ? ph : pw) / n;
    // 카테고리 축 라벨 (너무 많으면 간격 두고)
    const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((horizontal ? ph : pw) / (horizontal ? 16 : 48)))));
    categories.forEach((c, ci) => {
      if (ci % every) return;
      const label = String(c).length > 10 ? `${String(c).slice(0, 9)}…` : c;
      if (horizontal) {
        els.push(<text key={`c${ci}`} x={pad.left - 6} y={pad.top + band * ci + band / 2 + 3} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.8">{label}</text>);
      } else {
        els.push(<text key={`c${ci}`} x={pad.left + band * ci + band / 2} y={pad.top + ph + 14} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.8">{label}</text>);
      }
    });
    const zero = vpos(0);
    if (type === 'line' || type === 'area' || type === 'stackedArea') {
      const acc = categories.map(() => 0);
      const cx = ci => pad.left + band * ci + band / 2;
      series.forEach((s, si) => {
        const base = acc.slice();
        const ys = s.values.map((v, ci) => {
          const val = type === 'stackedArea' ? (acc[ci] += v) : v;
          return pad.top + ph - vpos(val);
        });
        const line = ys.map((y, ci) => `${ci ? 'L' : 'M'}${cx(ci)},${y}`).join('');
        if (type !== 'line') {
          const back = type === 'stackedArea' ? base.map((b, ci) => `L${cx(ci)},${pad.top + ph - vpos(b)}`).reverse().join('') : `L${cx(n - 1)},${pad.top + ph - zero}L${cx(0)},${pad.top + ph - zero}`;
          els.push(<path key={`a${si}`} d={`${line}${back}Z`} fill={color(si)} opacity="0.35" />);
        }
        els.push(<path key={`l${si}`} d={line} fill="none" stroke={color(si)} strokeWidth="2" />);
        ys.forEach((y, ci) =>
          els.push(
            <circle key={`p${si}-${ci}`} cx={cx(ci)} cy={y} r={cross ? 5 : 3} fill={color(si)} opacity={dim(ci) ? 0.3 : 1} {...click(ci)}>
              <title>{`${s.name} · ${categories[ci]}: ${s.values[ci].toLocaleString()}`}</title>
            </circle>,
          ),
        );
      });
    } else {
      const inner = band * 0.8;
      const pos = categories.map(() => 0);
      const neg = categories.map(() => 0);
      series.forEach((s, si) => {
        s.values.forEach((raw, ci) => {
          const v = normalized ? (raw / (totals[ci] || 1)) * 100 : raw;
          let v0;
          let v1;
          let off;
          let thick;
          if (stacked) {
            if (v >= 0) {
              v0 = pos[ci];
              v1 = pos[ci] += v;
            } else {
              v0 = neg[ci];
              v1 = neg[ci] += v;
            }
            off = band * ci + (band - inner) / 2;
            thick = inner;
          } else {
            v0 = 0;
            v1 = v;
            thick = inner / series.length;
            off = band * ci + (band - inner) / 2 + thick * si;
          }
          const toRect = (w0, w1) => {
            const a = vpos(Math.min(w0, w1));
            const len = Math.max(1, Math.abs(vpos(w1) - vpos(w0)));
            return horizontal
              ? { x: pad.left + a, y: pad.top + off, width: len, height: Math.max(1, thick - 1) }
              : { x: pad.left + off, y: pad.top + ph - a - len, width: Math.max(1, thick - 1), height: len };
          };
          const rect = toRect(v0, v1);
          if (cross) {
            const t = s.totals[ci];
            els.push(
              <rect key={`t${si}-${ci}`} {...toRect(0, t)} fill={color(si)} opacity="0.25" {...click(ci)}>
                <title>{`${s.name} · ${categories[ci]}: 전체 ${t.toLocaleString()} / 필터 ${raw.toLocaleString()}`}</title>
              </rect>,
            );
          }
          els.push(
            <rect key={`b${si}-${ci}`} {...rect} fill={color(si)} {...click(ci)}>
              <title>{`${s.name} · ${categories[ci]}: ${raw.toLocaleString()}${normalized ? ` (${v.toFixed(1)}%)` : ''}`}</title>
            </rect>,
          );
        });
      });
    }
    // 축선
    els.push(
      horizontal ? (
        <line key="axis" x1={pad.left + zero} x2={pad.left + zero} y1={pad.top} y2={pad.top + ph} stroke="currentColor" opacity="0.4" />
      ) : (
        <line key="axis" x1={pad.left} x2={pad.left + pw} y1={pad.top + ph - zero} y2={pad.top + ph - zero} stroke="currentColor" opacity="0.4" />
      ),
    );
  }
  // 범례
  const items = legend.slice(0, 12);
  const itemW = Math.min(140, (W - 20) / Math.max(1, items.length));
  const lx0 = Math.max(10, (W - itemW * items.length) / 2);
  return (
    <svg width={W} height={H} className="r2-chart-svg" xmlns="http://www.w3.org/2000/svg" fontFamily="inherit">
      {title && (
        <text x={W / 2} y={20} textAnchor="middle" fontSize="13" fontWeight="600" fill="currentColor">
          {title}
        </text>
      )}
      {els}
      {items.map((l, i) => (
        <g key={i} transform={`translate(${lx0 + itemW * i},${H - legendH + 8})`}>
          <rect width="10" height="10" rx="2" fill={l.color} />
          <text x="14" y="9" fontSize="11" fill="currentColor">
            {String(l.name).length > 14 ? `${String(l.name).slice(0, 13)}…` : l.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

// SVG → PNG data URL
export function svgToPng(svgEl, background = '#fff') {
  return new Promise(resolve => {
    const clone = svgEl.cloneNode(true);
    const color = getComputedStyle(svgEl).color;
    clone.setAttribute('style', `color:${color};font-family:sans-serif`);
    const xml = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    const w = svgEl.width.baseVal.value;
    const h = svgEl.height.baseVal.value;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * 2;
      c.height = h * 2;
      const ctx = c.getContext('2d');
      ctx.scale(2, 2);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/png'));
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  });
}

function ChartPanel({ core, model, width, height, floating, onHeaderDown }) {
  const svgWrap = useRef(null);
  const data = core.getChartData(model);
  model.ref.chartElement = svgWrap.current;
  model.ref.getImageDataURL = () => svgToPng(svgWrap.current.querySelector('svg'), getComputedStyle(svgWrap.current).backgroundColor || '#fff');
  const download = async () => {
    const url = await model.ref.getImageDataURL();
    const bin = atob(url.split(',')[1]);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    downloadFile(`${model.title || 'chart'}.png`, new Blob([arr], { type: 'image/png' }));
  };
  return (
    <div className={floating ? 'r2-chart-window r2-popup-child' : 'r2-chart-wrapper'} style={{ width }}>
      <div className="r2-panel-title-bar r2-chart-title-bar" onPointerDown={onHeaderDown}>
        <span className="r2-panel-title-bar-title">
          {model.title || `${data.categoryName || '범위'} ${model.modelType === 'pivot' ? '피벗 차트' : model.modelType === 'crossFilter' ? '크로스 필터' : '차트'}`}
        </span>
        <select
          value={model.chartType}
          onPointerDown={e => e.stopPropagation()}
          onChange={e => core.updateChart({ chartId: model.chartId, chartType: e.target.value })}
        >
          {CHART_TYPES.filter(([k]) => model.modelType !== 'crossFilter' || CROSS_FILTER_TYPES.includes(k)).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <span className="r2-panel-title-bar-button" role="button" title="PNG 다운로드" onPointerDown={e => e.stopPropagation()} onClick={download}>
          <Icon name="save" />
        </span>
        <span className="r2-panel-title-bar-button" role="button" title="닫기" onPointerDown={e => e.stopPropagation()} onClick={() => core.destroyChart(model.chartId)}>
          <Icon name="cross" />
        </span>
      </div>
      <div ref={svgWrap} className="r2-chart-body">
        <ChartSvg data={data} type={model.chartType} width={width} height={height} title={model.title} />
      </div>
    </div>
  );
}

function ChartWindow({ core, model, index }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });
  const pos = usePopupPosition(
    ref,
    () => {
      const r = core.eRoot?.getBoundingClientRect();
      return r ? { x: r.left + 40 + index * 24 + drag.dx, y: r.top + 50 + index * 24 + drag.dy } : { x: 80, y: 80 };
    },
    [drag],
    core,
  );
  const parentW = core.getPopupParent()?.clientWidth || 700;
  const w = Math.max(320, Math.min(620, parentW - 24));
  const onHeaderDown = e => {
    const sx = e.clientX - drag.dx;
    const sy = e.clientY - drag.dy;
    const move = ev => setDrag({ dx: ev.clientX - sx, dy: ev.clientY - sy });
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  return createPortal(
    <PopupLayer core={core}>
      <div ref={ref} style={{ ...pos.style, maxHeight: undefined }} className="r2-chart-window-host">
        <ChartPanel core={core} model={model} width={w} height={Math.round(w * 0.6)} floating onHeaderDown={onHeaderDown} />
      </div>
    </PopupLayer>,
    core.getPopupParent(),
  );
}

function ContainerChart({ core, model }) {
  const [size, setSize] = useState({ w: 600, h: 360 });
  useLayoutEffect(() => {
    const el = model.container;
    const measure = () => setSize({ w: Math.max(240, el.clientWidth || 600), h: Math.max(180, (el.clientHeight || 400) - 36) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [model.container]);
  return createPortal(
    <div className={`r2-popup r2-theme-vars r2-theme-quartz ${core.theme?.className || ''}`} style={{ position: 'static', width: '100%', height: '100%' }}>
      <ChartPanel core={core} model={model} width={size.w} height={size.h} />
    </div>,
    model.container,
  );
}

export function ChartsHost({ core }) {
  if (!core.charts?.size) return null;
  return [...core.charts.values()].map((m, i) =>
    m.container ? <ContainerChart key={m.chartId} core={core} model={m} /> : <ChartWindow key={m.chartId} core={core} model={m} index={i} />,
  );
}
