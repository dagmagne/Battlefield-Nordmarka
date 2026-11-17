// Recorded loops (Freesound, see tools/snd/CREDITS.md), cut by tools/snd/prep.py and embedded as base64 MP3.
// Kept out of audio.js so tools/audio-check.mjs can still import that in Node.
import e0 from './data/snd/e0.mp3';
import e1 from './data/snd/e1.mp3';
import e2 from './data/snd/e2.mp3';
import tk from './data/snd/tk.mp3';
import en from './data/snd/en.mp3';
import dr from './data/snd/dr.mp3';
import meta from './data/snd/meta.json';
export const REC = { e0, e1, e2, tk, en, dr };
export const RECM = meta;
