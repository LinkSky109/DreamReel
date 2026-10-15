#!/usr/bin/env node
/**
 * 启动本机 OpenCode 2.x 服务（LLM 抽取/剧本依赖）。
 *
 * 背景：`ai-sdk-provider-opencode-sdk@5` 需要 OpenCode 2.x；
 * 系统里 `opencode`（Homebrew）是 1.x，不兼容。此脚本用 npx 拉起官方 2.x CLI。
 *
 * 用法：`npm run llm:serve`（读取 .env 的 OPENCODE_PASSWORD / OPENCODE_SERVE_PORT）
 */
import 'dotenv/config'
import { spawn } from 'child_process'

const port = process.env.OPENCODE_SERVE_PORT || '4096'
const password = process.env.OPENCODE_PASSWORD || 'dreamreel-dev'
const version = process.env.OPENCODE_CLI_VERSION || '2.0.24'

console.log(`[llm:serve] 启动 OpenCode ${version} 服务 http://127.0.0.1:${port}（Basic auth: opencode:<password>）`)
console.log('[llm:serve] 停止：Ctrl+C')

const child = spawn(
  'npx',
  ['-y', `@opencode/cli@${version}`, 'serve', '--port', String(port)],
  { stdio: 'inherit', env: { ...process.env, OPENCODE_PASSWORD: password } }
)

child.on('exit', (code) => process.exit(code ?? 0))
child.on('error', (error) => {
  console.error(`[llm:serve] 启动失败：${error.message}`)
  process.exit(1)
})
