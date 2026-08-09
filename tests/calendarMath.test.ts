import { describe, it, expect } from 'vitest'
import { calendarFrontmatterSchema, type CalendarFrontmatter } from '../src/lib/noteTypes/calendar'
import {
  isLeapYear,
  yearLengthDays,
  daysInMonthForYear,
  toCanonicalMinutes,
  fromCanonicalMinutes,
  formatCalendarDate,
  computeMoonPhase
} from '../src/lib/calendarMath'

function simpleCalendar(overrides: Record<string, unknown> = {}): CalendarFrontmatter {
  return calendarFrontmatterSchema.parse({
    type: 'calendar',
    eras: [{ id: 'ce', name: 'Common Era', abbreviation: 'CE', direction: 'up' }],
    months: [
      { id: 'm1', name: 'Month One', days: 30 },
      { id: 'm2', name: 'Month Two', days: 30 }
    ],
    weekDays: ['Day 1', 'Day 2', 'Day 3'],
    hoursPerDay: 24,
    minutesPerHour: 60,
    ...overrides
  })
}

function twoEraCalendar(): CalendarFrontmatter {
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
    ],
    weekDays: ['Minem', 'Kleipur', 'Sylvana', 'Shram', 'Thean', 'Numen', 'Genasi', 'Talav', 'Sithi']
  })
}

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

describe('isLeapYear', () => {
  const rule = { intervalYears: 4, exceptionEveryYears: 100, exceptionToExceptionEveryYears: 400, extraDays: 1, monthId: null }

  it('follows the real Gregorian rule exactly', () => {
    expect(isLeapYear(rule, 4)).toBe(true)
    expect(isLeapYear(rule, 100)).toBe(false)
    expect(isLeapYear(rule, 200)).toBe(false)
    expect(isLeapYear(rule, 400)).toBe(true)
    expect(isLeapYear(rule, 2000)).toBe(true)
    expect(isLeapYear(rule, 2024)).toBe(true)
    expect(isLeapYear(rule, 2023)).toBe(false)
  })

  it('is always false with no rule', () => {
    expect(isLeapYear(null, 4)).toBe(false)
  })
})

describe('yearLengthDays', () => {
  it('adds extraDays only in a leap year', () => {
    const cal = gregorianStyleCalendar()
    expect(yearLengthDays(cal, 2023)).toBe(365)
    expect(yearLengthDays(cal, 2024)).toBe(366)
    expect(yearLengthDays(cal, 1900)).toBe(365) // divisible by 100, not 400
    expect(yearLengthDays(cal, 2000)).toBe(366) // divisible by 400
  })
})

describe('daysInMonthForYear', () => {
  it('gives February 29 days in a leap year, 28 otherwise', () => {
    const cal = gregorianStyleCalendar()
    expect(daysInMonthForYear(cal, 'feb', 2024)).toBe(29)
    expect(daysInMonthForYear(cal, 'feb', 2023)).toBe(28)
    expect(daysInMonthForYear(cal, 'feb', 1900)).toBe(28) // divisible by 100, not 400
    expect(daysInMonthForYear(cal, 'feb', 2000)).toBe(29) // divisible by 400
  })

  it('is unaffected by a leap year for a month the leap rule does not target', () => {
    const cal = gregorianStyleCalendar()
    expect(daysInMonthForYear(cal, 'jan', 2024)).toBe(31)
    expect(daysInMonthForYear(cal, 'rest', 2024)).toBe(306)
  })

  it('returns null for a month id that does not exist on this calendar', () => {
    const cal = gregorianStyleCalendar()
    expect(daysInMonthForYear(cal, 'nonexistent', 2024)).toBeNull()
  })
})

describe('toCanonicalMinutes / fromCanonicalMinutes round-trip', () => {
  it('anchors year 1, month 1, day 1 at canonical minute 0', () => {
    const cal = simpleCalendar()
    expect(toCanonicalMinutes(cal, { eraId: 'ce', year: 1, monthId: 'm1', day: 1, hour: 0, minute: 0 })).toBe(0)
  })

  it('advances by a full month, year, hour, and minute correctly', () => {
    const cal = simpleCalendar()
    const minutesPerDay = 24 * 60
    expect(toCanonicalMinutes(cal, { eraId: 'ce', year: 1, monthId: 'm2', day: 1, hour: 0, minute: 0 })).toBe(30 * minutesPerDay)
    expect(toCanonicalMinutes(cal, { eraId: 'ce', year: 2, monthId: 'm1', day: 1, hour: 0, minute: 0 })).toBe(60 * minutesPerDay)
    expect(toCanonicalMinutes(cal, { eraId: 'ce', year: 1, monthId: 'm1', day: 1, hour: 5, minute: 30 })).toBe(5 * 60 + 30)
  })

  it('round-trips a grid of dates across multiple years', () => {
    const cal = simpleCalendar()
    for (let year = 1; year <= 5; year++) {
      for (const monthId of ['m1', 'm2']) {
        for (const day of [1, 15, 30]) {
          const parts = { eraId: 'ce', year, monthId, day, hour: 3, minute: 45 }
          const minutes = toCanonicalMinutes(cal, parts)
          expect(minutes).not.toBeNull()
          expect(fromCanonicalMinutes(cal, minutes!)).toEqual(parts)
        }
      }
    }
  })

  it('returns null for an unknown era or month id', () => {
    const cal = simpleCalendar()
    expect(toCanonicalMinutes(cal, { eraId: 'nope', year: 1, monthId: 'm1', day: 1, hour: 0, minute: 0 })).toBeNull()
    expect(toCanonicalMinutes(cal, { eraId: 'ce', year: 1, monthId: 'nope', day: 1, hour: 0, minute: 0 })).toBeNull()
  })
})

describe('up/down eras sharing one epoch (Age of the Many / Age of the Few)', () => {
  it('places AM year 1 day 1 at canonical minute 0 and AF year 1 immediately before it (no year zero)', () => {
    const cal = twoEraCalendar()
    const minutesPerDay = 24 * 60
    const amStart = toCanonicalMinutes(cal, { eraId: 'am', year: 1, monthId: 'aucaela', day: 1, hour: 0, minute: 0 })
    const afStart = toCanonicalMinutes(cal, { eraId: 'af', year: 1, monthId: 'aucaela', day: 1, hour: 0, minute: 0 })
    expect(amStart).toBe(0)
    expect(afStart).toBe(-400 * minutesPerDay)
  })

  it('reads a negative canonical minute back into the down-counting era', () => {
    const cal = twoEraCalendar()
    const minutesPerDay = 24 * 60
    const parts = fromCanonicalMinutes(cal, -1)
    expect(parts?.eraId).toBe('af')
    expect(parts?.year).toBe(1)
    expect(parts?.monthId).toBe('mortera') // last day of the AF year-1 400-day span
    expect(parts?.day).toBe(100)
    // Sanity: converting back gives the same instant.
    expect(toCanonicalMinutes(cal, parts!)).toBe(-1)
    void minutesPerDay
  })

  it('round-trips across the AM/AF boundary and several years each direction', () => {
    const cal = twoEraCalendar()
    for (let year = 1; year <= 4; year++) {
      for (const eraId of ['am', 'af']) {
        const parts = { eraId, year, monthId: 'morcaela', day: 50, hour: 12, minute: 0 }
        const minutes = toCanonicalMinutes(cal, parts)
        expect(minutes).not.toBeNull()
        expect(fromCanonicalMinutes(cal, minutes!)).toEqual(parts)
      }
    }
  })
})

describe('leap years shift canonical minutes correctly', () => {
  it('year 5 (day 1) starts one day later than it would with no leap years, once year 4 was a leap year', () => {
    const cal = gregorianStyleCalendar()
    const minutesPerDay = 24 * 60
    const year1Start = toCanonicalMinutes(cal, { eraId: 'ce', year: 1, monthId: 'jan', day: 1, hour: 0, minute: 0 })!
    const year5Start = toCanonicalMinutes(cal, { eraId: 'ce', year: 5, monthId: 'jan', day: 1, hour: 0, minute: 0 })!
    // 4 non-leap years (1,2,3,4 -- wait 4 IS leap) -- years 1-4 elapsed before year 5 starts, with year 4 leap.
    expect((year5Start - year1Start) / minutesPerDay).toBe(365 * 4 + 1)
  })

  it('round-trips dates before, during, and after a leap day across a century-exception boundary', () => {
    const cal = gregorianStyleCalendar()
    const cases = [
      { eraId: 'ce', year: 1900, monthId: 'jan', day: 1, hour: 0, minute: 0 },
      { eraId: 'ce', year: 1900, monthId: 'rest', day: 1, hour: 0, minute: 0 }, // Feb has no 29th in 1900
      { eraId: 'ce', year: 2000, monthId: 'feb', day: 29, hour: 6, minute: 15 }, // 2000 IS leap
      { eraId: 'ce', year: 2024, monthId: 'feb', day: 29, hour: 0, minute: 0 },
      { eraId: 'ce', year: 2025, monthId: 'jan', day: 1, hour: 0, minute: 0 }
    ]
    for (const parts of cases) {
      const minutes = toCanonicalMinutes(cal, parts)
      expect(minutes).not.toBeNull()
      expect(fromCanonicalMinutes(cal, minutes!)).toEqual(parts)
    }
  })
})

describe('formatCalendarDate', () => {
  it('formats a plain date with era abbreviation, omitting zero time', () => {
    const cal = twoEraCalendar()
    expect(formatCalendarDate(cal, { eraId: 'am', year: 42, monthId: 'aucaela', day: 15, hour: 0, minute: 0 })).toBe('15 Aucaela, 42 AM')
  })

  it('includes time once hour/minute are non-zero', () => {
    const cal = twoEraCalendar()
    expect(formatCalendarDate(cal, { eraId: 'af', year: 3, monthId: 'morcaela', day: 1, hour: 14, minute: 5 })).toBe(
      '1 Morcaela, 3 AF, 14:05'
    )
  })
})

describe('computeMoonPhase', () => {
  const cal = simpleCalendar() // 24 hours/day, 60 min/hour -> 1440 minutes/day
  const moon = { id: 'm', name: 'The Moon', cycleDays: 30, phaseOffsetDays: 0 }
  const minutesPerDay = 1440

  it('is New at the start of the cycle and Full halfway through', () => {
    expect(computeMoonPhase(cal, moon, 0 * minutesPerDay).name).toBe('New')
    expect(computeMoonPhase(cal, moon, 15 * minutesPerDay).name).toBe('Full')
  })

  it('steps through every phase name in order across one full cycle', () => {
    const namesAtEachEighth = [0, 3.75, 7.5, 11.25, 15, 18.75, 22.5, 26.25].map(
      (days) => computeMoonPhase(cal, moon, days * minutesPerDay).name
    )
    expect(namesAtEachEighth).toEqual([
      'New',
      'Waxing Crescent',
      'First Quarter',
      'Waxing Gibbous',
      'Full',
      'Waning Gibbous',
      'Last Quarter',
      'Waning Crescent'
    ])
  })

  it('wraps back to New just before a fresh cycle starts', () => {
    expect(computeMoonPhase(cal, moon, 29 * minutesPerDay).name).toBe('New')
  })

  it('phaseOffsetDays shifts which day counts as New', () => {
    const offsetMoon = { ...moon, phaseOffsetDays: 15 }
    expect(computeMoonPhase(cal, offsetMoon, 15 * minutesPerDay).name).toBe('New')
    expect(computeMoonPhase(cal, offsetMoon, 0 * minutesPerDay).name).toBe('Full')
  })

  it('handles a negative canonical-minute instant (before epoch) the same as a positive one', () => {
    // -1 day is equivalent to day 29 of the previous cycle for a 30-day moon.
    expect(computeMoonPhase(cal, moon, -1 * minutesPerDay).name).toBe(computeMoonPhase(cal, moon, 29 * minutesPerDay).name)
  })

  it('returns New with a zero fraction for a non-positive cycleDays instead of dividing by zero', () => {
    const brokenMoon = { ...moon, cycleDays: 0 }
    const phase = computeMoonPhase(cal, brokenMoon, 15 * minutesPerDay)
    expect(phase).toEqual({ fraction: 0, name: 'New', emoji: '🌑' })
  })
})
