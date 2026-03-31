import { defineConfig } from 'tsup'
import { copyFileSync } from 'node:fs'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'headless': 'src/headless/index.ts',
    'core': 'src/core/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: true,
  external: ['react', 'react-dom'],
  onSuccess: () => {
    copyFileSync('src/styles/cancel-flow.css', 'dist/styles.css')
  },
})
