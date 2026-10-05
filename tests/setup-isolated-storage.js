import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const testStorage = path.join(repoRoot, 'storage', 'test-run', `pid-${process.pid}`)

fs.rmSync(testStorage, { recursive: true, force: true })
fs.mkdirSync(testStorage, { recursive: true })

process.env.NODE_ENV = 'test'
process.env.STORAGE_PATH = testStorage
