import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filmAnalysisService } from '../src/services/filmAnalysisService.js'
import { Project } from '../src/models/project.js'
import { Shot } from '../src/models/shot.js'

function createTestProject() {
  const project = new Project({ name: '测试项目', targetDuration: 30 })
  project.shots = [
    new Shot({ projectId: project.id, index: 0, shotType: 'wide', description: '开场全景，城市天际线', duration: 5, cameraMovement: 'static' }),
    new Shot({ projectId: project.id, index: 1, shotType: 'medium', description: '主角走进房间', dialogue: '你好', duration: 4, cameraMovement: 'tracking' }),
    new Shot({ projectId: project.id, index: 2, shotType: 'close-up', description: '主角表情特写', duration: 3, cameraMovement: 'static' }),
    new Shot({ projectId: project.id, index: 3, shotType: 'wide', description: '结尾远景', narration: '故事结束', duration: 6, cameraMovement: 'pull-back' }),
  ]
  return project
}

test('filmAnalysisService: analyzeProject should return structured analysis', async () => {
  const project = createTestProject()
  const result = await filmAnalysisService.analyzeProject(project)

  assert.ok(result.projectId)
  assert.ok(result.projectName)
  assert.ok(result.analyzedAt)
  assert.ok(typeof result.overallScore === 'number')
  assert.ok(result.overallScore >= 0 && result.overallScore <= 100)
})

test('filmAnalysisService: analysis should include all four dimensions', async () => {
  const project = createTestProject()
  const result = await filmAnalysisService.analyzeProject(project)

  assert.ok(result.dimensions)
  assert.ok(typeof result.dimensions.cinematography === 'number')
  assert.ok(typeof result.dimensions.narrative === 'number')
  assert.ok(typeof result.dimensions.pacing === 'number')
  assert.ok(typeof result.dimensions.characterConsistency === 'number')
})

test('filmAnalysisService: analysis should include strengths and weaknesses', async () => {
  const project = createTestProject()
  const result = await filmAnalysisService.analyzeProject(project)

  assert.ok(Array.isArray(result.strengths))
  assert.ok(Array.isArray(result.weaknesses))
  assert.ok(Array.isArray(result.suggestions))
  assert.ok(result.strengths.length > 0)
})

test('filmAnalysisService: objective metrics should be calculated', async () => {
  const project = createTestProject()
  const result = await filmAnalysisService.analyzeProject(project)

  assert.ok(result.objectiveMetrics)
  assert.equal(result.objectiveMetrics.shotCount, 4)
  assert.equal(result.objectiveMetrics.totalDuration, 18)
  assert.ok(result.objectiveMetrics.avgShotDuration > 0)
  assert.equal(result.objectiveMetrics.dialogueShots, 1)
  assert.equal(result.objectiveMetrics.narrationShots, 1)
})

test('filmAnalysisService: shotByShot should cover all shots', async () => {
  const project = createTestProject()
  const result = await filmAnalysisService.analyzeProject(project)

  assert.ok(Array.isArray(result.shotByShot))
  assert.equal(result.shotByShot.length, 4)
  assert.ok(result.shotByShot[0].index === 1)
  assert.ok(result.shotByShot[0].comment)
})

test('filmAnalysisService: empty project should return zero scores', async () => {
  const project = new Project({ name: '空项目' })
  const result = await filmAnalysisService.analyzeProject(project)

  assert.equal(result.overallScore, 0)
  assert.equal(result.objectiveMetrics.shotCount, 0)
})
