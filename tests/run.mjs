// 헤드리스 코어 테스트 실행기: tests/**/*.test.mjs 를 파일마다 따로 node 로 돌리고 PASS / FAIL 을 모아 보여줌
//  npm test               전체
//  npm test -- ssrm pivot 파일 이름에 그 글자가 들어간 것만
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const filters = process.argv.slice(2);

const files = [];
const walk = dir => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.test.mjs') && (!filters.length || filters.some(f => e.name.includes(f)))) files.push(p);
  }
};
walk(here);
files.sort();

const runOne = file =>
  new Promise(resolve => {
    const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (out += d));
    child.on('close', code => resolve({ file, code, out }));
  });

// 동시에 몇 개씩
const results = [];
const queue = [...files];
const workers = Array.from({ length: 4 }, async () => {
  while (queue.length) results.push(await runOne(queue.shift()));
});
await Promise.all(workers);
results.sort((a, b) => a.file.localeCompare(b.file));

let pass = 0;
let fail = 0;
let broken = 0;
for (const r of results) {
  const lines = r.out.split(/\r?\n/);
  const p = lines.filter(l => l.startsWith('PASS')).length;
  const f = lines.filter(l => l.startsWith('FAIL')).length;
  pass += p;
  fail += f;
  const crashed = r.code !== 0 && !f;
  if (crashed || (!p && !f)) broken++;
  const mark = f || crashed || !p ? '✗' : '✓';
  console.log(`${mark} ${relative(here, r.file).replace(/\\/g, '/').padEnd(36)} ${p} 통과${f ? ` · ${f} 실패` : ''}${crashed ? ' · 실행 오류' : ''}`);
  if (f || crashed || !p) {
    for (const l of lines) if (l.startsWith('FAIL') || l.startsWith('     기대') || (crashed && l.trim())) console.log('    ' + l);
  }
}
console.log(`\n${results.length}개 파일 · ${pass} 통과 · ${fail} 실패${broken ? ` · ${broken}개 파일 실행 오류` : ''}`);
process.exitCode = fail || broken ? 1 : 0;
