/**
 * FNV-1a 64-bit hash implementation.
 * T18-001: Upgraded from 32-bit for stable ID generation.
 */

const FNV_64_OFFSET_BASIS = 14695981039346656037n
const FNV_64_PRIME = 1099511628211n

/**
 * Compute FNV-1a 64-bit hash of input.
 * @param {string|Buffer} input
 * @returns {bigint}
 */
export function fnv1a64(input) {
  let hash = FNV_64_OFFSET_BASIS
  const data = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  for (const byte of data) {
    hash = hash ^ BigInt(byte)
    hash = hash * FNV_64_PRIME
  }
  return hash
}

/**
 * Compute FNV-1a 64-bit hash and return as 16-char hex string.
 * @param {string|Buffer} input
 * @returns {string}
 */
export function fnv1a64Hex(input) {
  return fnv1a64(input).toString(16).padStart(16, '0')
}
