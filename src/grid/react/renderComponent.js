// 사용자 컴포넌트(셀렌더러/에디터/툴패널/오버레이) 렌더 헬퍼.
// CLM 은 components={{ rowAddOn: props => ... }} 처럼 매 렌더마다 새 함수를 넘기는 경우가 많다.
// 그대로 createElement 하면 함수 identity 가 바뀔 때마다 리마운트 → 성능/상태 손실.
// → 이름/컬럼 단위의 "안정 래퍼" 컴포넌트가 최신 구현을 함수 호출로 렌더하고,
//   코드 자체가 바뀐 경우(toString 해시 변경)에만 key 를 바꿔 리마운트한다.
import { Component, createElement } from 'react';

const isClassComponent = c => !!(c && c.prototype && c.prototype.isReactComponent);
const isExoticComponent = c => c && typeof c === 'object' && !!c.$$typeof; // memo / forwardRef / lazy

const tokenCache = new WeakMap();
let tokenSeq = 0;
const codeTokens = new Map();

// 같은 소스코드의 함수는 같은 토큰 → 매 렌더 새로 만들어진 인라인 함수도 리마운트 없음
export function implToken(impl) {
  if (impl == null) return 'none';
  if (typeof impl === 'string') return `s:${impl}`;
  if (typeof impl !== 'function') return `o:${tokenCache.get(impl) ?? setToken(impl)}`;
  let t = tokenCache.get(impl);
  if (t) return t;
  const src = Function.prototype.toString.call(impl);
  t = codeTokens.get(src);
  if (!t) {
    t = `f${++tokenSeq}`;
    codeTokens.set(src, t);
  }
  tokenCache.set(impl, t);
  return t;
}

function setToken(obj) {
  const t = `x${++tokenSeq}`;
  tokenCache.set(obj, t);
  return t;
}

export function renderImpl(Impl, props) {
  if (Impl == null) return null;
  if (typeof Impl === 'function' && !isClassComponent(Impl)) {
    return Impl(props);
  }
  if (isClassComponent(Impl) || isExoticComponent(Impl)) return createElement(Impl, props);
  return null;
}

// core 단위 안정 래퍼 캐시
export function getStableComponent(core, key, getImpl) {
  if (!core.__stable) core.__stable = new Map();
  let C = core.__stable.get(key);
  if (!C) {
    C = function StableComponent(props) {
      return renderImpl(getImpl(), props);
    };
    C.displayName = `Stable(${key})`;
    core.__stable.set(key, C);
  }
  return C;
}

// 클래스/forwardRef 등은 래핑 없이 직접, 함수형은 (baseKey + 코드토큰) 단위 안정 래퍼로.
// 코드가 같으면 같은 래퍼 타입 → 리마운트 없음 / 코드가 다르면 다른 타입 → 자연스럽게 리마운트
export function stableElement(core, baseKey, impl, props, reactKey, onError) {
  if (impl == null) return null;
  if (isClassComponent(impl) || isExoticComponent(impl)) {
    return createElement(SafeBoundary, { key: reactKey, label: baseKey, onError }, createElement(impl, props));
  }
  if (!core.__latestImpl) core.__latestImpl = new Map();
  const key = `${baseKey}|${implToken(impl)}`;
  core.__latestImpl.set(key, impl);
  const C = getStableComponent(core, key, () => core.__latestImpl.get(key));
  return createElement(SafeBoundary, { key: reactKey, label: baseKey, onError }, createElement(C, props));
}

// 사용자 컴포넌트(셀렌더러·에디터·툴패널 등) 하나의 예외가 그리드 전체를 언마운트하지 않도록 격리.
// onError 가 있으면 호출(예: 에디터 오류 시 편집 취소). 자식이 바뀌면(리렌더) 다시 시도한다.
export class SafeBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, children: props.children };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    // 오류 후 새 children(새 값/새 구현)이 오면 재시도
    if (state.error && props.children !== state.children) return { error: null, children: props.children };
    return props.children !== state.children ? { children: props.children } : null;
  }

  componentDidCatch(error) {
    console.error(`[R2grid] ${this.props.label || 'component'} 렌더 오류:`, error);
    this.props.onError?.(error);
  }

  render() {
    return this.state.error ? null : this.props.children;
  }
}

export { isClassComponent, isExoticComponent };
