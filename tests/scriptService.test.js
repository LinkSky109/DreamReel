import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { scriptService } from '../src/services/scriptService.js'

describe('ScriptService', () => {
  it('should generate a script from an idea', async () => {
    const script = await scriptService.generateScript({
      idea: '一个宇航员在火星上遇见童年的自己',
      targetDuration: 20,
    })
    assert.ok(script.synopsis)
    assert.ok(script.characters.length > 0)
    assert.ok(script.shots.length > 0)
    assert.ok(script.shots[0].description)
    assert.ok(script.shots[0].duration > 0)
  })

  it('should throw when idea is empty', async () => {
    await assert.rejects(
      scriptService.generateScript({ idea: '' }),
      /Idea is required/
    )
  })

  it('should create character models from script', () => {
    const scriptCharacters = [
      { name: 'Alice', description: 'Young woman with red hair', personality: 'brave' },
    ]
    const characters = scriptService.createCharactersFromScript(scriptCharacters, 'proj-123')
    assert.equal(characters.length, 1)
    assert.equal(characters[0].name, 'Alice')
    assert.equal(characters[0].projectId, 'proj-123')
  })

  it('should normalize script data', () => {
    const raw = {
      synopsis: 'Test',
      characters: [{ name: 'Hero' }],
      shots: [{ description: 'A shot' }],
    }
    const normalized = scriptService.validateAndNormalize(raw, 4)
    assert.equal(normalized.shots[0].shotType, 'medium')
    assert.equal(normalized.shots[0].duration, 5)
    assert.equal(normalized.characters[0].description, '')
  })
})
