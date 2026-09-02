import { describe, it, expect } from 'vitest'
import { mapFrontmatterSchema, mapLineSchema, mapPinSchema, mapZoneSchema, mapLandmassSchema, territorySchema, defaultMapFrontmatter } from '../src/lib/noteTypes/map'

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

  it('defaults cityBoundary to null on a map that predates the city-scale layer (Phase 7.1)', () => {
    const parsed = mapFrontmatterSchema.parse({ type: 'map', image: { path: 'f.png', width: 100, height: 100 } })
    expect(parsed.cityBoundary).toBeNull()
    expect(defaultMapFrontmatter().cityBoundary).toBeNull()
  })

  it('round-trips a generated cityBoundary, defaulting walled when absent', () => {
    const withWall = mapFrontmatterSchema.parse({
      type: 'map',
      cityBoundary: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 9 }], walled: true }
    })
    expect(withWall.cityBoundary).toEqual({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 9 }], walled: true })

    const noWallField = mapFrontmatterSchema.parse({ type: 'map', cityBoundary: { points: [{ x: 1, y: 2 }] } })
    expect(noWallField.cityBoundary?.walled).toBe(false)
  })

  it('defaults cityLink to null and round-trips a settlement link (Phase 7.2)', () => {
    expect(mapFrontmatterSchema.parse({ type: 'map' }).cityLink).toBeNull()
    const linked = mapFrontmatterSchema.parse({ type: 'map', cityLink: { settlementNoteTitle: 'Bramblewick' } })
    expect(linked.cityLink).toEqual({ settlementNoteTitle: 'Bramblewick' })
    // A malformed link (missing the title) degrades to null rather than throwing.
    expect(mapFrontmatterSchema.parse({ type: 'map', cityLink: { foo: 1 } }).cityLink).toBeNull()
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

  it('territories, including the color field defaulting for a pre-Phase-3 territory', () => {
    const territory = territorySchema.parse({ id: 't1', name: 'Old Kingdom', points: [], generated: true })
    expect(territory.generated).toBe(true)
    expect(territory.color).toBe('#8899aa')

    const withColor = territorySchema.parse({ id: 't2', name: 'New Kingdom', points: [], color: 'hsl(90, 45%, 45%)', generated: true })
    expect(withColor.color).toBe('hsl(90, 45%, 45%)')
  })
})
