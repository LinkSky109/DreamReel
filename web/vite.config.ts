import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
// WEB_OUT_DIR=dist 时输出到 web/dist，用于前后端分离部署；
// 未设置时保持旧行为（输出到 ../public），避免打断单进程托管模式。
const outDir = process.env.WEB_OUT_DIR
  ? new URL(process.env.WEB_OUT_DIR, new URL('.', import.meta.url)).pathname
  : fileURLToPath(new URL('../public', import.meta.url))
const apiProxy = process.env.API_PROXY || 'http://localhost:3001'

export default defineConfig({
  root: webRoot,
  plugins: [react()],
  base: '/',
  build: {
    outDir,
    emptyOutDir: process.env.WEB_OUT_DIR ? true : false,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // 仅代理 /api/ 前缀；避免 /api-console、/api-keys 等前端路由被误转发到后端
      '^/api/': apiProxy,
      '/storage': apiProxy,
      // 过渡期兼容旧路径
      '/js': apiProxy,
      '/css': apiProxy,
      '/icons': apiProxy,
      '/manifest.webmanifest': apiProxy,
      '/sw.js': apiProxy,
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
