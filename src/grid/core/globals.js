// provideGlobalGridOptions: 모든 그리드에 공통 적용할 기본 옵션

let globalGridOptions = {};

export function provideGlobalGridOptions(options, mergeStrategy = 'shallow') {
  if (mergeStrategy === 'deep') {
    const merge = (a, b) => {
      const out = { ...a };
      Object.keys(b || {}).forEach(k => {
        const v = b[k];
        out[k] =
          v && typeof v === 'object' && !Array.isArray(v) && typeof a?.[k] === 'object' && !v.install
            ? merge(a[k], v)
            : v;
      });
      return out;
    };
    globalGridOptions = merge(globalGridOptions, options);
  } else {
    globalGridOptions = { ...globalGridOptions, ...options };
  }
}

export function getGlobalGridOptions() {
  return globalGridOptions;
}

export const GRID_VERSION = 'r2grid-0.0.1';
