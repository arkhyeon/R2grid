// 테마: moonTheme.withParams(params, mode?)
// 파라미터 → CSS 변수(--r2-accent-color 등)로 변환해 테마별 <style> 을 주입한다.
// 다크 전환은 조상 요소의 data-r2-theme-mode="dark" 로 한다.

let themeSeq = 0;

const toVarName = name => `--r2-${name.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}`;

// 다크 모드 기본값 (light 전용 파라미터를 다크에서 되돌릴 때 사용)
const DARK_DEFAULTS = {
  backgroundColor: '#2b2b2b',
  foregroundColor: '#ffffff',
  accentColor: '#2196f3',
  borderColor: 'rgba(255, 255, 255, 0.16)',
  chromeBackgroundColor: 'color-mix(in srgb, var(--r2-background-color), var(--r2-foreground-color) 5%)',
  headerBackgroundColor: 'var(--r2-chrome-background-color)',
  oddRowBackgroundColor: 'var(--r2-background-color)',
};

function toCssValue(key, v) {
  if (v == null) return null;
  if (typeof v === 'number') {
    if (/(opacity|weight|scale|ratio|lineHeight)$/i.test(key)) return String(v);
    return `${v}px`;
  }
  if (typeof v === 'boolean') {
    if (/border$/i.test(key)) return v ? 'solid 1px var(--r2-border-color)' : 'none';
    return v ? '1' : '0';
  }
  if (Array.isArray(v)) {
    return v
      .map(f => (typeof f === 'object' && f.googleFont ? `"${f.googleFont}"` : /\s/.test(f) && !/^["']/.test(f) ? `"${f}"` : f))
      .join(', ');
  }
  if (typeof v === 'object') {
    if (v.ref) {
      const base = `var(${toVarName(v.ref)})`;
      if (v.mix != null) {
        const onto = v.onto ? `var(${toVarName(v.onto)})` : 'transparent';
        return `color-mix(in srgb, ${onto}, ${base} ${Math.round(v.mix * 1000) / 10}%)`;
      }
      return base;
    }
    if (v.calc) return `calc(${v.calc.replace(/[a-zA-Z]+/g, m => `var(${toVarName(m)})`)})`;
    if (v.style || v.width || v.color) {
      const c = typeof v.color === 'object' ? toCssValue('color', v.color) : v.color || 'var(--r2-border-color)';
      return `${v.style || 'solid'} ${typeof v.width === 'number' ? `${v.width}px` : v.width || '1px'} ${c}`;
    }
    if (v.googleFont) return `"${v.googleFont}"`;
  }
  return String(v);
}

function declarations(params) {
  return Object.entries(params)
    .map(([k, v]) => {
      const css = toCssValue(k, v);
      return css == null ? '' : `${toVarName(k)}:${css};`;
    })
    .join('');
}

class Theme {
  constructor(name, params) {
    this.name = name;
    this.id = ++themeSeq;
    this.params = params || { all: {}, light: {}, dark: {} };
    this.__installed = false;
  }

  withParams(params, mode) {
    const next = {
      all: { ...this.params.all },
      light: { ...this.params.light },
      dark: { ...this.params.dark },
    };
    if (!mode) Object.assign(next.all, params);
    else if (mode === 'light') Object.assign(next.light, params);
    else Object.assign(next.dark, params); // 'dark', 'dark-blue' 등
    return new Theme(this.name, next);
  }

  withPart() {
    return this;
  }

  withoutPart() {
    return this;
  }

  get className() {
    return `r2-theme-p${this.id}`;
  }

  install() {
    if (this.__installed || typeof document === 'undefined') return;
    this.__installed = true;
    const cls = this.className;
    const { all, light, dark } = this.params;
    const base = declarations({ ...all, ...light });
    // light 전용 값은 다크에서 기본 다크값으로 되돌린다
    const revert = {};
    Object.keys(light).forEach(k => {
      if (!(k in dark) && !(k in all) && DARK_DEFAULTS[k]) revert[k] = DARK_DEFAULTS[k];
    });
    const darkDecl = declarations({ ...revert, ...dark });
    let css = '';
    if (base) css += `.r2-theme-vars.${cls}{${base}}`;
    if (darkDecl) {
      css += `:where([data-r2-theme-mode^="dark"]) .r2-theme-vars.${cls}.${cls},.r2-theme-vars.${cls}.${cls}[data-r2-theme-mode^="dark"]{${darkDecl}}`;
    }
    if (!css) return;
    const style = document.createElement('style');
    style.setAttribute('data-r2-theme', cls);
    style.textContent = css;
    document.head.appendChild(style);
  }
}

export const moonTheme = new Theme('moon');
export const createTheme = () => new Theme('custom');

// Part 스텁 (withPart 체이닝 호환)
const part = name => ({ partName: name, withParams: () => part(name) });
export const colorSchemeLight = part('colorSchemeLight');
export const colorSchemeLightWarm = part('colorSchemeLightWarm');
export const colorSchemeLightCold = part('colorSchemeLightCold');
export const colorSchemeDark = part('colorSchemeDark');
export const colorSchemeDarkWarm = part('colorSchemeDarkWarm');
export const colorSchemeDarkBlue = part('colorSchemeDarkBlue');
export const colorSchemeVariable = part('colorSchemeVariable');
export const checkboxStyleDefault = part('checkboxStyleDefault');
export const inputStyleBase = part('inputStyleBase');
export const inputStyleBordered = part('inputStyleBordered');
export const createPart = () => part('custom');

export function resolveTheme(theme) {
  if (theme && theme instanceof Theme) return theme;
  return moonTheme;
}
