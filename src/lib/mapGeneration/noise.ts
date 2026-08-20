// Deterministic, dependency-free 2D noise — no procgen library, matching
// this codebase's existing convention (see rng.ts's deterministicFraction,
// already used the same way by weatherGeneration.ts) of hand-rolling small
// seeded-hash primitives instead of adding a package. Two layers:
// valueNoise2D (one smooth frequency) and fractalNoise2D (several layered
// together — what actually produces natural-looking terrain instead of a
// single-frequency "lava lamp blob" look).
import { deterministicFraction, hashSeed } from '../rng'

// Pseudo-random value in [0,1) at an integer lattice point — the raw
// "roll" that valueNoise2D interpolates between.
function latticeValue(seed: number, x: number, y: number): number {
  return deterministicFraction(hashSeed(seed, x, y))
}

// Smoothstep easing (3t²-2t³) rather than plain linear interpolation for
// the blend factor — linear interpolation between lattice values produces
// visible creases at every integer boundary; smoothstep's zero first
// derivative at 0 and 1 removes them.
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Smooth noise at a continuous (x, y) — bilinear interpolation of the four
// surrounding integer lattice points' pseudo-random values, eased with
// smoothstep. Always in [0, 1). Same seed + same (x, y) always returns the
// same value (both latticeValue and this are pure functions of their
// inputs) — this determinism is what lets "regenerate with this exact
// seed" reproduce identical terrain.
export function valueNoise2D(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const sx = smoothstep(x - x0)
  const sy = smoothstep(y - y0)
  const v00 = latticeValue(seed, x0, y0)
  const v10 = latticeValue(seed, x0 + 1, y0)
  const v01 = latticeValue(seed, x0, y0 + 1)
  const v11 = latticeValue(seed, x0 + 1, y0 + 1)
  const top = lerp(v00, v10, sx)
  const bottom = lerp(v01, v11, sx)
  return lerp(top, bottom, sy)
}

export interface FractalNoiseOptions {
  // Number of layered frequencies — more octaves add finer detail on top
  // of the broad shape. Default 5.
  octaves?: number
  // Amplitude multiplier applied each octave (< 1 means higher-frequency
  // octaves contribute less) — controls how "rough" vs "smooth" the result
  // reads. Default 0.5.
  persistence?: number
  // Frequency multiplier applied each octave. Default 2 (each octave is
  // twice as fine as the last — the standard fBm choice).
  lacunarity?: number
  // Base feature size, in the same units as x/y (e.g. map pixels) — larger
  // scale means broader, slower-changing shapes. Default 1.
  scale?: number
}

// Fractal Brownian motion: several octaves of valueNoise2D summed and
// renormalized to [0, 1]. This is the function actual terrain generation
// calls — a single valueNoise2D layer alone looks like smooth blobs with no
// natural-looking small-scale variation.
export function fractalNoise2D(seed: number, x: number, y: number, options: FractalNoiseOptions = {}): number {
  const { octaves = 5, persistence = 0.5, lacunarity = 2, scale = 1 } = options
  let amplitude = 1
  let frequency = 1 / scale
  let sum = 0
  let maxAmplitude = 0
  for (let o = 0; o < octaves; o++) {
    // Each octave offsets the seed rather than reusing it at a different
    // frequency — reusing one seed across octaves lets a low-frequency
    // lattice point visibly correlate with a high-frequency one wherever
    // they land on the same integer coordinate, a subtle but real artifact.
    sum += valueNoise2D(seed + o * 101, x * frequency, y * frequency) * amplitude
    maxAmplitude += amplitude
    amplitude *= persistence
    frequency *= lacunarity
  }
  return sum / maxAmplitude
}
