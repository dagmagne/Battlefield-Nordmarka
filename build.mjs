// Bundles src/ into a single self-contained index.html.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const dev = process.argv.includes('--dev');

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
