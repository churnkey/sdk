import { buildSync } from 'esbuild'
import { defineConfig } from 'tsup'
import { createHtml } from './src/ui/html'

const script = buildSync({
  entryPoints: ['src/ui/app.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
}).outputFiles[0].text
const define = { __FLOW_EXPLORER_HTML__: JSON.stringify(createHtml(script)) }

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    define,
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: { bin: 'src/bin.ts' },
    format: ['esm'],
    define,
    sourcemap: true,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
  },
])
