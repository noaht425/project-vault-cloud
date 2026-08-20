// Single import surface for every generation layer — each layer (terrain,
// hydrology, climate, and future civilizations/roads) is independently
// callable, matching the UI's per-section "Regenerate [this layer]"
// buttons (see the map generation plan: fine-tuning needs per-layer
// control, not one all-or-nothing pass). generateMap() below is a
// convenience that runs every layer together in the right order (terrain
// before hydrology/climate, since both read the same elevation field
// terrain's coastline comes from) for a future "generate everything at
// once" action — individual UI sections call the specific layer function
// they need instead.
import type { ClimateType, ClimateZone, MapLandmass, MapLine, MapZone } from '../noteTypes/map'
import { generateTerrain, type TerrainGenerationParams, type TerrainGenerationResult } from './elevation'
import { generateRivers, type HydrologyGenerationParams } from './hydrology'
import { generateClimate, type ClimateGenerationParams, type ClimateGenerationResult } from './climate'

export { generateTerrain, generateRivers, generateClimate }
export type { TerrainGenerationParams, TerrainGenerationResult, HydrologyGenerationParams, ClimateGenerationParams, ClimateGenerationResult }

export type GenerationParams = TerrainGenerationParams & HydrologyGenerationParams & ClimateGenerationParams

export interface GenerateMapResult {
  landmasses: MapLandmass[]
  mountainZones: MapZone[]
  rivers: MapLine[]
  climateTypes: ClimateType[]
  climateZones: ClimateZone[]
}

export function generateMap(params: GenerationParams, idFactory?: () => string): GenerateMapResult {
  const terrain = generateTerrain(params, idFactory)
  const rivers = generateRivers(params, idFactory)
  const climate = generateClimate(params, idFactory)
  return { landmasses: terrain.landmasses, mountainZones: terrain.mountainZones, rivers, climateTypes: climate.climateTypes, climateZones: climate.climateZones }
}
