import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { titleSequenceService, TITLE_TEMPLATES } from '../src/services/titleSequenceService.js'
import { ffmpeg } from '../src/utils/ffmpeg.js'

const execFileAsync = promisify(execFile)

/** 读取 mp4 的流信息（codec_type / codec_name） */
async function probeStreams(file) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name',
    '-of', 'json',
    file,
  ])
  return JSON.parse(stdout).streams
}

/**
 * 抽一帧原始 RGB24 像素，统计接近目标色的像素数量。
 * 用于证明片名（主色）真实上屏，而非纯色背景。
 */
async function countNearColorPixels(file, [tr, tg, tb], tolerance = 45, atSec = 2) {
  const { stdout } = await execFileAsync(
    'ffmpeg',
    [
      '-v', 'error',
      '-ss', String(atSec),
      '-i', file,
      '-vframes', '1',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgb24',
      'pipe:1',
    ],
    { maxBuffer: 64 * 1024 * 1024, encoding: 'buffer' }
  )
  let count = 0
  for (let i = 0; i + 2 < stdout.length; i += 3) {
    const r = stdout[i]
    const g = stdout[i + 1]
    const b = stdout[i + 2]
    if (
      Math.abs(r - tr) <= tolerance &&
      Math.abs(g - tg) <= tolerance &&
      Math.abs(b - tb) <= tolerance
    ) {
      count += 1
    }
  }
  return count
}

describe('R28 创意片头模块', () => {
  let tmpDir

  before(() => {
    tmpDir = path.join(os.tmpdir(), `dreamreel-title-${Date.now()}`)
    fs.mkdirSync(tmpDir, { recursive: true })
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('内置至少 4 个模板，且字段完整', () => {
    const templates = titleSequenceService.listTemplates()
    assert.ok(templates.length >= 4, `应有 >=4 个模板，实际 ${templates.length}`)
    const requiredIds = ['classic-gold', 'glitch-cyber', 'ink-wash', 'neon-retro']
    for (const id of requiredIds) {
      assert.ok(templates.find((t) => t.id === id), `缺少模板 ${id}`)
    }
    for (const t of templates) {
      assert.ok(t.name, '模板应有 name')
      assert.ok(t.visualDescription, '模板应有 visualDescription')
      assert.ok(t.musicMood, '模板应有 musicMood')
      assert.ok(t.ffmpeg, '模板应有 ffmpeg 标题卡参数')
      assert.ok(t.ffmpeg.duration >= 3 && t.ffmpeg.duration <= 5, '标题卡时长应在 3-5 秒')
    }
    assert.equal(templates.length, TITLE_TEMPLATES.length)
  })

  it('按 id 查询模板成功；模板不存在时抛出错误', () => {
    const t = titleSequenceService.getTemplate('ink-wash')
    assert.equal(t.name, '水墨国风')
    assert.throws(() => titleSequenceService.getTemplate('not-exist'), /Title template not found/)
  })

  it('生成片头：含 h264 视频流 + aac 音轨，时长 3-5 秒', async () => {
    const result = await titleSequenceService.generateTitleSequence({
      templateId: 'classic-gold',
      projectId: 'demo-proj',
      title: '梦卷开篇',
      subtitle: '第一集',
      outputDir: tmpDir,
    })

    assert.ok(fs.existsSync(result.filePath), '输出文件应存在')
    assert.ok(result.videoUrl.startsWith('/storage/title-sequences/'), 'videoUrl 应为 /storage 可访问路径')

    const streams = await probeStreams(result.filePath)
    const video = streams.find((s) => s.codec_type === 'video')
    const audio = streams.find((s) => s.codec_type === 'audio')
    assert.ok(video, '应包含视频流')
    assert.equal(video.codec_name, 'h264', '视频流应为 h264')
    assert.ok(audio, '应包含音频流')
    assert.equal(audio.codec_name, 'aac', '音频流应为 aac')

    const duration = await ffmpeg.getDuration(result.filePath)
    assert.ok(duration >= 2.9 && duration <= 5.5, `时长应在 3-5 秒附近，实际 ${duration}`)

    assert.equal(result.title, '梦卷开篇')
    assert.equal(result.subtitle, '第一集')
    assert.equal(result.titleRendered, true, '片名应真实上屏')
    assert.equal(result.audioTrack, true)
    assert.equal(result.audio, 'silent')
  })

  it('片名真实上屏：首帧含足量烫金 #d9b45a 像素', async () => {
    const result = await titleSequenceService.generateTitleSequence({
      templateId: 'classic-gold',
      projectId: 'pixel-probe',
      title: '像素验证',
      outputDir: tmpDir,
    })

    // #d9b45a = (217, 180, 90)
    const goldPixels = await countNearColorPixels(result.filePath, [217, 180, 90], 45, 2)
    assert.ok(goldPixels > 200, `烫金片名像素应 >200，实际 ${goldPixels}`)
  })

  it('生成时模板缺失抛出 404 语义错误', async () => {
    await assert.rejects(
      titleSequenceService.generateTitleSequence({
        templateId: 'ghost-template',
        title: '标题',
        outputDir: tmpDir,
      }),
      /Title template not found/
    )
  })

  it('参数校验：title 为空时抛出 400 语义错误', async () => {
    await assert.rejects(
      titleSequenceService.generateTitleSequence({
        templateId: 'classic-gold',
        title: '   ',
        outputDir: tmpDir,
      }),
      /title 不能为空/
    )
  })
})
