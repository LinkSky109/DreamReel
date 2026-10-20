import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const webRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  base: '/',
  build: {
    // 构建产物直接落到 Express 静态目录；保留 legacy 前端文件用于渐进迁移
    outDir: fileURLToPath(new URL('../public', import.meta.url)),
    emptyOutDir: false,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/storage': 'http://localhost:3000',
      '/js': 'http://localhost:3000',
      '/css': 'http://localhost:3000',
      '/icons': 'http://localhost:3000',
      '/manifest.webmanifest': 'http://localhost:3000',
      '/sw.js': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
})
