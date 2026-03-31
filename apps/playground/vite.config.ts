import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const reactSrc = path.resolve(__dirname, '../../packages/react/src')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // In dev, resolve directly to source — no build step needed.
      // Vite handles the TypeScript natively.
      '@churnkey/react/headless': path.resolve(reactSrc, 'headless/index.ts'),
      '@churnkey/react/core': path.resolve(reactSrc, 'core/index.ts'),
      '@churnkey/react/styles.css': path.resolve(reactSrc, 'styles/cancel-flow.css'),
      '@churnkey/react': path.resolve(reactSrc, 'index.ts'),
    },
  },
})
