import { Router } from 'express'
import os from 'os'
import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import { fileURLToPath } from 'url'
import { performanceMonitor } from '../services/performanceMonitor.js'

const router = Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const STORAGE_DIR = path.resolve(__dirname, '..', '..', config.storage.path)
const startTime = Date.now()

/**
 * 获取系统信息
 */
router.get('/info', (req, res) => {
  try {
    // 计算存储使用情况
    let storageUsed = 0
    let storageFiles = 0
    try {
      const files = getAllFiles(STORAGE_DIR)
      for (const file of files) {
        try {
          const stats = fs.statSync(file)
          storageUsed += stats.size
          storageFiles++
        } catch (e) {
          // 忽略无法访问的文件
        }
      }
    } catch (e) {
      // 存储目录可能不存在
    }

    const info = {
      app: {
        name: 'DreamReel',
        version: '0.1.0',
        env: config.env,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        startTime: new Date(startTime).toISOString(),
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        hostname: os.hostname(),
        loadAvg: os.loadavg(),
      },
      process: {
        pid: process.pid,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
      },
      storage: {
        path: STORAGE_DIR,
        usedBytes: storageUsed,
        usedMB: (storageUsed / 1024 / 1024).toFixed(2),
        fileCount: storageFiles,
      },
      config: {
        port: config.port,
        videoProvider: config.video.provider,
        llmProvider: config.llm.provider,
        ttsProvider: config.tts.provider,
        maxConcurrent: config.video.maxConcurrent,
      },
    }
    res.json(info)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 健康检查（详细版）
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
  })
})

/**
 * 递归获取目录下所有文件
 */
function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles
  const files = fs.readdirSync(dirPath)
  for (const file of files) {
    const fullPath = path.join(dirPath, file)
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles)
    } else {
      arrayOfFiles.push(fullPath)
    }
  }
  return arrayOfFiles
}

/**
 * 获取性能监控报告
 */
router.get('/performance', (req, res) => {
  try {
    const report = performanceMonitor.getFullReport()
    res.json(report)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取系统资源使用
 */
router.get('/performance/resources', (req, res) => {
  try {
    const resources = performanceMonitor.getSystemResources()
    res.json(resources)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取请求统计
 */
router.get('/performance/requests', (req, res) => {
  try {
    const stats = performanceMonitor.getRequestStats()
    res.json(stats)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取历史趋势
 */
router.get('/performance/history', (req, res) => {
  try {
    const history = performanceMonitor.getHistory()
    res.json(history)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 重置性能统计
 */
router.post('/performance/reset', (req, res) => {
  try {
    performanceMonitor.reset()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
