import { describe, it, expect } from 'vitest'
import { mapFrontmatterSchema, mapLineSchema, mapPinSchema, mapZoneSchema, mapLandmassSchema, defaultMapFrontmatter } from '../src/lib/noteTypes/map'

describe('mapFrontmatterSchema backward compatibility', () => {
  it('parses a pre-generation map (no new fields at all) with safe defaults', () => {
    const oldShapeMap = {
      type: 'map',
      image: { path: 'foo.png', width: 100, height: 100 },
      zones: [{ id: 'z1', terrainTypeId: 'forest', points: [{ x: 0, y: 0 }] }],
      lines: [{ id: 'l1', lineTypeId: 'road', points: [{ x: 0, y: 0 }], widthPixels: 20 }],
      landmasses: [{ id: 'lm1', name: 'Old Continent', points: [{ x: 0, y: 0 }] }],
      pins: [{ id: 'p1', x: 5, y: 5, locationTitle: 'Townsville', label: '' }]
    }
    const parsed = mapFrontmatterSchema.parse(oldShapeMap)

    expect(parsed.canvasSize).toBeNull()
    expect(parsed.climateTypes).toEqual([])
    expect(parsed.climateZones).toEqual([])
    expect(parsed.territories).toEqual([])
    expect(parsed.generation).toBeNull()
    // Pre-existing zones/lines/landmasses/pins never had `generated` — they
    // must default to false, not throw and not default to true (which
    // would wrongly make a "regenerate"/"augment" action treat hand-drawn
    // content as its own to overwrite).
    expect(parsed.zones[0].generated).toBe(false)
    expect(parsed.lines[0].generated).toBe(false)
    expect(parsed.landmasses[0].generated).toBe(false)
    expect(parsed.pins[0].generated).toBe(false)
  })

  it('a brand new blank map has generation-ready defaults', () => {
    const fresh = defaultMapFrontmatter()
    expect(fresh.canvasSize).toBeNull()
    expect(fresh.generation).toBeNull()
    expect(fresh.territories).toEqual([])
  })
})

describe('generated flag round-trips explicitly on every generatable layer', () => {
  it('lines and pins', () => {
    const line = mapLineSchema.parse({ id: 'l1', lineTypeId: 'road', points: [], widthPixels: 20, generated: true })
    expect(line.generated).toBe(true)

    const pin = mapPinSchema.parse({ id: 'p1', x: 0, y: 0, locationTitle: null, label: 'Generated City', generated: true })
    expect(pin.generated).toBe(true)
  })

  it('zones and landmasses', () => {
    const zone = mapZoneSchema.parse({ id: 'z1', terrainTypeId: 'mountains', points: [], generated: true })
    expect(zone.generated).toBe(true)

    const landmass = mapLandmassSchema.parse({ id: 'lm1', name: 'New Continent', points: [], generated: true })
    expect(landmass.generated).toBe(true)
  })
})
