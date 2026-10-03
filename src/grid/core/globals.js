// provideGlobalGridOptions / ModuleRegistry / LicenseManager 호환 (모듈 등록은 no-op: 모든 기능 내장)

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

export const ModuleRegistry = {
  register() {},
  registerModules() {},
  isRegistered() {
    return true;
  },
};

export const LicenseManager = {
  setLicenseKey() {},
  getLicenseDetails() {
    return { valid: true };
  },
};

export const GRID_VERSION = 'r2grid-34.3.1-compat';
