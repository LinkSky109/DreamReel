import { defineConfig } from '@playwright/test'

/**
 * 真实浏览器 E2E。
 *
 * 运行前需要：
 *   1. 独立 API（建议独立 STORAGE_PATH，避免污染开发库）
 *   2. Vite dev server，且 API_PROXY 指向该 API
 *
 * 例：
 *   PORT=3201 STORAGE_PATH=/tmp/dreamreel-e2e-storage DB_DRIVER=json \
 *     NOVEL_REPO_MODE=legacy NOVEL_WRITE_MODE=legacy OUTBOX_ENABLED=false \
 *     LLM_PROVIDER=mock VIDEO_PROVIDER=mock IMAGE_PROVIDER=mock TTS_PROVIDER=mock \
 *     node src/server.js
 *
 *   API_PROXY=http://localhost:3201 npm run dev:web
 *   E2E_BASE_URL=http://localhost:5173 npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['line']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    // 复用系统 Chrome，避免额外下载浏览器；CI 可切到 chromium。
    channel: process.env.E2E_CHANNEL || 'chrome',
    headless: process.env.E2E_HEADLESS !== 'false',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
})
