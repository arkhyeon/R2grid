// 최소 ZIP 작성기 (xlsx 용). 동기=자체 deflate(deflate.js), 비동기=CompressionStream('deflate-raw').
import { deflateRawSync } from './deflate.js';
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(chunks) {
  let c = 0xffffffff;
  for (const b of chunks) {
    for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();
const sizeOf = chunks => chunks.reduce((s, b) => s + b.length, 0);

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function header(sig, fields) {
  const len = fields.reduce((s, [, n]) => s + n, 4);
  const buf = new Uint8Array(len);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, sig, true);
  let o = 4;
  for (const [v, n] of fields) {
    if (n === 2) dv.setUint16(o, v, true);
    else dv.setUint32(o, v, true);
    o += n;
  }
  return buf;
}

function build(entries) {
  const { time, date } = dosDateTime();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const local = header(0x04034b50, [
      [20, 2],
      [0x0800, 2],
      [e.method, 2],
      [time, 2],
      [date, 2],
      [e.crc, 4],
      [e.compSize, 4],
      [e.size, 4],
      [name.length, 2],
      [0, 2],
    ]);
    parts.push(local, name, ...e.data);
    central.push(
      header(0x02014b50, [
        [20, 2],
        [20, 2],
        [0x0800, 2],
        [e.method, 2],
        [time, 2],
        [date, 2],
        [e.crc, 4],
        [e.compSize, 4],
        [e.size, 4],
        [name.length, 2],
        [0, 2],
        [0, 2],
        [0, 2],
        [0, 2],
        [0, 4],
        [offset, 4],
      ]),
      name,
    );
    offset += local.length + name.length + e.compSize;
  }
  const cdSize = sizeOf(central);
  const end = header(0x06054b50, [
    [0, 2],
    [0, 2],
    [entries.length, 2],
    [entries.length, 2],
    [cdSize, 4],
    [offset, 4],
    [0, 2],
  ]);
  return new Blob([...parts, ...central, end], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const toChunks = content => {
  if (content instanceof Uint8Array) return [content];
  if (Array.isArray(content)) return content.map(c => (typeof c === 'string' ? enc.encode(c) : c));
  return [enc.encode(content)];
};

const concat = chunks => {
  if (chunks.length === 1) return chunks[0];
  const out = new Uint8Array(sizeOf(chunks));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
};

// files: [{ name, content: string | Uint8Array | (string|Uint8Array)[] }]
// 동기 경로도 자체 deflate 로 압축 (압축 이득이 없으면 STORE)
export function zipSync(files, { compress = true } = {}) {
  return build(
    files.map(f => {
      const data = toChunks(f.content);
      const size = sizeOf(data);
      const crc = crc32(data);
      if (compress && size > 64) {
        const comp = deflateRawSync(concat(data));
        if (comp.length < size) return { name: f.name, data: [comp], crc, size, compSize: comp.length, method: 8 };
      }
      return { name: f.name, data, crc, size, compSize: size, method: 0 };
    }),
  );
}

export async function zipAsync(files) {
  if (typeof CompressionStream === 'undefined') return zipSync(files);
  const entries = [];
  for (const f of files) {
    const data = toChunks(f.content);
    const size = sizeOf(data);
    const crc = crc32(data);
    const stream = new Blob(data).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const comp = new Uint8Array(await new Response(stream).arrayBuffer());
    entries.push({ name: f.name, data: [comp], crc, size, compSize: comp.length, method: 8 });
  }
  return build(entries);
}
