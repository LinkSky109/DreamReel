#!/usr/bin/env node
import { seedAudioPack } from '../src/services/audioAssetService.js'

const result = await seedAudioPack({ duration: 60 })

console.log(JSON.stringify(result, null, 2))
if (result.errors.length > 0) {
  process.exitCode = 1
}
