// Shared options for the headed GPU tools (shot, multi, perf, drive, poses).
//   --port N    server port (default 8080, or $GPORT)
//   --path P    path under the server root to the checkout (default '', or $GPATH), e.g. .claude/worktrees/x
//   --vulkan    add --enable-unsafe-webgpu and Vulkan, for a Chrome that has no hardware WebGPU without them
//               (not needed on Linux + GTX 1060 + Chrome 157: the adapter is 'nvidia pascal' either way)
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i < 0 ? d : a[i + 1]; };
export const port = +opt('port', process.env.GPORT || 8080);
const path = String(opt('path', process.env.GPATH || '')).replace(/^\/+|\/+$/g, '');
export const base = `http://localhost:${port}/${path ? path + '/' : ''}index.html`;
export function chromeArgs(extra = []) {
  const args = ['--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', ...extra];
  if (a.includes('--vulkan')) args.push('--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=vulkan');
  return args;
}
// Logs the WebGPU adapter once the page is up, so a run on SwiftShader or llvmpipe is obvious.
export async function logAdapter(page) {
  const g = await page.evaluate('window.__R&&window.__R.gpuName||""').catch(() => '');
  console.log('[gpu]', g || '(unknown)');
  if (/swiftshader|llvmpipe|software/i.test(g)) console.log('[gpu] WARNING: software adapter, numbers are meaningless');
  return g;
}
