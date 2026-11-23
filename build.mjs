// Bundles src/ into a single self-contained index.html.
// `--split` writes dist/ instead: index.html (shell + code) with the map blob, music and title image as separate
// hashed files beside it, and a service worker (src/sw.js) that caches all of it. Same source, same game.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const dev = process.argv.includes('--dev'), split = process.argv.includes('--split');
const OUT = 'dist/', files = []; // split: the files written beside index.html
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 10);
if (split) { rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true }); }
// a `//` comment in the middle of a line silently removes the code after it; tools/commentlint.mjs flags that before anything is built
{ const { execFileSync } = await import('node:child_process'); try { execFileSync(process.execPath, [new URL('./tools/commentlint.mjs', import.meta.url).pathname], { stdio: 'pipe' }); }
  catch (e) { process.stdout.write(String(e.stdout || '')); console.error('build stopped: code hidden after a // comment (see above)'); process.exit(1); } }

const minWgsl = (s) =>
  s.replace(/\/\/[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}()\[\];,:=+\-*\/<>&|!?])\s*/g, '$1')
    .trim();

const wgsl = {
  name: 'wgsl',
  setup(b) {
    b.onLoad({ filter: /\.wgsl$/ }, (a) => {
      const src = readFileSync(a.path, 'utf8');
      return { contents: 'export default ' + JSON.stringify(dev ? src : minWgsl(src)), loader: 'js' };
    });
  },
};

// split build: the big data files become `./name.hash.ext` URLs (src/asset.js tells them from base64); the short sound loops stay embedded
const data = {
  name: 'data',
  setup(b) {
    if (!split) return;
    b.onLoad({ filter: /[\\/]data[\\/](world\.bin|music\.mp3|title\.webp)$/ }, (a) => {
      const buf = readFileSync(a.path), ext = extname(a.path), name = basename(a.path, ext) + '.' + sha(buf) + ext;
      writeFileSync(OUT + name, buf); files.push({ name, size: buf.length });
      return { contents: 'export default ' + JSON.stringify('./' + name), loader: 'js' };
    });
  },
};

const r = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: !dev,
  format: 'iife',
  target: 'es2022',
  write: false,
  plugins: [wgsl, data],
  loader: { '.bin': 'base64', '.mp3': 'base64', '.webp': 'base64' },
  legalComments: 'none',
});
const js = r.outputFiles[0].text;
let html = readFileSync('src/shell.html', 'utf8');
if (!dev) {
  html = html.replace(/<style>([\s\S]*?)<\/style>/, (m, css) =>
    '<style>' + css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};:,>])\s*/g, '$1').trim() + '</style>')
    .replace(/>\s+</g, '><').replace(/<!--[\s\S]*?-->/g, '');
}
const kb = (n) => (n / 1024).toFixed(1) + ' kB';
if (split) {
  // the page registers the worker after load; a failure (http, private mode) only means no offline cache
  const reg = ";if('serviceWorker'in navigator)addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{})});";
  html = html.replace('/*__JS__*/', () => (js + reg).replace(/<\/script/g, '<\\/script'));
  writeFileSync(OUT + 'index.html', html);
  const sw = readFileSync('src/sw.js', 'utf8').replace('__VER__', sha(html + files.map((f) => f.name).join())).replace('__FILES__', JSON.stringify(files.map((f) => f.name)));
  writeFileSync(OUT + 'sw.js', sw);
  const tot = Buffer.byteLength(html) + files.reduce((s, f) => s + f.size, 0);
  console.log(`dist/index.html ${kb(Buffer.byteLength(html))} (gzip ${kb(gzipSync(html).length)})`);
  for (const f of files) console.log(`dist/${f.name} ${kb(f.size)}`);
  console.log(`dist total ${kb(tot)}`);
  process.exit(0);
}
html = html.replace('/*__JS__*/', () => js.replace(/<\/script/g, '<\\/script'));
writeFileSync('index.html', html);
console.log(`index.html ${kb(Buffer.byteLength(html))} (gzip ${kb(gzipSync(html).length)})${dev ? ' [dev]' : ''}`);
