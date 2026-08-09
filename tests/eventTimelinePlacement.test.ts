import { describe, it, expect } from 'vitest'
import {
  computeFullWindow,
  windowForZoom,
  panWindow,
  placeEventsInLanes,
  computeAxisTicks,
  expandAnnualRecurrence,
  MAX_ZOOM_LEVEL
} from '../src/lib/eventTimelinePlacement'
import { calendarFrontmatterSchema, type CalendarFrontmatter } from '../src/lib/noteTypes/calendar'
import { toCanonicalMinutes } from '../src/lib/calendarMath'

describe('computeFullWindow', () => {
  it('pads 5% on each side of the min/max', () => {
    const window = computeFullWindow([0, 1000])
    expect(window.start).toBe(-50)
    expect(window.end).toBe(1050)
  })

  it('gives a single point a small non-zero window', () => {
    const window = computeFullWindow([500])
    expect(window.end).toBeGreaterThan(window.start)
    expect(window.start).toBeLessThanOrEqual(500)
    expect(window.end).toBeGreaterThanOrEqual(500)
  })

  it('gives an empty list a default non-zero window instead of NaN', () => {
    const window = computeFullWindow([])
    expect(Number.isFinite(window.start)).toBe(true)
    expect(Number.isFinite(window.end)).toBe(true)
    expect(window.end).toBeGreaterThan(window.start)
  })
})

describe('windowForZoom', () => {
  it('zoom level 0 returns roughly the full window, centered wherever asked', () => {
    const full = { start: 0, end: 1000 }
    const zoomed = windowForZoom(full, 0, 500)
    expect(zoomed.end - zoomed.start).toBe(1000)
    expect(zoomed.start).toBe(0)
    expect(zoomed.end).toBe(1000)
  })

  it('each zoom level in is narrower than the last', () => {
    const full = { start: 0, end: 1_000_000 }
    const spans = [0, 1, 2, 3].map((z) => {
      const w = windowForZoom(full, z, 500_000)
      return w.end - w.start
    })
    expect(spans[1]).toBeLessThan(spans[0])
    expect(spans[2]).toBeLessThan(spans[1])
    expect(spans[3]).toBeLessThan(spans[2])
  })

  it('supports fractional zoom levels for smooth wheel/pinch zoom', () => {
    const full = { start: 0, end: 1_000_000 }
    const at1 = windowForZoom(full, 1, 500_000).end - windowForZoom(full, 1, 500_000).start
    const at1_5 = windowForZoom(full, 1.5, 500_000).end - windowForZoom(full, 1.5, 500_000).start
    const at2 = windowForZoom(full, 2, 500_000).end - windowForZoom(full, 2, 500_000).start
    expect(at1_5).toBeLessThan(at1)
    expect(at1_5).toBeGreaterThan(at2)
  })

  it('centers the window on the requested point', () => {
    const full = { start: 0, end: 1_000_000 }
    const zoomed = windowForZoom(full, 2, 500_000)
    const center = (zoomed.start + zoomed.end) / 2
    expect(center).toBeCloseTo(500_000, 5)
  })

  it('clamps a negative zoom level to level 0 rather than zooming out past the full window', () => {
    const full = { start: 0, end: 1000 }
    expect(windowForZoom(full, -5, 500)).toEqual(windowForZoom(full, 0, 500))
  })
})

describe('panWindow', () => {
  it('shifts start and end by the same amount, keeping the span', () => {
    const window = { start: 100, end: 200 }
    const panned = panWindow(window, 0.5)
    expect(panned).toEqual({ start: 150, end: 250 })
  })

  it('supports panning backward with a negative fraction', () => {
    const window = { start: 100, end: 200 }
    expect(panWindow(window, -0.5)).toEqual({ start: 50, end: 150 })
  })
})

describe('placeEventsInLanes', () => {
  const window = { start: 0, end: 1000 }

  it('places a single event at its proportional position on lane 0', () => {
    const placements = placeEventsInLanes([{ minutes: 500, data: 'a' }], window, 1000)
    expect(placements).toEqual([{ event: 'a', minutes: 500, positionFraction: 0.5, lane: 0 }])
  })

  it('excludes events outside the window', () => {
    const placements = placeEventsInLanes(
      [
        { minutes: -100, data: 'before' },
        { minutes: 500, data: 'inside' },
        { minutes: 1500, data: 'after' }
      ],
      window,
      1000
    )
    expect(placements).toHaveLength(1)
    expect(placements[0].event).toBe('inside')
  })

  it('keeps far-apart events all on lane 0', () => {
    const placements = placeEventsInLanes(
      [
        { minutes: 100, data: 'a' },
        { minutes: 900, data: 'b' }
      ],
      window,
      1000
    )
    expect(placements).toHaveLength(2)
    expect(placements.every((p) => p.lane === 0)).toBe(true)
  })

  it('stacks overlapping events onto separate lanes instead of merging them', () => {
    // At pixelWidth 1000 over a 1000-minute window, 1 minute = 1px — two
    // events 5 minutes (5px) apart, with a 100px default width, overlap.
    const placements = placeEventsInLanes(
      [
        { minutes: 500, data: 'a' },
        { minutes: 505, data: 'b' }
      ],
      window,
      1000
    )
    expect(placements).toHaveLength(2)
    const lanes = placements.map((p) => p.lane).sort()
    expect(lanes).toEqual([0, 1])
  })

  it('reuses a lane once it frees up further along the axis', () => {
    // a and b overlap (lane 0, 1); c is far enough past a that lane 0 is
    // free again by the time c is placed.
    const placements = placeEventsInLanes(
      [
        { minutes: 500, data: 'a', widthPx: 100 },
        { minutes: 505, data: 'b', widthPx: 100 },
        { minutes: 700, data: 'c', widthPx: 100 }
      ],
      window,
      1000
    )
    const byEvent = new Map(placements.map((p) => [p.event, p.lane]))
    expect(byEvent.get('c')).toBe(0)
  })

  it('respects a per-item widthPx estimate over the default', () => {
    // Wide enough that even 200 minutes apart still overlaps.
    const placements = placeEventsInLanes(
      [
        { minutes: 300, data: 'a', widthPx: 500 },
        { minutes: 500, data: 'b', widthPx: 500 }
      ],
      window,
      1000
    )
    const lanes = placements.map((p) => p.lane).sort()
    expect(lanes).toEqual([0, 1])
  })

  it('returns an empty array for a zero-width window or zero pixel width', () => {
    expect(placeEventsInLanes([{ minutes: 5, data: 'a' }], { start: 10, end: 10 }, 1000)).toEqual([])
    expect(placeEventsInLanes([{ minutes: 5, data: 'a' }], window, 0)).toEqual([])
  })

  it('MAX_ZOOM_LEVEL is a sane positive bound', () => {
    expect(MAX_ZOOM_LEVEL).toBeGreaterThan(0)
  })
})

describe('computeAxisTicks', () => {
  function mainCalendar(): CalendarFrontmatter {
    return calendarFrontmatterSchema.parse({
      type: 'calendar',
      eras: [
        { id: 'am', name: 'Age of the Many', abbreviation: 'AM', direction: 'up' },
        { id: 'af', name: 'Age of the Few', abbreviation: 'AF', direction: 'down' }
      ],
      months: [
        { id: 'aucaela', name: 'Aucaela', days: 100 },
        { id: 'auctera', name: 'Auctera', days: 100 },
        { id: 'morcaela', name: 'Morcaela', days: 100 },
        { id: 'mortera', name: 'Mortera', days: 100 }
      ]
    })
  }

  it('returns no ticks without a calendar', () => {
    expect(computeAxisTicks(null, { start: 0, end: 1000 })).toEqual([])
  })

  it('returns no ticks for a zero-width window', () => {
    expect(computeAxisTicks(mainCalendar(), { start: 10, end: 10 })).toEqual([])
  })

  it('uses year-level ticks for a multi-century window', () => {
    const cal = mainCalendar()
    const minutesPerDay = 24 * 60
    const minutesPerYear = 400 * minutesPerDay
    const window = { start: 0, end: minutesPerYear * 300 }
    const ticks = computeAxisTicks(cal, window, 6)
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks.length).toBeLessThanOrEqual(10)
    // Labels at this zoom level should be bare year+era, no month/day.
    expect(ticks[0].label).toMatch(/^-?\d+ A[MF]$/)
  })

  it('uses hour-level ticks for a single-day window', () => {
    const cal = mainCalendar()
    const minutesPerDay = 24 * 60
    const window = { start: 0, end: minutesPerDay }
    const ticks = computeAxisTicks(cal, window, 6)
    expect(ticks.length).toBeGreaterThan(0)
    expect(ticks.every((t) => /^\d{2}:\d{2}$/.test(t.label))).toBe(true)
  })

  it('produces ticks in ascending position order within the window', () => {
    const cal = mainCalendar()
    const window = { start: 0, end: 400 * 24 * 60 * 50 }
    const ticks = computeAxisTicks(cal, window, 6)
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i].minutes).toBeGreaterThan(ticks[i - 1].minutes)
      expect(ticks[i].positionFraction).toBeGreaterThan(ticks[i - 1].positionFraction)
    }
  })

  it('keeps every tick within the window bounds', () => {
    const cal = mainCalendar()
    const window = { start: 12345, end: 12345 + 400 * 24 * 60 * 20 }
    const ticks = computeAxisTicks(cal, window, 6)
    for (const t of ticks) {
      expect(t.minutes).toBeGreaterThanOrEqual(window.start)
      expect(t.minutes).toBeLessThanOrEqual(window.end)
      expect(t.positionFraction).toBeGreaterThanOrEqual(0)
      expect(t.positionFraction).toBeLessThanOrEqual(1)
    }
  })
})

describe('expandAnnualRecurrence', () => {
  function gregorianStyleCalendar(): CalendarFrontmatter {
    return calendarFrontmatterSchema.parse({
      type: 'calendar',
      eras: [{ id: 'ce', name: 'Common Era', abbreviation: 'CE', direction: 'up' }],
      months: [
        { id: 'jan', name: 'January', days: 31 },
        { id: 'feb', name: 'February', days: 28 },
        { id: 'rest', name: 'Rest of Year', days: 306 }
      ],
      leapYearRule: {
        intervalYears: 4,
        exceptionEveryYears: 100,
        exceptionToExceptionEveryYears: 400,
        extraDays: 1,
        monthId: 'feb'
      }
    })
  }

  it('always includes the anchor occurrence itself', () => {
    const cal = gregorianStyleCalendar()
    const anchor = { eraId: 'ce', year: 2020, monthId: 'jan', day: 1, hour: 0, minute: 0 }
    const anchorMinutes = toCanonicalMinutes(cal, anchor)!
    const occurrences = expandAnnualRecurrence(cal, anchor, { start: anchorMinutes, end: anchorMinutes })
    expect(occurrences).toEqual([anchorMinutes])
  })

  it('generates one occurrence per year within the window, none outside it', () => {
    const cal = gregorianStyleCalendar()
    const anchor = { eraId: 'ce', year: 2020, monthId: 'jan', day: 1, hour: 0, minute: 0 }
    const window = {
      start: toCanonicalMinutes(cal, { ...anchor, year: 2018 })!,
      end: toCanonicalMinutes(cal, { ...anchor, year: 2022 })!
    }
    const occurrences = expandAnnualRecurrence(cal, anchor, window)
    const years = occurrences.map((m) => {
      // Jan 1st of each year should be exactly (year - 2020) apart in whole-year steps.
      return Math.round((m - toCanonicalMinutes(cal, anchor)!) / (365 * 24 * 60))
    })
    expect(new Set(years)).toEqual(new Set([-2, -1, 0, 1, 2]))
    for (const m of occurrences) {
      expect(m).toBeGreaterThanOrEqual(window.start)
      expect(m).toBeLessThanOrEqual(window.end)
    }
  })

  it('skips a year where the target day does not exist, but keeps recurring in later years', () => {
    const cal = gregorianStyleCalendar()
    // Feb 29th only exists in leap years (2020, 2024) — 2021-2023 must be skipped.
    const anchor = { eraId: 'ce', year: 2020, monthId: 'feb', day: 29, hour: 0, minute: 0 }
    const window = {
      start: toCanonicalMinutes(cal, anchor)!,
      end: toCanonicalMinutes(cal, { ...anchor, year: 2024 })!
    }
    const occurrences = expandAnnualRecurrence(cal, anchor, window)
    expect(occurrences).toHaveLength(2) // 2020 and 2024 only
    expect(occurrences).toContain(toCanonicalMinutes(cal, { ...anchor, year: 2020 }))
    expect(occurrences).toContain(toCanonicalMinutes(cal, { ...anchor, year: 2024 }))
  })

  it('returns an empty array when the anchor date itself does not resolve', () => {
    const cal = gregorianStyleCalendar()
    const anchor = { eraId: 'nonexistent', year: 2020, monthId: 'jan', day: 1, hour: 0, minute: 0 }
    expect(expandAnnualRecurrence(cal, anchor, { start: 0, end: 1000 })).toEqual([])
  })
})
