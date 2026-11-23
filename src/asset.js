// The data files (map blob, music, title image) reach the code in one of two forms, decided by the build:
// base64 text (the single-file build, `node build.mjs`) or a relative URL starting with './' (`node build.mjs --split`,
// where they are separate hashed files beside index.html). Base64 never starts with a dot.
export const isUrl = (a) => a.charCodeAt(0) === 46 && a.charCodeAt(1) === 47;
export async function assetBytes(a) {
  if (isUrl(a)) { const r = await fetch(a); if (!r.ok) throw new Error('download failed: ' + a + ' (' + r.status + ')'); return new Uint8Array(await r.arrayBuffer()); }
  const bin = atob(a), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
export const assetUrl = (a, mime) => (isUrl(a) ? a : `data:${mime};base64,${a}`);
