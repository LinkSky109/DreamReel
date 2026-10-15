import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devDbPath = path.join(repoRoot, 'storage', 'data', 'db.json')
const testRoot = path.join(repoRoot, 'storage', 'test-run')
const setupPath = path.join(repoRoot, 'tests', 'setup-isolated-storage.js')

function readCounts() {
  try {
    const data = JSON.parse(fs.readFileSync(devDbPath, 'utf-8'))
    return {
      projects: Object.keys(data.projects || {}).length,
      studios: Object.keys(data.studios || {}).length,
      imageAssets: Object.keys(data.imageAssets || {}).length,
    }
  } catch {
    return { projects: 0, studios: 0, imageAssets: 0 }
  }
}

const before = readCounts()
fs.rmSync(testRoot, { recursive: true, force: true })
fs.mkdirSync(testRoot, { recursive: true })

const testFiles = fs
  .readdirSync(path.join(repoRoot, 'tests'))
  .filter((file) => file.endsWith('.test.js'))
  .sort()
  .map((file) => path.join('tests', file))

const result = spawnSync(
  process.execPath,
  // 限制并发：默认按 CPU 数并行会同时跑多个 ffmpeg（mock 占位视频/成片），
  // 高负载下偶发 ffmpeg 失败导致 flaky（见 TICKET-27-04）。降到 4 提升稳定性。
  ['--test', '--test-concurrency=4', '--import', pathToFileURL(setupPath).href, ...testFiles],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-for-dreamreel-testing-only-32chars',
      // 测试必须确定性：强制 mock provider，避免 .env 里的真实 key 触发外网调用
      LLM_PROVIDER: 'mock',
      VIDEO_PROVIDER: 'mock',
      IMAGE_PROVIDER: 'mock',
      TTS_PROVIDER: 'mock',
      // 清空真实 key，保证 isProviderConfigured 断言稳定（不依赖本地 .env）
      OPENAI_API_KEY: '',
      OPENAI_IMAGE_API_KEY: '',
      SEEDANCE_API_KEY: '',
      RUNWAY_API_KEY: '',
      PIKA_API_KEY: '',
      MINIMAX_API_KEY: '',
      WAN_API_KEY: '',
      ELEVENLABS_API_KEY: '',
    },
  }
)

const after = readCounts()
fs.rmSync(testRoot, { recursive: true, force: true })

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

if (
  before.projects !== after.projects ||
  before.studios !== after.studios ||
  before.imageAssets !== after.imageAssets
) {
  console.error(
    `[test-isolation] 开发库被污染：projects ${before.projects}->${after.projects}, ` +
      `studios ${before.studios}->${after.studios}, imageAssets ${before.imageAssets}->${after.imageAssets}`
  )
  process.exit(1)
}

console.log(
  `[test-isolation] OK：开发库未被修改（projects=${after.projects}, studios=${after.studios}, imageAssets=${after.imageAssets}）`
)
