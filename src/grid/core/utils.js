// 공용 유틸 — AG-Grid 내부 동작(필드 경로, 기본 비교자, 이벤트명 규칙)을 그대로 따른다.

export function getFieldValue(data, field, suppressDot) {
  if (data == null || field == null) return undefined;
  if (suppressDot || field.indexOf('.') < 0) return data[field];
  const parts = field.split('.');
  let cur = data;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

export function setFieldValue(data, field, value, suppressDot) {
  if (data == null || field == null) return;
  if (suppressDot || field.indexOf('.') < 0) {
    data[field] = value;
    return;
  }
  const parts = field.split('.');
  let cur = data;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

// 'selectionChanged' → 'onSelectionChanged'
export function eventPropName(type) {
  return `on${type.charAt(0).toUpperCase()}${type.slice(1)}`;
}

export function toText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// AG-Grid _defaultComparator 와 동일 (null 은 오름차순에서 앞)
export function defaultComparator(a, b, accentedCompare) {
  const aMissing = a == null;
  const bMissing = b == null;
  if (a && a.toNumber) a = a.toNumber();
  if (b && b.toNumber) b = b.toNumber();
  if (aMissing && bMissing) return 0;
  if (aMissing) return -1;
  if (bMissing) return 1;
  const quick = (x, y) => (x > y ? 1 : x < y ? -1 : 0);
  if (typeof a !== 'string' || !accentedCompare) return quick(a, b);
  try {
    return a.localeCompare(b);
  } catch {
    return quick(a, b);
  }
}

export function copyTextToClipboard(text, noApi = false) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta);
    const active = document.activeElement;
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* noop */
    }
    document.body.removeChild(ta);
    active?.focus?.({ preventScroll: true });
  };
  if (!noApi && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(fallback);
  } else {
    fallback();
  }
}

export function downloadFile(fileName, content, mimeType) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 내장 컴포넌트 이름 정규화: AG 호환 이름 → R2 이름 (agTextColumnFilter → r2TextColumnFilter,
// ag-Grid-SelectionColumn → r2-Grid-SelectionColumn). 내부는 R2 이름 하나로 처리하고, 옛 AG 이름도 받는다.
export function canonName(name) {
  if (typeof name !== 'string') return name;
  if (name.startsWith('ag-Grid-')) return `r2-Grid-${name.slice(8)}`;
  if (/^ag[A-Z]/.test(name)) return `r2${name.slice(2)}`;
  return name;
}

// 클래스명 조합 (falsy 무시)
export function cx(...parts) {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    out = out ? `${out} ${p}` : p;
  }
  return out;
}

// cellClass / rowClass: string | string[] | fn(params) → string
export function resolveClassValue(v, params) {
  if (!v) return '';
  const r = typeof v === 'function' ? v(params) : v;
  if (!r) return '';
  return Array.isArray(r) ? r.filter(Boolean).join(' ') : r;
}

// cellClassRules / rowClassRules: { cls: fn | string-expression }
export function resolveClassRules(rules, params) {
  if (!rules) return '';
  let out = '';
  for (const name in rules) {
    const rule = rules[name];
    let pass = false;
    if (typeof rule === 'function') pass = !!rule(params);
    else if (typeof rule === 'string') pass = evaluateExpression(rule, params);
    if (pass) out = out ? `${out} ${name}` : name;
  }
  return out;
}

// AG-Grid 문자열 표현식 지원 ('x > 5' 형태, value/data/node 등 노출)
const exprCache = new Map();
export function evaluateExpression(expr, params) {
  let fn = exprCache.get(expr);
  if (!fn) {
    const body = expr.includes('return') ? expr : `return ${expr};`;
    try {
      // eslint-disable-next-line no-new-func
      fn = new Function('x', 'value', 'data', 'node', 'colDef', 'column', 'api', 'context', 'rowIndex', 'ctx', body);
    } catch {
      fn = () => false;
    }
    exprCache.set(expr, fn);
  }
  try {
    return fn(
      params.value,
      params.value,
      params.data,
      params.node,
      params.colDef,
      params.column,
      params.api,
      params.context,
      params.rowIndex,
      params.context,
    );
  } catch {
    return false;
  }
}

export function isPrintableKey(e) {
  return e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}
