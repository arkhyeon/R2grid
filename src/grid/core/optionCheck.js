// 개발 모드 옵션 이름 검사: 모르는 그리드 옵션·컬럼 옵션 키를 콘솔에 한 번씩 알림 (오타면 비슷한 이름 제안)
//  켜짐: Vite 개발 모드(import.meta.env.DEV) 또는 debug 옵션. 끄기: suppressPropertyNamesCheck
import { COL_DEF_NAMES, GRID_OPTION_NAMES } from './optionNames.js';

// 받기만 하고 결과는 같은 옵션 (성능·렌더 방식 등 R2grid 에선 필요 없는 것)
const ACCEPTED_GRID = [
  'aggregateOnlyChangedColumns',
  'cacheQuickFilter',
  'debounceVerticalScrollbar',
  'deltaSort',
  'enableFilterHandlers',
  'enableStrictPivotColumnOrder',
  'loadThemeGoogleFonts',
  'renderingMode',
  'suppressAnimationFrame',
  'suppressBrowserResizeObserver',
  'suppressFocusAfterRefresh',
  'suppressMaxRenderedRowRestriction',
  'suppressPropertyNamesCheck',
  'suppressTouch',
  'suppressAdvancedFilterEval',
  'groupRemoveSingleChildren',
  'groupRemoveLowestSingleChildren',
];

const GRID_KNOWN = new Set([...GRID_OPTION_NAMES, ...ACCEPTED_GRID]);
const COL_KNOWN = new Set(COL_DEF_NAMES);

export function isOptionCheckOn(gos) {
  if (gos.suppressPropertyNamesCheck) return false;
  let dev = false;
  try {
    dev = !!import.meta.env?.DEV;
  } catch {
    dev = false;
  }
  return dev || !!gos.debug;
}

// 편집 거리 2 이하 · 대소문자만 다른 이름 중 가장 가까운 것
function suggest(name, known) {
  const lower = name.toLowerCase();
  let best = null;
  let bestD = 3;
  for (const k of known) {
    if (k.toLowerCase() === lower) return k;
    if (Math.abs(k.length - name.length) > 2) continue;
    const d = distance(lower, k.toLowerCase(), bestD);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

function distance(a, b, limit) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin >= limit) return limit;
    prev = cur;
  }
  return prev[b.length];
}

const warned = new Set();
function warnUnknown(kind, name, known) {
  const key = `${kind}:${name}`;
  if (warned.has(key)) return;
  warned.add(key);
  const s = suggest(name, known);
  console.warn(
    `[R2grid] 알 수 없는 ${kind} '${name}'${s ? ` — '${s}' 를 쓰려던 건가요?` : ' — 지원하지 않는 옵션이거나 오타입니다.'} (이 경고 끄기: suppressPropertyNamesCheck)`,
  );
}

// 그리드 옵션 키 검사 (keys: 새로 들어온 키들)
export function checkGridOptionNames(gos, keys) {
  if (!isOptionCheckOn(gos)) return;
  for (const k of keys) if (!GRID_KNOWN.has(k)) warnUnknown('그리드 옵션', k, GRID_KNOWN);
}

// 컬럼 정의 키 검사 (columnDefs 의 컬럼·컬럼 그룹, defaultColDef, columnTypes 값)
export function checkColDefNames(gos, def) {
  if (!def || typeof def !== 'object' || !isOptionCheckOn(gos)) return;
  for (const k of Object.keys(def)) if (!COL_KNOWN.has(k)) warnUnknown('컬럼 옵션', k, COL_KNOWN);
}

// 테스트용: 경고 기록 비우기
export function resetOptionCheckWarnings() {
  warned.clear();
}
