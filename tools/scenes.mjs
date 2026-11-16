// Fixed verification scenes. Each: { name, setup (page-side JS string), steps (sim frames at 1/60 after setup) }
export const SCENES = [
  { name: '1-start-midday', setup: `__tod(1); __api.snow(0); __R.snowAmt=0; (()=>{const s=__W.start; __tp(s.x,s.z,s.yaw); __R.force=null; __R.auto={i:__W.startI+10}; __chase(0.5,0.16,15);})()`, steps: 300, post: `__R.auto=null` },
  { name: '2-groomed-vs-ungroomed', setup: `__tod(2); (()=>{const L=__W.playLake; const yaw=Math.atan2(-L.ax,-L.az); __tp(L.x-L.ax*110+L.az*38,L.z-L.az*110-L.ax*38,yaw); __R.force=[1,0.0]; __chase(-0.55,0.2,12);})()`, steps: 620, post: `__R.force=[1,0.12]`, steps2: 200 },
  { name: '3-holmenkollen-vista', setup: `__tod(2); __R.force=[0,0]; (()=>{__tp(-500,1400,0); __look(-470,45,1500, -800,40,1185);})()`, steps: 30 },
  { name: '4-night-headlights', setup: `__tod(4); (()=>{const t=__W.trails[0]; const i=Math.min(150,t.n-30); const x=t.pts[i*2], z=t.pts[i*2+1]; const yaw=Math.atan2(-(t.pts[i*2+8]-x), -(t.pts[i*2+9]-z)); __tp(x,z,yaw); __R.force=null; __R.auto={i:i+6}; __chase(2.55,0.12,13);})()`, steps: 360, post: `__R.auto=null; __R.force=[0,0]` },
  { name: '5-forest-trail', setup: `__tod(1); __R.auto=null; (()=>{const t=__W.trails[0]; const i=Math.min(110,t.n-30); const x=t.pts[i*2], z=t.pts[i*2+1]; const yaw=Math.atan2(-(t.pts[i*2+8]-x), -(t.pts[i*2+9]-z)); __tp(x,z,yaw); __R.force=[0,0]; __look(x+Math.sin(yaw)*16+3, 1.7, z+Math.cos(yaw)*16, x, 1.5, z);})()`, steps: 30 },
  { name: '6-frognerseteren-blue-hour', setup: `__tod(3); (()=>{const c=__W.cabin; __R.force=[0,0]; const fx=Math.sin(c.yaw), fz=Math.cos(c.yaw); __tp(c.x+fx*30-fz*14,c.z+fz*30+fx*14,c.yaw+2.2); __look(c.x+fx*52+fz*26,7,c.z+fz*52-fx*26, c.x,5,c.z);})()`, steps: 400 },
  { name: '7-tryvann-tower', setup: `__tod(1); __R.force=[0,0]; (()=>{const T=__W.lm.tower; __tp(T.x+150,T.z+230,0); __look(T.x+170,25,T.z+260, T.x,55,T.z);})()`, steps: 30 },
  { name: '8-city-view', setup: `__tod(2); __R.force=[0,0]; (()=>{__tp(-1000,700,0); __look(-1000,30,700, -1200,0,900);})()`, steps: 30 },
];
export const MOBILE = [
  { name: 'm1-landscape-day', w: 852, h: 393, setup: `__tod(1); (()=>{const b=__W.bogs[0]; __tp(b.x-55,b.z+20,-1.9); __R.force=[1,0.05]; __chase(-0.5,0.2,12);})()`, steps: 500 },
  { name: 'm2-landscape-night', w: 852, h: 393, setup: `__tod(4); (()=>{const t=__W.trails[0]; const i=150; const x=t.pts[i*2], z=t.pts[i*2+1]; __tp(x,z,Math.atan2(-(t.pts[i*2+8]-x), -(t.pts[i*2+9]-z))); __R.force=null; __R.auto={i:i+6}; __chase(2.4,0.14,13);})()`, steps: 300, post: `__R.auto=null` },
  { name: 'm3-portrait', w: 393, h: 852, setup: `__tod(1); (()=>{const s=__W.start; __tp(s.x,s.z,s.yaw); __R.force=null; __R.auto={i:20}; __chase(0.25,0.25,15);})()`, steps: 420, post: `__R.auto=null` },
];
