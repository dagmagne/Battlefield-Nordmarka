// Ambient declarations for the type check (npm run types, tsconfig.json). Not bundled, no effect at run time.
declare module '*.wgsl' { const s: string; export default s; }
declare module '*.bin' { const s: string; export default s; }
declare module '*.mp3' { const s: string; export default s; }
declare module '*.webp' { const s: string; export default s; }

// test hooks (window.__step, __game, ...) and prefixed or newer browser APIs the DOM library does not know
interface Window { [hook: `__${string}`]: any; webkitAudioContext: any; }
interface Navigator { audioSession?: { type: string }; deviceMemory?: number; }
interface Document { webkitFullscreenElement?: Element; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => void; }
interface HTMLElement { webkitRequestFullscreen?: () => void; }
// event targets are DOM elements everywhere in this code
interface EventTarget { closest?: any; dataset?: any; }
interface Event { button?: number; }
// WebGPU flag namespaces (the DOM library has the interfaces but not these constants)
declare const GPUBufferUsage: any, GPUTextureUsage: any, GPUShaderStage: any, GPUColorWrite: any, GPUMapMode: any;
