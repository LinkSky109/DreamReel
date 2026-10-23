import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
// WEB_OUT_DIR=dist 时输出到 web/dist，用于前后端分离部署；
// 未设置时保持旧行为（输出到 ../public），避免打断单进程托管模式。
const outDir = process.env.WEB_OUT_DIR
  ? new URL(process.env.WEB_OUT_DIR, new URL('.', import.meta.url)).pathname
  : fileURLToPath(new URL('../public', import.meta.url))

export default defineConfig(({ mode }) => {
  // 从仓库根 .env 读取后端端口，避免 Vite 代理硬编码与 .env.example 漂移。
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const env = loadEnv(mode, repoRoot, '')
  const apiProxy = process.env.API_PROXY || env.API_PROXY || `http://localhost:${env.PORT || 3000}`

  return {
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
      // Playwright 使用 127.0.0.1 探活；显式 host 避免 localhost 只落到 IPv6。
      host: process.env.VITE_HOST || 'localhost',
      port: Number(process.env.VITE_PORT || 5173),
      strictPort: true,
      proxy: {
        // 仅代理 /api/ 前缀；避免 /api-console、/api-keys 等前端路由被误转发到后端
        '^/api/': apiProxy,
        '/storage': apiProxy,
        // 过渡期兼容旧路径
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
      coverage: {
        provider: 'v8',
        reporter: ['text-summary'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/**/*.d.ts', 'src/main.tsx'],
        // R3-T3.7：先把基线锁住，避免覆盖率回退；目标 80% 逐步抬升。
        thresholds: {
          statements: 50,
          branches: 46,
          functions: 35,
          lines: 51,
        },
      },
    },
  }
})
