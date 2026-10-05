import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportHistoryService } from '../src/services/exportHistoryService.js'

const TEST_PROJECT = 'export_history_test'

test('exportHistoryService: recordExport should create a record', () => {
  const record = exportHistoryService.recordExport(TEST_PROJECT, {
    outputPath: '/tmp/test.mp4',
    outputUrl: '/storage/exports/test.mp4',
    duration: 20.5,
    shotCount: 4,
    hasAudio: true,
    hasSubtitles: true,
  })
  assert.ok(record.id)
  assert.equal(record.projectId, TEST_PROJECT)
  assert.equal(record.duration, 20.5)
  assert.equal(record.shotCount, 4)
  assert.equal(record.hasAudio, true)
})

test('exportHistoryService: getExportHistory should return sorted records', () => {
  exportHistoryService.recordExport(TEST_PROJECT, {
    outputPath: '/tmp/test2.mp4',
    outputUrl: '/storage/exports/test2.mp4',
    duration: 15,
    shotCount: 3,
    hasAudio: false,
    hasSubtitles: false,
  })
  const history = exportHistoryService.getExportHistory(TEST_PROJECT)
  assert.ok(history.length >= 2)
  // 按时间倒序
  assert.ok(new Date(history[0].exportedAt) >= new Date(history[1].exportedAt))
})

test('exportHistoryService: deleteExportRecord should remove a record', () => {
  const record = exportHistoryService.recordExport(TEST_PROJECT, {
    outputPath: '/tmp/test3.mp4',
    outputUrl: '/storage/exports/test3.mp4',
    duration: 10,
    shotCount: 2,
    hasAudio: false,
    hasSubtitles: false,
  })
  exportHistoryService.deleteExportRecord(TEST_PROJECT, record.id)
  const history = exportHistoryService.getExportHistory(TEST_PROJECT)
  assert.ok(!history.find((r) => r.id === record.id))
})

test('exportHistoryService: cleanupProject should remove all records', () => {
  exportHistoryService.cleanupProject(TEST_PROJECT)
  const history = exportHistoryService.getExportHistory(TEST_PROJECT)
  assert.equal(history.length, 0)
})
