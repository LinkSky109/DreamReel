import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { characterService } from '../src/services/characterService.js'
import { Character } from '../src/models/character.js'

describe('CharacterService', () => {
  it('should create character without lock when no references', async () => {
    const character = await characterService.createCharacter({
      name: 'Test Hero',
      description: 'A brave hero',
      projectId: 'proj-1',
    })
    assert.equal(character.name, 'Test Hero')
    assert.equal(character.isLocked, false)
  })

  it('should create and lock character with reference images', async () => {
    const character = await characterService.createCharacter({
      name: 'Locked Hero',
      description: 'A locked hero',
      referenceImages: ['https://example.com/ref1.jpg'],
      projectId: 'proj-1',
    })
    assert.equal(character.isLocked, true)
    assert.ok(character.featureVector)
    assert.equal(character.featureVector.length, 128)
  })

  it('should throw when name is missing', async () => {
    await assert.rejects(
      characterService.createCharacter({ name: '', projectId: 'proj-1' }),
      /Character name is required/
    )
  })

  it('should lock an existing character', async () => {
    const character = new Character({ name: 'Hero', projectId: 'proj-1' })
    assert.equal(character.isLocked, false)

    const locked = await characterService.lockCharacter(character, [
      'https://example.com/ref1.jpg',
      'https://example.com/ref2.jpg',
    ])
    assert.equal(locked.isLocked, true)
    assert.equal(locked.referenceImages.length, 2)
    assert.ok(locked.featureVector)
  })

  it('should throw when locking without images', async () => {
    const character = new Character({ name: 'Hero' })
    await assert.rejects(
      characterService.lockCharacter(character, []),
      /At least one reference image is required/
    )
  })

  it('should calculate cosine similarity correctly', () => {
    const vecA = [1, 0, 0]
    const vecB = [1, 0, 0]
    const vecC = [0, 1, 0]
    assert.equal(characterService.cosineSimilarity(vecA, vecB), 1)
    assert.equal(characterService.cosineSimilarity(vecA, vecC), 0)
  })

  it('should return 0 for mismatched vector lengths', () => {
    assert.equal(characterService.cosineSimilarity([1, 2], [1]), 0)
  })

  it('should evaluate consistency for locked character', async () => {
    const character = new Character({ name: 'Hero' })
    character.setFeatureVector(new Array(128).fill(0.1))

    const result = await characterService.evaluateConsistency(
      'https://example.com/video.mp4',
      character
    )
    assert.ok(result.score !== null)
    assert.ok(result.score >= 0 && result.score <= 1)
    assert.ok(['consistent', 'inconsistent'].includes(result.status))
  })

  it('should return not_locked for character without feature vector', async () => {
    const character = new Character({ name: 'Hero' })
    const result = await characterService.evaluateConsistency(
      'https://example.com/video.mp4',
      character
    )
    assert.equal(result.status, 'not_locked')
    assert.equal(result.score, null)
  })

  it('should validate reference image URL', async () => {
    const valid = await characterService.validateReferenceImage('https://example.com/img.jpg')
    assert.equal(valid.valid, true)

    const invalid = await characterService.validateReferenceImage('not-a-url')
    assert.equal(invalid.valid, false)
  })
})
