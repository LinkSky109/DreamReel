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
  ['--test', '--import', pathToFileURL(setupPath).href, ...testFiles],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-for-dreamreel-testing-only-32chars',
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
