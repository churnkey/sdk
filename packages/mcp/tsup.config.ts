import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    entry: { bin: 'src/bin.ts' },
    format: ['esm'],
    sourcemap: true,
    clean: false,
    banner: { js: '#!/usr/bin/env node' },
  },
])
