import { describe, it, expect } from 'vitest'
import { deterministicFraction, hashSeed } from '../src/lib/rng'

describe('deterministicFraction (shared rng module)', () => {
  it('is stable for a repeated seed', () => {
    expect(deterministicFraction(42)).toBe(deterministicFraction(42))
  })
})

describe('hashSeed', () => {
  it('is stable for repeated identical inputs', () => {
    expect(hashSeed(1, 2, 3)).toBe(hashSeed(1, 2, 3))
  })

  it('varies with the number of parts, not just their sum', () => {
    expect(hashSeed(1, 2)).not.toBe(hashSeed(3))
    expect(hashSeed(1, 2)).not.toBe(hashSeed(1, 2, 0))
  })

  it('is sensitive to input order', () => {
    expect(hashSeed(1, 2, 3)).not.toBe(hashSeed(3, 2, 1))
  })

  it('gives nearby inputs uncorrelated outputs', () => {
    const outputs = new Set(Array.from({ length: 20 }, (_, i) => hashSeed(100, i)))
    expect(outputs.size).toBe(20)
  })

  it('always returns a non-negative 32-bit integer', () => {
    for (const seed of [hashSeed(0, 0), hashSeed(-5, 5), hashSeed(999999, 1, 2, 3)]) {
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(seed)).toBe(true)
    }
  })
})
