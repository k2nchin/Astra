import { build } from 'esbuild';
await build({ entryPoints: ['src/lib/wakeword.ts', 'src/lib/brain.ts', 'src/lib/gemini.ts', 'src/lib/actions.ts'], bundle: true, platform: 'node', format: 'esm', outdir: '.build-cache', outExtension: { '.js': '.mjs' } });
