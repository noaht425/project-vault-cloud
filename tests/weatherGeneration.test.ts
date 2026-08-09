import { describe, it, expect } from 'vitest'
import { deterministicFraction, pickWeightedCondition, computeWeatherForDate } from '../src/lib/weatherGeneration'
import { calendarFrontmatterSchema, type CalendarFrontmatter } from '../src/lib/noteTypes/calendar'
import { climateFrontmatterSchema, type ClimateFrontmatter } from '../src/lib/noteTypes/climate'
import { toCanonicalMinutes } from '../src/lib/calendarMath'

function fourSeasonCalendar(): CalendarFrontmatter {
  return calendarFrontmatterSchema.parse({
    type: 'calendar',
    eras: [{ id: 'ce', name: 'Common Era', abbreviation: 'CE', direction: 'up' }],
    months: [
      { id: 'win', name: 'Winter Month', days: 30 },
      { id: 'spr', name: 'Spring Month', days: 30 },
      { id: 'sum', name: 'Summer Month', days: 30 },
      { id: 'aut', name: 'Autumn Month', days: 30 }
    ],
    hoursPerDay: 24,
    minutesPerHour: 60
  })
}

function climateWithWinter(overrides: Record<string, unknown> = {}): ClimateFrontmatter {
  return climateFrontmatterSchema.parse({
    type: 'climate',
    calendarNoteTitle: 'Test Calendar',
    seasons: [
      {
        id: 'winter',
        name: 'Winter',
        monthIds: ['win'],
        conditions: [
          { id: 'clear', name: 'Clear skies', weight: 1 },
          { id: 'snow', name: 'Snow', weight: 1 }
        ]
      }
    ],
    ...overrides
  })
}

describe('deterministicFraction', () => {
  it('is stable for a repeated seed', () => {
    expect(deterministicFraction(12345)).toBe(deterministicFraction(12345))
  })

  it('varies across different seeds', () => {
    const fractions = new Set([0, 1, 2, 3, 4, 5].map(deterministicFraction))
    expect(fractions.size).toBeGreaterThan(1)
  })

  it('always returns a value in [0, 1)', () => {
    for (const seed of [-1000, -1, 0, 1, 1000, 999999]) {
      const f = deterministicFraction(seed)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
    }
  })
})

describe('pickWeightedCondition', () => {
  const items = [
    { id: 'a', weight: 0 },
    { id: 'b', weight: 1 }
  ]

  it('never picks a zero-weight item when a positive-weight one exists', () => {
    for (let f = 0; f < 1; f += 0.1) {
      expect(pickWeightedCondition(items, f)?.id).toBe('b')
    }
  })

  it('respects relative weight statistically', () => {
    const weighted = [
      { id: 'common', weight: 9 },
      { id: 'rare', weight: 1 }
    ]
    const picks = Array.from({ length: 1000 }, (_, i) => pickWeightedCondition(weighted, i / 1000)?.id)
    const commonCount = picks.filter((id) => id === 'common').length
    expect(commonCount).toBeGreaterThan(800) // ~90% expected
  })

  it('returns null for an empty list', () => {
    expect(pickWeightedCondition([], 0.5)).toBeNull()
  })
})

describe('computeWeatherForDate', () => {
  it('picks the season covering the resolved month', () => {
    const cal = fourSeasonCalendar()
    const climate = climateWithWinter()
    const minutes = toCanonicalMinutes(cal, { eraId: 'ce', year: 1, monthId: 'win', day: 15, hour: 0, minute: 0 })!
    const weather = computeWeatherForDate(climate, cal, minutes)
    expect(weather?.seasonName).toBe('Winter')
  })

  it('returns null when no season covers the resolved month', () => {
    const cal = fourSeasonCalendar()
    const climate = climateWithWinter() // only defines Winter (the 'win' month)
    const minutes = toCanonicalMinutes(cal, { eraId: 'ce', year: 1, monthId: 'sum', day: 1, hour: 0, minute: 0 })!
    expect(computeWeatherForDate(climate, cal, minutes)).toBeNull()
  })

  it('returns null when the matching season has no conditions defined', () => {
    const cal = fourSeasonCalendar()
    const climate = climateFrontmatterSchema.parse({
      type: 'climate',
      seasons: [{ id: 'winter', name: 'Winter', monthIds: ['win'], conditions: [] }]
    })
    const minutes = toCanonicalMinutes(cal, { eraId: 'ce', year: 1, monthId: 'win', day: 1, hour: 0, minute: 0 })!
    expect(computeWeatherForDate(climate, cal, minutes)).toBeNull()
  })

  it('is deterministic: the same date always returns the same condition', () => {
    const cal = fourSeasonCalendar()
    const climate = climateWithWinter()
    const minutes = toCanonicalMinutes(cal, { eraId: 'ce', year: 3, monthId: 'win', day: 10, hour: 0, minute: 0 })!
    const first = computeWeatherForDate(climate, cal, minutes)
    const second = computeWeatherForDate(climate, cal, minutes)
    expect(first).toEqual(second)
  })

  it('stays stable across the same day (different minute, same result)', () => {
    const cal = fourSeasonCalendar()
    const climate = climateWithWinter()
    const morning = toCanonicalMinutes(cal, { eraId: 'ce', year: 1, monthId: 'win', day: 10, hour: 1, minute: 0 })!
    const evening = toCanonicalMinutes(cal, { eraId: 'ce', year: 1, monthId: 'win', day: 10, hour: 23, minute: 30 })!
    expect(computeWeatherForDate(climate, cal, morning)).toEqual(computeWeatherForDate(climate, cal, evening))
  })
})
