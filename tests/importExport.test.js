import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectService } from '../src/services/projectService.js'

const TEST_USER = 'import_export_test'

test('projectService: exportProject should return complete project data', async () => {
  const project = await projectService.createProject({
    name: '导出测试项目',
    description: '测试描述',
    userId: TEST_USER,
    style: 'nolan',
    platform: 'portrait',
  })
  project.addCharacter({ name: '角色1', description: '测试角色' })
  project.addShot({ description: '镜头1', duration: 5 })
  await projectService.updateProject(project.id, {
    characters: project.characters,
    shots: project.shots,
  })

  const exported = await projectService.exportProject(project.id)
  assert.equal(exported.name, '导出测试项目')
  assert.equal(exported.description, '测试描述')
  assert.equal(exported.style, 'nolan')
  assert.equal(exported.platform, 'portrait')
  assert.ok(exported.exportedAt)
  assert.equal(exported.characters.length, 1)
  assert.equal(exported.shots.length, 1)
})

test('projectService: export and import roundtrip', async () => {
  // 创建原始项目
  const original = await projectService.createProject({
    name: '往返测试',
    description: '导出再导入',
    userId: TEST_USER,
    style: 'wes-anderson',
  })
  original.addCharacter({ name: '主角', description: '男主角' })
  original.addShot({ description: '开场镜头', dialogue: '你好', duration: 3 })
  original.addShot({ description: '结尾镜头', narration: '结束', duration: 4 })
  await projectService.updateProject(original.id, {
    characters: original.characters,
    shots: original.shots,
  })

  // 导出
  const exported = await projectService.exportProject(original.id)

  // 验证导出数据完整性
  assert.equal(exported.name, '往返测试')
  assert.equal(exported.characters.length, 1)
  assert.equal(exported.shots.length, 2)
  assert.equal(exported.shots[0].description, '开场镜头')
  assert.equal(exported.shots[1].narration, '结束')

  // 导入（通过 service 直接创建，模拟 API 行为）
  const imported = await projectService.createProject({
    name: `${exported.name} (导入)`,
    description: exported.description,
    platform: exported.platform,
    style: exported.style,
    userId: TEST_USER,
  })

  for (const char of exported.characters) {
    imported.addCharacter({
      name: char.name,
      description: char.description,
      referenceImages: char.referenceImages || [],
    })
  }

  for (const shot of exported.shots) {
    imported.addShot({
      description: shot.description,
      dialogue: shot.dialogue,
      narration: shot.narration,
      duration: shot.duration,
      characterIds: shot.characterIds || [],
    })
  }

  await projectService.updateProject(imported.id, {
    characters: imported.characters,
    shots: imported.shots,
  })

  // 验证导入结果
  const importedData = await projectService.getProject(imported.id)
  assert.equal(importedData.name, '往返测试 (导入)')
  assert.equal(importedData.style, 'wes-anderson')
  assert.equal(importedData.characters.length, 1)
  assert.equal(importedData.characters[0].name, '主角')
  assert.equal(importedData.shots.length, 2)
  assert.equal(importedData.shots[0].description, '开场镜头')
  // 导入的镜头状态应为 pending（不恢复视频）
  assert.equal(importedData.shots[0].status, 'pending')
})

test('projectService: exportProject should include script if present', async () => {
  const project = await projectService.createProject({
    name: '剧本导出测试',
    userId: TEST_USER,
  })
  const script = {
    title: '测试剧本',
    logline: '一句话概括',
    shots: [{ description: '镜头1' }],
    characters: [{ name: '角色A' }],
  }
  await projectService.updateProject(project.id, { script })

  const exported = await projectService.exportProject(project.id)
  assert.ok(exported.script)
  assert.equal(exported.script.title, '测试剧本')
})
