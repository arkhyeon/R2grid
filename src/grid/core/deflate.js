// 동기 deflate-raw 인코더 (RFC 1951, 고정 허프만 BTYPE=01 + LZ77 해시 체인).
// getDataAsExcel / getMultipleSheetsAsExcel 처럼 동기 Blob 을 돌려줘야 하는 경로에서 xlsx 를 압축한다.
// (비동기 경로는 브라우저 CompressionStream 사용)
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193,
  12289, 16385, 24577,
];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

const reverse = (v, n) => {
  let r = 0;
  for (let i = 0; i < n; i++) {
    r = (r << 1) | (v & 1);
    v >>>= 1;
  }
  return r;
};

// 고정 허프만 리터럴/길이 코드 (비트 역순으로 저장 → LSB 우선 출력)
const LIT_CODE = new Uint16Array(288);
const LIT_LEN = new Uint8Array(288);
for (let i = 0; i < 288; i++) {
  let code;
  let len;
  if (i <= 143) [code, len] = [0x30 + i, 8];
  else if (i <= 255) [code, len] = [0x190 + i - 144, 9];
  else if (i <= 279) [code, len] = [i - 256, 7];
  else [code, len] = [0xc0 + i - 280, 8];
  LIT_CODE[i] = reverse(code, len);
  LIT_LEN[i] = len;
}
const DIST_CODE = new Uint8Array(30);
for (let i = 0; i < 30; i++) DIST_CODE[i] = reverse(i, 5);

// 길이(3~258) → 길이 심볼 인덱스
const LEN_SYM = new Uint8Array(259);
for (let k = 0; k < 29; k++) {
  const hi = k === 28 ? 258 : k === 27 ? 257 : LEN_BASE[k + 1] - 1;
  for (let l = LEN_BASE[k]; l <= hi; l++) LEN_SYM[l] = k;
}
// 거리 → 거리 심볼 (zlib 방식: d-1 < 256 은 직접, 그 이상은 (d-1)>>7)
const DIST_SYM = new Uint8Array(512);
for (let c = 0; c < 30; c++) {
  const end = DIST_BASE[c] + (1 << DIST_EXTRA[c]);
  for (let d = DIST_BASE[c]; d < end; d++) {
    const x = d - 1;
    if (x < 256) DIST_SYM[x] = c;
    else DIST_SYM[256 + (x >> 7)] = c;
  }
}

const HBITS = 15;
const HSIZE = 1 << HBITS;
const WSIZE = 32768;
const WMASK = WSIZE - 1;
const MAX_CHAIN = 24;

export function deflateRawSync(src) {
  const n = src.length;
  let out = new Uint8Array(Math.max(1024, (n >>> 2) + 1024));
  let op = 0;
  let bitBuf = 0;
  let bitCnt = 0;
  const put = (v, len) => {
    bitBuf |= v << bitCnt;
    bitCnt += len;
    while (bitCnt >= 8) {
      out[op++] = bitBuf & 0xff;
      bitBuf >>>= 8;
      bitCnt -= 8;
    }
  };
  const ensure = () => {
    if (op + 16 > out.length) {
      const o = new Uint8Array(out.length * 2);
      o.set(out.subarray(0, op));
      out = o;
    }
  };

  put(1, 1); // BFINAL
  put(1, 2); // BTYPE=01 고정 허프만

  const head = new Int32Array(HSIZE).fill(-1);
  const prev = new Int32Array(WSIZE);
  const hashAt = i => ((src[i] << 10) ^ (src[i + 1] << 5) ^ src[i + 2]) & (HSIZE - 1);
  const insert = i => {
    const h = hashAt(i);
    prev[i & WMASK] = head[h];
    head[h] = i;
    return h;
  };

  let i = 0;
  while (i < n) {
    ensure();
    let bestLen = 0;
    let bestDist = 0;
    if (i + 2 < n) {
      const h = hashAt(i);
      let cand = head[h];
      let chain = MAX_CHAIN;
      const maxLen = Math.min(258, n - i);
      while (cand >= 0 && i - cand <= WSIZE && chain-- > 0) {
        if (src[cand + bestLen] === src[i + bestLen] && src[cand] === src[i]) {
          let l = 0;
          while (l < maxLen && src[cand + l] === src[i + l]) l++;
          if (l > bestLen) {
            bestLen = l;
            bestDist = i - cand;
            if (l >= maxLen) break;
          }
        }
        const p = prev[cand & WMASK];
        if (p >= cand) break; // 윈도 밖에서 덮어써진 체인
        cand = p;
      }
      prev[i & WMASK] = head[h];
      head[h] = i;
    }
    if (bestLen >= 3) {
      const k = LEN_SYM[bestLen];
      const sym = 257 + k;
      put(LIT_CODE[sym], LIT_LEN[sym]);
      if (LEN_EXTRA[k]) put(bestLen - LEN_BASE[k], LEN_EXTRA[k]);
      const x = bestDist - 1;
      const dc = x < 256 ? DIST_SYM[x] : DIST_SYM[256 + (x >> 7)];
      put(DIST_CODE[dc], 5);
      if (DIST_EXTRA[dc]) put(bestDist - DIST_BASE[dc], DIST_EXTRA[dc]);
      const end = i + bestLen;
      for (i++; i < end; i++) if (i + 2 < n) insert(i);
    } else {
      put(LIT_CODE[src[i]], LIT_LEN[src[i]]);
      i++;
    }
  }
  ensure();
  put(LIT_CODE[256], LIT_LEN[256]); // 블록 끝
  if (bitCnt > 0) out[op++] = bitBuf & 0xff;
  return out.subarray(0, op);
}
