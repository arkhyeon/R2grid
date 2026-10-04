// 팝업 공용: body 포털 + 테마 변수 레이어 + 위치 계산(화면 밖이면 뒤집기) + 바깥 클릭 닫기
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../core/utils.js';

// 팝업도 그리드와 같은 CSS 변수(테마/다크)를 받도록 같은 클래스로 감싼다.
// 레이어는 팝업 부모(기본: 그리드 루트 래퍼) 안의 0x0 원점 — 팝업은 이 원점 기준 absolute 좌표로 놓여
// 페이지가 스크롤돼도 그리드와 함께 움직이고, 래퍼의 overflow:hidden 으로 그리드 안에 갇힌다 (AG 동일).
export function PopupLayer({ core, children }) {
  return (
    <div
      className={cx('r2-popup r2-theme-vars r2-theme-quartz', core.theme?.className)}
      data-r2-popup=""
      style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, zIndex: 1000 }}
    >
      {children}
    </div>
  );
}

// 팝업 배치: anchor(뷰포트 좌표) → 팝업 부모 경계 안으로 보정 → 레이어 기준 좌표.
//  anchor: { x, y, alignRight?, alignTo?(DOMRect), flipY?, minWidth?, clip?(DOMRect) }
//  track: 셀/헤더에 붙은 팝업 — 스크롤마다 다시 계산해 그 행/컬럼을 따라가고, clip 밖으로 나가면 숨김
export function usePopupPosition(ref, getAnchor, deps = [], core, { track = false } = {}) {
  const [pos, setPos] = useState({ x: 0, y: 0, minWidth: undefined, maxHeight: undefined, ready: false, hidden: false });
  const compute = () => {
    const el = ref.current;
    const layer = el?.parentElement;
    if (!el || !layer) return;
    const a = getAnchor();
    if (!a) {
      if (track) setPos(p => (p.hidden ? p : { ...p, hidden: true }));
      return;
    }
    const parent = core?.getPopupParent?.();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 경계 = 팝업 부모의 전체 박스 (뷰포트와 교차시키지 않음 — 페이지 스크롤로 크기·위치가 변하면 안 됨, AG 동일)
    let b = { left: 0, top: 0, right: vw, bottom: vh };
    if (parent && parent !== document.body && parent !== document.documentElement) {
      const pr = parent.getBoundingClientRect();
      b = { left: pr.left, top: pr.top, right: pr.right, bottom: pr.bottom };
    }
    const maxHeight = Math.max(80, b.bottom - b.top - 8);
    const w = el.offsetWidth;
    const h = Math.min(el.offsetHeight, maxHeight);
    let { x, y } = a;
    if (x + w > b.right - 4) x = a.alignRight != null ? a.alignRight - w : b.right - w - 4;
    if (x < b.left + 4) x = b.left + 4;
    if (y + h > b.bottom - 4) {
      if (a.alignTo && a.alignTo.top - h >= b.top + 4) y = a.alignTo.top - h;
      else if (a.flipY != null && a.flipY - h >= b.top + 4) y = a.flipY - h;
      else y = Math.max(b.top + 4, b.bottom - h - 4);
    }
    let hidden = false;
    if (a.clip && a.alignTo) {
      const c = a.clip;
      const r = a.alignTo;
      hidden = r.bottom <= c.top + 1 || r.top >= c.bottom - 1 || r.right <= c.left + 1 || r.left >= c.right - 1;
    }
    const lr = layer.getBoundingClientRect();
    setPos({ x: x - lr.left, y: y - lr.top, minWidth: a.minWidth, maxHeight, ready: true, hidden });
  };
  useLayoutEffect(compute, deps);
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        compute();
      });
    };
    window.addEventListener('resize', schedule);
    // capture: 그리드 바디/가로 스크롤/페이지 스크롤 모두 감지
    if (track) document.addEventListener('scroll', schedule, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      if (track) document.removeEventListener('scroll', schedule, true);
    };
  }, deps);
  const style = {
    position: 'absolute',
    left: pos.x,
    top: pos.y,
    minWidth: pos.minWidth,
    maxHeight: pos.maxHeight,
    visibility: pos.ready && !pos.hidden ? 'visible' : 'hidden',
  };
  return { ...pos, style };
}

// 앵커 요소가 보이는 영역(바디 뷰포트 / 헤더 뷰포트) — track 팝업 숨김 판정용
export function visibleClipOf(el) {
  const vp = el?.closest?.('.r2-body-viewport, .r2-header, .r2-floating-top, .r2-floating-bottom');
  if (!vp) return undefined;
  const r = vp.getBoundingClientRect();
  // 가로는 중앙 뷰포트(스크롤 영역) 기준
  const center = el.closest('.r2-center-cols-viewport, .r2-header-viewport, .r2-floating-top-viewport, .r2-floating-bottom-viewport');
  if (!center) return r;
  const c = center.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: c.left, right: c.right };
}

// 팝업 밖 mousedown 시 닫기 (다른 팝업 내부/무시 요소는 제외)
export function useClickOutside(ref, onClose, { ignore } = {}) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    const handler = e => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (ref.current?.contains(t)) return;
      if (ignore && ignore(t)) return;
      cb.current();
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, []);
}
