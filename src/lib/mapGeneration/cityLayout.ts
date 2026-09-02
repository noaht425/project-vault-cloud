// City-map placement (procedural map generation plan, Phase 7.4). Turns the
// already-generated street network into blocks, each block into lots, and
// drops every *existing* SettlementBuilding into a lot inside its own
// *already-assigned* districtId — never inventing a building (decision 2).
// The result is a footprint per building id, to be written back onto the
// exact same building records.
//
// Non-destructive (decision 5): a building that already has a footprint
// keeps it, and its lot is treated as taken — a change in building count
// fills the still-free lots rather than re-subdividing every block.
//
// Pure and deterministic.
import { pointInPolygon, polygonCentroid, type Point } from '../mapGeometry'
import { deterministicFraction, hashSeed } from '../rng'
import { traceBlocks } from './streets'
import { subdivideBlock, type LotRect } from './lots'

export interface LayoutDistrict {
  id: string
  points: Point[]
  targetLotAreaPixels: number | null
}

export interface LayoutBuilding {
  id: string
  districtId: string
  footprint?: LotRect | null
}

export interface CityLayoutParams {
  seed: number
  widthPixels: number
  heightPixels: number
  boundaryMask: Point[]
  districts: LayoutDistrict[]
  // The generated street polylines (from streets.ts, stored as MapLines).
  streetPolylines: Point[][]
  buildings: LayoutBuilding[]
  // Fallback lot area for a block that falls in no district. Default 1200.
  defaultTargetLotAreaPixels?: number
  blockGridResolution?: number
}

export interface CityLayoutResult {
  // One entry per building that was given a NEW footprint this run (a
  // building that already had one is left out — it keeps what it had).
  placements: { id: string; footprint: LotRect }[]
  blocks: Point[][]
  lots: LotRect[]
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// Fisher-Yates with a seeded PRNG — a deterministic shuffle so lot
// assignment doesn't just fill blocks in trace order.
function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items]
  let counter = 0
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(deterministicFraction(hashSeed(seed, counter++)) * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Whether a lot rectangle is (roughly) the one a kept footprint sits on, so
// it isn't handed out again. Centre-distance against the larger of the two
// extents — footprints come straight from lots, so an exact-ish match.
function lotIsTakenBy(lot: LotRect, footprint: LotRect): boolean {
  const reach = Math.max(lot.width, lot.height, footprint.width, footprint.height) * 0.6
  return Math.hypot(lot.x - footprint.x, lot.y - footprint.y) < reach
}

export function placeBuildingsInLots(params: CityLayoutParams): CityLayoutResult {
  const {
    seed,
    widthPixels,
    heightPixels,
    boundaryMask,
    districts,
    streetPolylines,
    buildings,
    defaultTargetLotAreaPixels = 1200,
    blockGridResolution = 150
  } = params
  if (boundaryMask.length < 3) return { placements: [], blocks: [], lots: [] }

  const blocks = traceBlocks(streetPolylines, boundaryMask, widthPixels, heightPixels, blockGridResolution)

  // Subdivide every block, tagging each lot with the district that contains
  // the block's centre.
  const lotsByDistrict = new Map<string, LotRect[]>()
  const allLots: LotRect[] = []
  const unassignedLots: LotRect[] = []
  for (const block of blocks) {
    const centre = polygonCentroid(block)
    const district = districts.find((d) => d.points.length >= 3 && pointInPolygon(centre, d.points)) ?? null
    const target = district?.targetLotAreaPixels ?? defaultTargetLotAreaPixels
    const lots = subdivideBlock(block, target, { seed: hashSeed(seed, Math.round(centre.x), Math.round(centre.y)) })
    allLots.push(...lots)
    if (district) {
      const bucket = lotsByDistrict.get(district.id) ?? []
      bucket.push(...lots)
      lotsByDistrict.set(district.id, bucket)
    } else {
      unassignedLots.push(...lots)
    }
  }

  // Group buildings by their own districtId.
  const buildingsByDistrict = new Map<string, LayoutBuilding[]>()
  for (const b of buildings) {
    const bucket = buildingsByDistrict.get(b.districtId) ?? []
    bucket.push(b)
    buildingsByDistrict.set(b.districtId, bucket)
  }

  const placements: { id: string; footprint: LotRect }[] = []
  // A shared pool of lots in blocks that fell in no district — drawn on
  // only after each district has placed what it can into its own lots.
  const sharedFree = seededShuffle(unassignedLots, hashSeed(seed, 999983))

  for (const [districtId, group] of buildingsByDistrict) {
    const kept = group.filter((b) => b.footprint)
    const districtLots = lotsByDistrict.get(districtId) ?? []
    const free = seededShuffle(
      districtLots.filter((lot) => !kept.some((b) => lotIsTakenBy(lot, b.footprint as LotRect))),
      hashSeed(seed, hashString(districtId))
    )
    for (const building of group.filter((b) => !b.footprint)) {
      const lot = free.pop() ?? sharedFree.pop()
      if (!lot) break
      placements.push({ id: building.id, footprint: { ...lot } })
    }
  }

  return { placements, blocks, lots: allLots }
}
