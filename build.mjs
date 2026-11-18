// Bundles src/ into a single self-contained index.html.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const dev = process.argv.includes('--dev');
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

const r = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: !dev,
  format: 'iife',
  target: 'es2022',
  write: false,
  plugins: [wgsl],
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
html = html.replace('/*__JS__*/', () => js.replace(/<\/script/g, '<\\/script'));
writeFileSync('index.html', html);
const kb = (n) => (n / 1024).toFixed(1) + ' kB';
console.log(`index.html ${kb(Buffer.byteLength(html))} (gzip ${kb(gzipSync(html).length)})${dev ? ' [dev]' : ''}`);
