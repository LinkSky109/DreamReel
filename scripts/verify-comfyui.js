#!/usr/bin/env node
/**
 * ComfyUI 视频 Provider 真实验证脚本
 *
 * 对真实 ComfyUI（默认 http://192.168.31.113:8188）跑一次端到端：
 *   健康检查 → 校验节点 → 提交工作流 → 轮询 → 下载产物 → 报告
 *
 * 用法：
 *   node scripts/verify-comfyui.js                       # 用默认地址 + sample_scene.png
 *   COMFYUI_BASE_URL=http://x:8188 node scripts/verify-comfyui.js
 *   COMFYUI_START_IMAGE=my.png COMFYUI_LENGTH=33 node scripts/verify-comfyui.js
 *   node scripts/verify-comfyui.js --dry                 # 只校验（不下发真实生成）
 *
 * 注意：真实生成会占用对端 GPU（约 1–3 分钟），且**会真实消耗算力**。
 */

import path from 'path'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const t2v = args.includes('--t2v')
function csv(name) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1].split(',').map((s) => s.trim()).filter(Boolean) : []
}
const imagesArg = csv('--images')
const audiosArg = csv('--audios')

const BASE = process.env.COMFYUI_BASE_URL || 'http://192.168.31.113:8188'
process.env.COMFYUI_BASE_URL = BASE
process.env.COMFYUI_ALLOWED_HOSTS =
  process.env.COMFYUI_ALLOWED_HOSTS || new URL(BASE).hostname
process.env.COMFYUI_POLL_INTERVAL_MS = process.env.COMFYUI_POLL_INTERVAL_MS || '5000'
process.env.COMFYUI_LENGTH = process.env.COMFYUI_LENGTH || '33'
process.env.COMFYUI_STEPS = process.env.COMFYUI_STEPS || '15'
process.env.STORAGE_PATH = process.env.STORAGE_PATH || path.resolve('.', 'storage', 'comfyui-verify')

const { ComfyuiVideoProvider } = await import('../src/providers/comfyuiVideoProvider.js')
const { loadDefaultTemplate, findNode } = await import('../src/providers/comfyuiWorkflow.js')

const startImage = process.env.COMFYUI_START_IMAGE || 'sample_scene.png'
let failures = 0
const check = (name, cond, detail = '') => {
  const ok = Boolean(cond)
  if (!ok) failures++
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? `  (${detail})` : ''}`)
}

async function main() {
  console.log('=== ComfyUI 视频 Provider 验证 ===')
  console.log('目标:', BASE, '| 模式:', t2v ? 'T2V(纯文生视频)' : `I2V(起始图 ${startImage})`, '| 帧数:', process.env.COMFYUI_LENGTH)

  const provider = new ComfyuiVideoProvider()

  // 1) 健康检查
  console.log('\n[1] 健康检查')
  const up = await provider.healthCheck()
  check('ComfyUI 在线 (/system_stats)', up)
  if (!up) throw new Error('ComfyUI 不可达，终止')

  // 2) 校验模板所需节点在实例上存在
  console.log('\n[2] 校验实例节点与模型')
  const oi = await (await fetch(`${BASE}/object_info`)).json()
  const tpl = loadDefaultTemplate()
  const classes = new Set(Object.values(tpl).map((n) => n.class_type))
  for (const c of classes) check(`节点存在: ${c}`, Boolean(oi[c]))
  const unet = oi['UnetLoaderGGUF']?.input?.required?.unet_name?.[0] || []
  const vae = oi['VAELoader']?.input?.required?.vae_name?.[0] || []
  check('Wan GGUF 模型可用', unet.some((m) => /Wan2\.2-TI2V-5B/.test(m)), unet.join(','))
  check('Wan VAE 可用', vae.some((m) => /wan2\.2_vae/.test(m)), vae.slice(0, 3).join(','))

  if (dry) {
    console.log('\n(--dry 跳过真实生成)')
    finish()
    return
  }

  // 3) 真实提交 → 轮询 → 下载
  console.log('\n[3] 真实生成（提交 → 轮询 → 下载）')
  const t0 = Date.now()
  const { taskId } = await provider.generateVideo({
    prompt: 'cinematic slow push-in, gentle camera motion, soft light, high detail',
    ...(imagesArg.length
      ? { images: imagesArg }
      : t2v
        ? {}
        : { startImage }),
    ...(audiosArg.length ? { audios: audiosArg } : {}),
  })
  check('提交成功，拿到 prompt_id', Boolean(taskId), taskId)

  const deadline = Date.now() + 10 * 60 * 1000
  let status = 'generating'
  let result = null
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, Number(process.env.COMFYUI_POLL_INTERVAL_MS) || 5000))
    result = await provider.getTaskStatus(taskId)
    status = result.status
    const el = ((Date.now() - t0) / 1000).toFixed(0)
    console.log(`  [${el}s] ${status}`)
    if (status === 'completed' || status === 'failed' || status === 'not_found') break
  }

  check('任务完成', status === 'completed', status === 'failed' ? result?.error : '')
  if (status === 'completed') {
    check('产出 videoUrl', /^\/storage\/videos\/.+\.(webm|mp4)$/.test(result.videoUrl), result.videoUrl)
    const { default: fs } = await import('fs')
    const local = path.join(process.env.STORAGE_PATH, result.videoUrl.replace('/storage/', ''))
    check('产物已落盘', fs.existsSync(local))
    if (fs.existsSync(local)) {
      check('产物非空', fs.statSync(local).size > 1000, `${fs.statSync(local).size} bytes`)
      console.log(`\n  产物: ${local}`)
    }
    console.log(`  耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  }

  finish()
}

function finish() {
  console.log(`\n=== 验证结果: ${failures === 0 ? '全部通过 ✅' : `${failures} 项失败 ❌`} ===`)
  if (failures > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('验证脚本异常:', e.message)
  process.exitCode = 1
})
