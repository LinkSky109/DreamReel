#!/usr/bin/env node
/**
 * 真实 Provider 手动验证脚本
 * REAL-01 / REAL-02 / REAL-03
 *
 * 使用方法:
 *   1. 在 .env 中配置对应 Provider 的 API Key
 *   2. 运行: node scripts/verify-real-providers.js
 *
 * 验证内容:
 *   - Video: generateVideo + getTaskStatus 真实调用
 *   - LLM: generate + generateJSON 真实调用
 *   - TTS: synthesize 真实调用
 */

import dotenv from 'dotenv'
dotenv.config()

import { RunwayVideoProvider } from '../src/providers/runwayVideoProvider.js'
import { PikaVideoProvider } from '../src/providers/pikaVideoProvider.js'
import { MinimaxVideoProvider } from '../src/providers/minimaxVideoProvider.js'
import { SeedanceVideoProvider } from '../src/providers/seedanceVideoProvider.js'
import { WanVideoProvider } from '../src/providers/wanVideoProvider.js'
import { OpenAILLMProvider } from '../src/providers/openaiLLMProvider.js'
import { ElevenLabsTTSProvider } from '../src/providers/elevenLabsTTSProvider.js'

const TEST_PROMPT_VIDEO = 'A serene landscape with mountains and a lake at sunset, cinematic lighting'
const TEST_PROMPT_SCRIPT = '一个年轻人在雨夜的城市街头，发现了一把能打开任何门的神秘钥匙'
const TEST_TEXT_TTS = 'Hello, this is a test of the ElevenLabs text-to-speech system.'

function printDivider(title) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${'='.repeat(60)}`)
}

function printResult(label, result) {
  console.log(`\n[${label}]`)
  console.log(JSON.stringify(result, null, 2))
}

function printError(label, error) {
  console.log(`\n[${label} - ERROR]`)
  console.log(`  Message: ${error.message}`)
  if (error.stack) {
    console.log(`  Stack: ${error.stack.split('\n')[1]?.trim()}`)
  }
}

// ============================================================
// REAL-01: 视频生成验证
// ============================================================

async function verifyVideoProvider(name, ProviderClass, config) {
  printDivider(`REAL-01: ${name} 视频生成`)

  const provider = new ProviderClass(config)

  // 检查配置
  console.log(`Provider: ${provider.name}`)
  console.log(`API Key configured: ${!!(config.apiKey || config.runwayApiKey || config.pikaApiKey || config.minimaxApiKey || config.seedanceApiKey || config.wanApiKey)}`)
  console.log(`Supports reference images: ${provider.supportsReferenceImages()}`)

  try {
    const startTime = Date.now()

    // 1. 发起生成任务
    console.log('\n[1/3] 发起视频生成任务...')
    const genResult = await provider.generateVideo({
      prompt: TEST_PROMPT_VIDEO,
      duration: 5,
      resolution: '720p',
      aspectRatio: '16:9',
    })
    printResult('生成任务', genResult)

    // 2. 查询任务状态（仅查询一次，不等待完成）
    console.log('\n[2/3] 查询任务状态...')
    const statusResult = await provider.getTaskStatus(genResult.taskId)
    printResult('任务状态', statusResult)

    const elapsed = Date.now() - startTime
    console.log(`\n[3/3] 耗时: ${elapsed}ms`)

    return {
      provider: name,
      success: true,
      taskId: genResult.taskId,
      status: statusResult.status,
      elapsedMs: elapsed,
    }
  } catch (error) {
    printError(`${name} 视频生成`, error)
    return {
      provider: name,
      success: false,
      error: error.message,
    }
  }
}

async function verifyAllVideoProviders() {
  const results = []

  // Runway
  if (process.env.RUNWAY_API_KEY) {
    results.push(await verifyVideoProvider('Runway', RunwayVideoProvider, {
      runwayApiKey: process.env.RUNWAY_API_KEY,
      model: process.env.RUNWAY_MODEL || 'gen3a_turbo',
    }))
  } else {
    console.log('\n[Runway] SKIP: RUNWAY_API_KEY not configured')
  }

  // Pika
  if (process.env.PIKA_API_KEY) {
    results.push(await verifyVideoProvider('Pika', PikaVideoProvider, {
      pikaApiKey: process.env.PIKA_API_KEY,
      model: process.env.PIKA_MODEL || 'pika-1.0',
    }))
  } else {
    console.log('\n[Pika] SKIP: PIKA_API_KEY not configured')
  }

  // Minimax
  if (process.env.MINIMAX_API_KEY && process.env.MINIMAX_GROUP_ID) {
    results.push(await verifyVideoProvider('Minimax', MinimaxVideoProvider, {
      minimaxApiKey: process.env.MINIMAX_API_KEY,
      minimaxGroupId: process.env.MINIMAX_GROUP_ID,
      minimaxModel: process.env.MINIMAX_MODEL || 'video-01',
    }))
  } else {
    console.log('\n[Minimax] SKIP: MINIMAX_API_KEY or MINIMAX_GROUP_ID not configured')
  }

  // Seedance
  if (process.env.SEEDANCE_API_KEY) {
    results.push(await verifyVideoProvider('Seedance', SeedanceVideoProvider, {
      seedanceApiKey: process.env.SEEDANCE_API_KEY,
      seedanceModel: process.env.SEEDANCE_MODEL || 'seedance-2.5',
    }))
  } else {
    console.log('\n[Seedance] SKIP: SEEDANCE_API_KEY not configured')
  }

  // Wan
  if (process.env.WAN_API_KEY) {
    results.push(await verifyVideoProvider('Wan', WanVideoProvider, {
      wanApiKey: process.env.WAN_API_KEY,
      wanModel: process.env.WAN_MODEL || 'wanx2.1-t2v-plus',
    }))
  } else {
    console.log('\n[Wan] SKIP: WAN_API_KEY not configured')
  }

  return results
}

// ============================================================
// REAL-02: 剧本生成验证
// ============================================================

async function verifyLLMProvider() {
  printDivider('REAL-02: OpenAI 剧本生成')

  if (!process.env.OPENAI_API_KEY) {
    console.log('[OpenAI] SKIP: OPENAI_API_KEY not configured')
    return { provider: 'openai', success: false, reason: 'API_KEY_NOT_CONFIGURED' }
  }

  const provider = new OpenAILLMProvider({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  })

  try {
    const startTime = Date.now()

    // 1. 测试普通文本生成
    console.log('\n[1/2] 测试文本生成...')
    const genResult = await provider.generate({
      systemPrompt: '你是一位专业的电影编剧。',
      userPrompt: `根据以下想法生成一个短剧剧本概要：${TEST_PROMPT_SCRIPT}`,
      options: { temperature: 0.8, maxTokens: 500 },
    })
    printResult('文本生成', {
      contentLength: genResult.content.length,
      model: genResult.model,
      usage: genResult.usage,
      contentPreview: genResult.content.slice(0, 200) + '...',
    })

    // 2. 测试 JSON 结构化生成
    console.log('\n[2/2] 测试 JSON 剧本生成...')
    const jsonResult = await provider.generateJSON({
      systemPrompt: `你是一位专业的电影编剧和分镜师。根据用户的一句话想法，生成完整的分镜脚本。
输出必须是严格的 JSON 格式，包含 synopsis、characters、shots 字段。`,
      userPrompt: `核心想法：${TEST_PROMPT_SCRIPT}
目标时长：20秒（约4个镜头）
画面比例：横屏16:9电影构图

请生成完整分镜脚本。`,
      options: { temperature: 0.7, maxTokens: 2000 },
    })
    printResult('JSON 剧本', {
      hasSynopsis: !!jsonResult.data.synopsis,
      characterCount: jsonResult.data.characters?.length || 0,
      shotCount: jsonResult.data.shots?.length || 0,
      usage: jsonResult.usage,
    })

    const elapsed = Date.now() - startTime
    console.log(`\n总耗时: ${elapsed}ms`)

    return {
      provider: 'openai',
      success: true,
      textGen: { contentLength: genResult.content.length, model: genResult.model },
      jsonGen: {
        hasSynopsis: !!jsonResult.data.synopsis,
        characterCount: jsonResult.data.characters?.length || 0,
        shotCount: jsonResult.data.shots?.length || 0,
      },
      elapsedMs: elapsed,
    }
  } catch (error) {
    printError('OpenAI 剧本生成', error)
    return { provider: 'openai', success: false, error: error.message }
  }
}

// ============================================================
// REAL-03: 配音验证
// ============================================================

async function verifyTTSProvider() {
  printDivider('REAL-03: ElevenLabs 配音生成')

  if (!process.env.ELEVENLABS_API_KEY) {
    console.log('[ElevenLabs] SKIP: ELEVENLABS_API_KEY not configured')
    return { provider: 'elevenlabs', success: false, reason: 'API_KEY_NOT_CONFIGURED' }
  }

  const provider = new ElevenLabsTTSProvider({
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    defaultVoiceId: process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4Tlv',
    modelId: process.env.ELEVENLABS_MODEL || 'eleven_monolingual_v1',
  })

  try {
    const startTime = Date.now()

    console.log('\n[1/2] 测试语音合成...')
    const result = await provider.synthesize({
      text: TEST_TEXT_TTS,
      language: 'en',
      voiceId: '21m00Tcm4Tlv',
      speed: 1.0,
    })
    printResult('语音合成', result)

    // 验证返回格式一致性
    console.log('\n[2/2] 验证返回格式...')
    const checks = {
      hasAudioUrl: typeof result.audioUrl === 'string' && result.audioUrl.length > 0,
      hasDuration: typeof result.duration === 'number' && result.duration > 0,
      audioUrlStartsWithStorage: result.audioUrl?.startsWith('/storage/'),
    }
    printResult('格式检查', checks)

    const elapsed = Date.now() - startTime
    console.log(`\n总耗时: ${elapsed}ms`)

    return {
      provider: 'elevenlabs',
      success: true,
      audioUrl: result.audioUrl,
      duration: result.duration,
      formatChecks: checks,
      elapsedMs: elapsed,
    }
  } catch (error) {
    printError('ElevenLabs 配音', error)
    return { provider: 'elevenlabs', success: false, error: error.message }
  }
}

// ============================================================
// 主程序
// ============================================================

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('  DreamReel 真实 Provider 验证脚本')
  console.log('  时间: ' + new Date().toISOString())
  console.log('='.repeat(60))

  const allResults = {
    video: [],
    llm: null,
    tts: null,
  }

  // REAL-01: 视频生成
  allResults.video = await verifyAllVideoProviders()

  // REAL-02: 剧本生成
  allResults.llm = await verifyLLMProvider()

  // REAL-03: 配音
  allResults.tts = await verifyTTSProvider()

  // 汇总报告
  printDivider('验证结果汇总')

  console.log('\n[视频生成 Provider]')
  for (const r of allResults.video) {
    const icon = r.success ? '✅' : '❌'
    console.log(`  ${icon} ${r.provider}: ${r.success ? `taskId=${r.taskId}, status=${r.status}` : r.error || r.reason}`)
  }

  console.log('\n[剧本生成 Provider]')
  if (allResults.llm) {
    const icon = allResults.llm.success ? '✅' : '❌'
    console.log(`  ${icon} OpenAI: ${allResults.llm.success ? `text=${allResults.llm.textGen?.contentLength}chars, shots=${allResults.llm.jsonGen?.shotCount}` : allResults.llm.error || allResults.llm.reason}`)
  }

  console.log('\n[配音 Provider]')
  if (allResults.tts) {
    const icon = allResults.tts.success ? '✅' : '❌'
    console.log(`  ${icon} ElevenLabs: ${allResults.tts.success ? `duration=${allResults.tts.duration}s, url=${allResults.tts.audioUrl}` : allResults.tts.error || allResults.tts.reason}`)
  }

  // 保存结果到文件
  const reportPath = './storage/provider-verification-report.json'
  const fs = await import('fs')
  fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2))
  console.log(`\n详细报告已保存: ${reportPath}`)

  // 统计
  const videoSuccess = allResults.video.filter((r) => r.success).length
  const videoTotal = allResults.video.length
  const llmSuccess = allResults.llm?.success ? 1 : 0
  const ttsSuccess = allResults.tts?.success ? 1 : 0

  console.log(`\n统计: 视频 ${videoSuccess}/${videoTotal} | LLM ${llmSuccess}/1 | TTS ${ttsSuccess}/1`)

  // 退出码
  const totalSuccess = videoSuccess + llmSuccess + ttsSuccess
  const totalExpected = videoTotal + 1 + 1

  if (totalSuccess === totalExpected && totalExpected > 0) {
    console.log('\n🎉 所有 Provider 验证通过！')
    process.exit(0)
  } else if (totalSuccess === 0) {
    console.log('\n⚠️  未配置任何 API Key，跳过真实调用验证')
    console.log('   请参照 docs/API_KEY_GUIDE.md 配置后重试')
    process.exit(0)
  } else {
    console.log(`\n⚠️  部分 Provider 验证失败 (${totalSuccess}/${totalExpected})`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('验证脚本执行失败:', error)
  process.exit(1)
})
