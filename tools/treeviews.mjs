// Tree look-check renders: forest close-up, edge at mid range, distant forest, golden hour, night, thermal. usage: node tools/treeviews.mjs outdir [extra query] (GPU tools options)
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] || 'shots/trees/views', q = process.argv[3] && !process.argv[3].startsWith('--') ? '&' + process.argv[3] : '';
mkdirSync(out, { recursive: true });
const pass = process.argv.slice(3).filter((v, i, a) => v.startsWith('--') || (i > 0 && a[i - 1].startsWith('--')));
const trail = `const t=__W.trails[0];const i=Math.min(110,t.n-30);const x=t.pts[i*2],z=t.pts[i*2+1];__tp(x+300,z,0);`;
const T = `const T=__W.lm.tower;__tp(T.x+150,T.z+230,0);`;
const jobs = [
  { out: 'a-forest-close', eval: `__tod(1);${trail}__look(x+3,1.8,z+16,x-14,4,z-30)` },
  { out: 'b-forest-mid', eval: `__tod(1);${trail}__look(x+3,6,z+16,x-14,6,z-30)` },
  { out: 'c-tower-forest', eval: `__tod(1);${T}__look(T.x+170,25,T.z+260,T.x,40,T.z)` },
  { out: 'd-distant-forest', eval: `__tod(1);${T}__look(T.x+120,70,T.z+200,T.x-400,0,T.z-900)` },
  { out: 'e-golden', eval: `__tod(2);${trail}__look(x+3,6,z+16,x-14,6,z-30)` },
  { out: 'f-night', eval: `__tod(4);${trail}__look(x+3,1.8,z+16,x-14,4,z-30)` },
  { out: 'h-sky-mid', eval: `__tod(1);${T}__look(T.x+175,1.8,T.z+265,T.x+60,30,T.z+60)` },
  { out: 'g-tops-close', eval: `__tod(1);${T}__look(T.x+170,12,T.z+260,T.x+120,10,T.z+200)` },
].map((j) => ({ ...j, out: `${out}/${j.out}.png`, steps: 24 }));
execFileSync('node', ['tools/multi.mjs', 'nohint&nohud&drs=0' + q, JSON.stringify(jobs), ...pass], { stdio: 'inherit' });
