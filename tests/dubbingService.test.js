import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dubbingService } from '../src/services/dubbingService.js'
import { Project } from '../src/models/project.js'

describe('DubbingService', () => {
  it('should extract dialogue lines from project', () => {
    const project = new Project({ name: 'Test' })
    project.addShot({ narration: '这是旁白', dialogue: '' })
    project.addShot({ narration: '', dialogue: '这是台词' })
    project.addShot({ narration: '', dialogue: '' })

    const lines = dubbingService.extractDialogueLines(project)
    assert.equal(lines.length, 2)
    assert.equal(lines[0].type, 'narration')
    assert.equal(lines[1].type, 'dialogue')
  })

  it('should return empty when no dialogue', () => {
    const project = new Project({ name: 'Test' })
    project.addShot({ narration: '', dialogue: '' })
    const lines = dubbingService.extractDialogueLines(project)
    assert.equal(lines.length, 0)
  })

  it('should generate SRT format correctly', () => {
    const audioTracks = [
      { text: '第一句台词', startTime: 0, endTime: 2.5 },
      { text: '第二句台词', startTime: 2.5, endTime: 5.0 },
    ]
    const srt = dubbingService.generateSRT(audioTracks)
    assert.ok(srt.includes('1'))
    assert.ok(srt.includes('00:00:00,000 --> 00:00:02,500'))
    assert.ok(srt.includes('第一句台词'))
    assert.ok(srt.includes('2'))
  })

  it('should format SRT time correctly', () => {
    assert.equal(dubbingService.formatSRTTime(0), '00:00:00,000')
    assert.equal(dubbingService.formatSRTTime(61.5), '00:01:01,500')
    assert.equal(dubbingService.formatSRTTime(3661.123), '01:01:01,123')
  })

  it('should generate dubbing for project with dialogue', async () => {
    const project = new Project({ name: 'Test' })
    project.addShot({ narration: '在一个遥远的星系', dialogue: '' })
    project.addShot({ narration: '', dialogue: '你好，世界' })

    const result = await dubbingService.generateDubbing({
      project,
      language: 'zh',
    })
    assert.equal(result.success, true)
    assert.equal(result.audioTracks.length, 2)
    assert.ok(result.subtitles.content.includes('在一个遥远的星系'))
    assert.ok(result.totalDuration > 0)
  })

  it('should return failure when no dialogue', async () => {
    const project = new Project({ name: 'Test' })
    project.addShot({ narration: '', dialogue: '' })

    const result = await dubbingService.generateDubbing({ project })
    assert.equal(result.success, false)
    assert.ok(result.message.includes('无台词'))
  })

  it('should get available voices', async () => {
    const voices = await dubbingService.getAvailableVoices()
    assert.ok(voices.length > 0)
    assert.ok(voices[0].id)
    assert.ok(voices[0].name)
  })
})
