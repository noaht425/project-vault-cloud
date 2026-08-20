// Top-level orchestrator the UI actually calls — Phase 1 is terrain-only,
// so today this is a thin pass-through to generateTerrain(), but it's the
// one stable entry point later phases (hydrology, climate, civilizations,
// roads) extend internally without the UI's call site needing to change.
import type { MapLandmass, MapZone } from '../noteTypes/map'
import { generateTerrain, type TerrainGenerationParams } from './elevation'

export type GenerateMapParams = TerrainGenerationParams

export interface GenerateMapResult {
  landmasses: MapLandmass[]
  mountainZones: MapZone[]
}

export function generateMap(params: GenerateMapParams, idFactory?: () => string): GenerateMapResult {
  return generateTerrain(params, idFactory)
}
