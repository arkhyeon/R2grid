// 팝업 공용: body 포털 + 테마 변수 레이어 + 위치 계산(화면 밖이면 뒤집기) + 바깥 클릭 닫기
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../core/utils.js';

// 팝업도 그리드와 같은 CSS 변수(테마/다크)를 받도록 같은 클래스로 감싼다
export function PopupLayer({ core, children }) {
  return (
    <div className={cx('ag-popup ag-theme-vars ag-theme-quartz', core.theme?.className)} data-ag-popup="">
      {children}
    </div>
  );
}

export function usePopupPosition(ref, getAnchor, deps = []) {
  const [pos, setPos] = useState({ x: -9999, y: -9999, minWidth: undefined, ready: false });
  const compute = () => {
    const a = getAnchor();
    const el = ref.current;
    if (!a || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let { x, y } = a;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (x + w > vw - 4) x = a.alignRight != null ? a.alignRight - w : vw - w - 4;
    if (x < 4) x = 4;
    if (y + h > vh - 4) {
      if (a.alignTo && a.alignTo.top - h >= 4) y = a.alignTo.top - h;
      else if (a.flipY != null && a.flipY - h >= 4) y = a.flipY - h;
      else y = Math.max(4, vh - h - 4);
    }
    setPos({ x, y, minWidth: a.minWidth, ready: true });
  };
  useLayoutEffect(compute, deps);
  useEffect(() => {
    const onResize = () => compute();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, deps);
  return pos;
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
