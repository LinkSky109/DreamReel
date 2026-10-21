import { defineConfig } from '@playwright/test'

/**
 * 自包含 E2E：自动启动独立 API + Vite，不依赖手动服务。
 *
 * - API：scripts/e2e-server.js，独立 STORAGE_PATH（test-results/e2e-storage）
 * - Web：Vite dev server，代理到上面的 API
 * - 本地默认复用系统 Chrome；CI 使用 Playwright Chromium
 *
 * 只跑测试：npm run test:e2e
 * 完整门禁：npm run check:full
 */
const apiPort = Number(process.env.E2E_API_PORT || 3301)
const webPort = Number(process.env.E2E_WEB_PORT || 5273)
const externalBaseUrl = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['line']],
  use: {
    baseURL: externalBaseUrl || `http://127.0.0.1:${webPort}`,
    channel: process.env.E2E_CHANNEL || (process.env.CI ? 'chromium' : 'chrome'),
    headless: process.env.E2E_HEADLESS !== 'false',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: externalBaseUrl
    ? undefined
    : [
        {
          command: 'node scripts/e2e-server.js',
          url: `http://127.0.0.1:${apiPort}/health`,
          timeout: 120_000,
          reuseExistingServer: false,
          env: { E2E_API_PORT: String(apiPort) },
        },
        {
          command: 'npx vite --config web/vite.config.ts',
          url: `http://127.0.0.1:${webPort}/`,
          timeout: 120_000,
          reuseExistingServer: false,
          env: {
            VITE_HOST: '127.0.0.1',
            VITE_PORT: String(webPort),
            API_PROXY: `http://127.0.0.1:${apiPort}`,
          },
        },
      ],
})
