import { describe, it, expect } from 'vitest'
import { mapFrontmatterSchema, mapLineSchema, mapPinSchema, defaultMapFrontmatter } from '../src/lib/noteTypes/map'

describe('mapFrontmatterSchema backward compatibility', () => {
  it('parses a pre-generation map (no new fields at all) with safe defaults', () => {
    const oldShapeMap = {
      type: 'map',
      image: { path: 'foo.png', width: 100, height: 100 },
      zones: [],
      lines: [{ id: 'l1', lineTypeId: 'road', points: [{ x: 0, y: 0 }], widthPixels: 20 }],
      pins: [{ id: 'p1', x: 5, y: 5, locationTitle: 'Townsville', label: '' }]
    }
    const parsed = mapFrontmatterSchema.parse(oldShapeMap)

    expect(parsed.canvasSize).toBeNull()
    expect(parsed.climateTypes).toEqual([])
    expect(parsed.climateZones).toEqual([])
    expect(parsed.territories).toEqual([])
    expect(parsed.generation).toBeNull()
    // Pre-existing lines/pins never had `generated` — they must default to
    // false, not throw and not default to true (which would wrongly make a
    // "regenerate" action treat hand-drawn content as its own).
    expect(parsed.lines[0].generated).toBe(false)
    expect(parsed.pins[0].generated).toBe(false)
  })

  it('a brand new blank map has generation-ready defaults', () => {
    const fresh = defaultMapFrontmatter()
    expect(fresh.canvasSize).toBeNull()
    expect(fresh.generation).toBeNull()
    expect(fresh.territories).toEqual([])
  })
})

describe('mapLineSchema / mapPinSchema generated flag', () => {
  it('round-trips an explicit generated:true line/pin', () => {
    const line = mapLineSchema.parse({ id: 'l1', lineTypeId: 'road', points: [], widthPixels: 20, generated: true })
    expect(line.generated).toBe(true)

    const pin = mapPinSchema.parse({ id: 'p1', x: 0, y: 0, locationTitle: null, label: 'Generated City', generated: true })
    expect(pin.generated).toBe(true)
  })
})
