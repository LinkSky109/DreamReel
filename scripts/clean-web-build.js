import fs from 'node:fs'
import path from 'node:path'

// Vite 配置了 emptyOutDir:false（避免删除 legacy public 资源），
// 因此构建前手动清理上一次的哈希产物。
const assetsDir = path.join(process.cwd(), 'public', 'assets')
fs.rmSync(assetsDir, { recursive: true, force: true })
console.log('[web] cleaned public/assets')
