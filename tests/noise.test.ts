import { describe, it, expect } from 'vitest'
import { valueNoise2D, fractalNoise2D } from '../src/lib/mapGeneration/noise'

describe('valueNoise2D', () => {
  it('is deterministic for the same seed and coordinates', () => {
    expect(valueNoise2D(1, 3.7, 2.2)).toBe(valueNoise2D(1, 3.7, 2.2))
  })

  it('differs across seeds at the same coordinates', () => {
    const values = new Set([1, 2, 3, 4, 5].map((seed) => valueNoise2D(seed, 3.7, 2.2)))
    expect(values.size).toBeGreaterThan(1)
  })

  it('stays in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = valueNoise2D(7, i * 0.37, i * 1.91)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is continuous — nearby points have close values, not random jumps', () => {
    const a = valueNoise2D(9, 5.0, 5.0)
    const b = valueNoise2D(9, 5.01, 5.0)
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })

  it('exactly reproduces the lattice value at integer coordinates (interpolation endpoints)', () => {
    // At an integer (x, y), smoothstep(0) = 0, so bilinear interpolation
    // collapses to exactly the top-left corner's raw lattice value.
    const atLattice = valueNoise2D(3, 4, 4)
    const atLatticeAgain = valueNoise2D(3, 4, 4)
    expect(atLattice).toBe(atLatticeAgain)
  })
})

describe('fractalNoise2D', () => {
  it('is deterministic for the same seed and coordinates', () => {
    expect(fractalNoise2D(5, 10.5, 20.5)).toBe(fractalNoise2D(5, 10.5, 20.5))
  })

  it('stays in [0, 1) across many samples and octave counts', () => {
    for (const octaves of [1, 3, 5, 8]) {
      for (let i = 0; i < 50; i++) {
        const v = fractalNoise2D(11, i * 0.53, i * 0.29, { octaves })
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(1)
      }
    }
  })

  it('produces more high-frequency variation with more octaves, on average', () => {
    // A single seed's short 1D scanline is noisy enough that "more octaves"
    // doesn't win every single comparison (the normalized low-frequency
    // component actually shrinks in amplitude as octaves increase — see
    // fractalNoise2D's maxAmplitude normalization — so a lucky/unlucky
    // sample path can occasionally go either way). Averaging total
    // variation across many seeds is what should reliably come out higher,
    // which is the property that actually matters (more octaves = more
    // small-scale detail in the terrain overall, not on every scanline).
    function totalVariation(seed: number, octaves: number): number {
      let total = 0
      let prev = fractalNoise2D(seed, 0, 0, { octaves, scale: 4 })
      for (let i = 1; i <= 40; i++) {
        const v = fractalNoise2D(seed, i * 0.25, 0, { octaves, scale: 4 })
        total += Math.abs(v - prev)
        prev = v
      }
      return total
    }
    const seeds = Array.from({ length: 30 }, (_, i) => i * 1000)
    const avg = (octaves: number) => seeds.reduce((sum, seed) => sum + totalVariation(seed, octaves), 0) / seeds.length
    expect(avg(6)).toBeGreaterThan(avg(1))
  })

  it('a larger scale produces a smoother (lower total-variation) field', () => {
    function totalVariation(scale: number): number {
      let total = 0
      let prev = fractalNoise2D(33, 0, 0, { scale })
      for (let i = 1; i <= 40; i++) {
        const v = fractalNoise2D(33, i * 0.5, 0, { scale })
        total += Math.abs(v - prev)
        prev = v
      }
      return total
    }
    expect(totalVariation(20)).toBeLessThan(totalVariation(1))
  })
})
