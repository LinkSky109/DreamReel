import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Project, PROJECT_STATUS } from '../src/models/project.js'
import { Character } from '../src/models/character.js'
import { Shot, SHOT_STATUS } from '../src/models/shot.js'

describe('Project Model', () => {
  it('should create a project with default values', () => {
    const project = new Project({ name: 'Test Project' })
    assert.equal(project.name, 'Test Project')
    assert.equal(project.status, PROJECT_STATUS.DRAFT)
    assert.equal(project.targetDuration, 60)
    assert.equal(project.platform, 'landscape')
    assert.ok(project.id)
    assert.ok(project.createdAt)
  })

  it('should add a shot and assign correct index', () => {
    const project = new Project({ name: 'Test' })
    const shot1 = project.addShot({ description: 'First shot' })
    const shot2 = project.addShot({ description: 'Second shot' })
    assert.equal(shot1.index, 0)
    assert.equal(shot2.index, 1)
    assert.equal(project.shots.length, 2)
  })

  it('should add and retrieve characters', () => {
    const project = new Project({ name: 'Test' })
    const character = new Character({ name: 'Hero', projectId: project.id })
    project.addCharacter(character)
    assert.equal(project.characters.length, 1)
    assert.equal(project.getCharacter(character.id).name, 'Hero')
  })

  it('should serialize to JSON', () => {
    const project = new Project({ name: 'Test' })
    project.addShot({ description: 'Shot 1' })
    const json = project.toJSON()
    assert.equal(json.name, 'Test')
    assert.equal(json.shots.length, 1)
    assert.ok(json.id)
  })
})

describe('Character Model', () => {
  it('should create unlocked character without references', () => {
    const char = new Character({ name: 'Hero', description: 'A brave hero' })
    assert.equal(char.isLocked, false)
    assert.equal(char.referenceImages.length, 0)
  })

  it('should lock character when reference images added', () => {
    const char = new Character({ name: 'Hero' })
    char.addReferenceImage('https://example.com/ref1.jpg')
    assert.equal(char.isLocked, true)
    assert.equal(char.referenceImages.length, 1)
  })

  it('should not add duplicate reference images', () => {
    const char = new Character({ name: 'Hero' })
    char.addReferenceImage('https://example.com/ref1.jpg')
    char.addReferenceImage('https://example.com/ref1.jpg')
    assert.equal(char.referenceImages.length, 1)
  })
})

describe('Shot Model', () => {
  it('should update status correctly', () => {
    const shot = new Shot({ description: 'Test' })
    assert.equal(shot.status, SHOT_STATUS.PENDING)
    shot.updateStatus(SHOT_STATUS.GENERATING)
    assert.equal(shot.status, SHOT_STATUS.GENERATING)
    shot.updateStatus(SHOT_STATUS.COMPLETED, { videoUrl: 'https://example.com/video.mp4' })
    assert.equal(shot.status, SHOT_STATUS.COMPLETED)
    assert.equal(shot.videoUrl, 'https://example.com/video.mp4')
  })
})
