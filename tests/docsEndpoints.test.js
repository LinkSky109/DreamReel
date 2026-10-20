import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('API 文档声明的端点都存在于后端路由', () => {
  const output = execFileSync(process.execPath, ['scripts/check-docs-endpoints.js'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.match(output, /文档缺失：0/)
  assert.match(output, /后端端点：\d+/)
  assert.match(output, /文档端点：39/)
})
