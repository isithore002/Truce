#!/usr/bin/env node
// Commit-size guard. ETHGlobal says large single commits may be disqualified, so our rule is:
//   NO commit may insert more than 1000 lines OR delete more than 1000 lines.
// (We also warn when insertions + deletions together pass the limit: aim for small commits.)
//
// Usage:
//   node tools/check-commit-size.js                  check the whole history of HEAD
//   node tools/check-commit-size.js origin/main..HEAD   check a revision range
//   node tools/check-commit-size.js --staged         check what is about to be committed (pre-commit hook)
//   --max N                                          change the limit (default 1000)
// Exit code 1 when any commit (or the staged change) is over the limit.
//
// Dependencies, build output and generated files count too. Do not vendor libraries (use a git submodule or npm),
// and add dependencies in small batches so the lockfile change stays under the limit.

const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const MAX = parseInt(opt('--max', '1000'), 10);
const STAGED = flag('--staged');
const range = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--max'))[0] || 'HEAD';

const git = (a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });

function parseNumstat(text) {
  let ins = 0, del = 0, bin = 0;
  const files = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const p = line.split('\t');
    if (p.length < 3) continue;
    const path = p.slice(2).join('\t');
    if (p[0] === '-') { bin++; files.push({ path, n: 0 }); continue; }
    ins += +p[0]; del += +p[1];
    files.push({ path, n: +p[0] + +p[1] });
  }
  files.sort((a, b) => b.n - a.n);
  return { ins, del, bin, files };
}

const status = (s) => (s.ins > MAX || s.del > MAX ? 'OVER' : s.ins + s.del > MAX ? 'warn' : 'ok  ');
const top = (s) => s.files.slice(0, 3).map((f) => `${f.path} (${f.n})`).join(', ');

if (STAGED) {
  const s = parseNumstat(git(['diff', '--cached', '--numstat']));
  if (!s.files.length) process.exit(0);
  console.log(`staged change: +${s.ins} -${s.del} in ${s.files.length} file(s)`);
  if (s.bin) console.log(`  note: ${s.bin} binary file(s) are not counted in lines`);
  if (s.ins > MAX || s.del > MAX) {
    console.error(`\nBLOCKED: this commit would insert ${s.ins} / delete ${s.del} lines; the limit is ${MAX} for each.`);
    console.error(`Biggest files: ${top(s)}`);
    console.error('Split it: commit some files first, or use `git add -p`. Do not vendor dependencies (use a submodule or npm).');
    process.exit(1);
  }
  if (s.ins + s.del > MAX) console.warn(`warning: insertions + deletions = ${s.ins + s.del} (over ${MAX} together). Consider splitting.`);
  process.exit(0);
}

const raw = git(['log', '--numstat', '--format=@@%h%x09%s', range]);
const commits = raw.split('@@').filter(Boolean).map((chunk) => {
  const nl = chunk.indexOf('\n');
  const [hash, ...rest] = chunk.slice(0, nl).split('\t');
  return { hash, subject: rest.join('\t'), ...parseNumstat(chunk.slice(nl + 1)) };
}).reverse();

let bad = 0, warn = 0;
for (const c of commits) {
  const st = status(c);
  if (st === 'OVER') bad++; else if (st === 'warn') warn++;
  console.log(`${st}  +${String(c.ins).padStart(5)} -${String(c.del).padStart(5)}  ${c.hash}  ${c.subject.slice(0, 70)}`);
  if (st !== 'ok  ') console.log(`        biggest: ${top(c)}`);
}
console.log(`\n${commits.length} commit(s) checked, limit ${MAX} inserted or deleted lines per commit. Over: ${bad}. Warnings: ${warn}.`);
process.exit(bad ? 1 : 0);
