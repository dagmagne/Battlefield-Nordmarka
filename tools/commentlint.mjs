// Finds code accidentally swallowed by a `//` comment placed in the middle of a line (JS and WGSL in src/).
// A comment that ends with something like `; x = 1;` or `foo(a); }` almost certainly hid statements.
// usage: node tools/commentlint.mjs   (exit 1 on a finding; build.mjs runs it)
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../src/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.wgsl'));
const CODE = [/;\s*[A-Za-z_$][\w$.]*\([^)]*\)\s*;/, /[\w\])]\s*(=|\+=|-=)\s*[\w(\[-][^;]*;\s*$/, /;\s*[A-Za-z_$][\w$.]*(\[[^\]]*\])?\s*(=|\+=|-=|\*=)\s*[^=]/, /\)\s*;\s*[A-Za-z_$][\w$.]*\(/, /;\s*(const|let|var|if|for|return)\b[^,]*[;{]/, /\b[A-Za-z_$][\w$]*\[[\w\s+*]+\]\s*=\s*[^=]+;/];
let bad = 0;
for (const f of files) {
  const lines = readFileSync(new URL(f, dir), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const s = line.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""'); // ignore strings
    const k = s.indexOf('//'); if (k < 0 || /^\s*$/.test(s.slice(0, k))) return; // a whole-line comment cannot hide code
    const tail = s.slice(k + 2);
    if (CODE.some((re) => re.test(tail))) { console.log(`${f}:${i + 1}: code after a // comment: ${line.trim().slice(0, 160)}`); bad++; }
  });
}
if (bad) { console.log(`${bad} suspicious line(s)`); process.exit(1); } else console.log('commentlint: ok');
