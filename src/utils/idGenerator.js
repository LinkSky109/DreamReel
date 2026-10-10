/**
 * ID generator using FNV-1a 64-bit hash.
 * T18-001: Replaces uuidv4() for stable, collision-resistant IDs.
 */

import { fnv1a64Hex } from './hash.js'
import crypto from 'crypto'

/**
 * Generate a unique ID based on timestamp + randomness + FNV-1a 64-bit hash.
 * Format: 16-char hex string (e.g., "a3f7b2c8d9e0f1a2")
 * @returns {string}
 */
export function generateId() {
  const randomBytes = crypto.randomBytes(16).toString('hex')
  const timestamp = Date.now().toString(36)
  const hashInput = `${timestamp}-${randomBytes}`
  return fnv1a64Hex(hashInput)
}
