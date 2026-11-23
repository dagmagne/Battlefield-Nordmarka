// Service worker of the split build (node build.mjs --split): after the first visit the game starts from the cache
// and works without a network. The page itself is fetched from the network first, so a new version always arrives
// when there is a connection; the data files carry a content hash in their names and never change.
const VER = 'bn-__VER__', FILES = __FILES__;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(['./'].concat(FILES))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('bn-') && k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// media elements ask for byte ranges and Safari insists on a 206 answer: cut the range out of the cached file
async function ranged(req, res) {
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || ''); if (!m) return res;
  const buf = await res.arrayBuffer(), n = buf.byteLength;
  let a = m[1] === '' ? Math.max(0, n - Number(m[2])) : Number(m[1]), b = m[1] === '' || m[2] === '' ? n - 1 : Math.min(n - 1, Number(m[2]));
  if (a > b || a >= n) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + n } });
  return new Response(buf.slice(a, b + 1), { status: 206, headers: { 'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream', 'Content-Range': 'bytes ' + a + '-' + b + '/' + n, 'Content-Length': String(b - a + 1), 'Accept-Ranges': 'bytes' } });
}
self.addEventListener('fetch', (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  const name = u.pathname.slice(u.pathname.lastIndexOf('/') + 1);
  if (FILES.includes(name)) { // hashed data file: cache first
    e.respondWith(caches.open(VER).then(async (c) => {
      let res = await c.match(name);
      if (!res) { res = await fetch(name); if (res.ok) await c.put(name, res.clone()); else return res; }
      return req.headers.has('range') ? ranged(req, res) : res;
    }));
  } else if (req.mode === 'navigate') { // the page: network first (query string kept), the cached copy when offline
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(VER).then((c) => c.put('./', cp)); } return res; },
      () => caches.open(VER).then((c) => c.match('./'))));
  }
});
