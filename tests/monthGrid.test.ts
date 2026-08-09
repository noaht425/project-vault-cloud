import { describe, it, expect } from 'vitest'
import { calendarFrontmatterSchema, type CalendarFrontmatter } from '../src/lib/noteTypes/calendar'
import { toCanonicalMinutes } from '../src/lib/calendarMath'
import { weekdayIndex, buildMonthGrid, stepMonth, monthRefForMinutes, bucketByDay } from '../src/lib/monthGrid'

function simpleCalendar(): CalendarFrontmatter {
  return calendarFrontmatterSchema.parse({
    type: 'calendar',
    eras: [{ id: 'ce', name: 'Common Era', abbreviation: 'CE', direction: 'up' }],
    months: [
      { id: 'm1', name: 'Month One', days: 30 },
      { id: 'm2', name: 'Month Two', days: 30 }
    ],
    weekDays: ['Day 1', 'Day 2', 'Day 3'],
    hoursPerDay: 24,
    minutesPerHour: 60
  })
}

function nineDayWeekCalendar(): CalendarFrontmatter {
  return calendarFrontmatterSchema.parse({
    type: 'calendar',
    eras: [{ id: 'am', name: 'Age of the Many', abbreviation: 'AM', direction: 'up' }],
    months: [{ id: 'aucaela', name: 'Aucaela', days: 100 }],
    weekDays: ['Minem', 'Kleipur', 'Sylvana', 'Shram', 'Thean', 'Numen', 'Genasi', 'Talav', 'Sithi']
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
      { id: 'auctera', name: 'Auctera', days: 100 }
    ]
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

describe('weekdayIndex', () => {
  it('places epoch day 1 (canonical minute 0) at weekday index 0', () => {
    const cal = simpleCalendar()
    expect(weekdayIndex(cal, 0)).toBe(0)
  })

  it('cycles correctly through a 9-day week', () => {
    const cal = nineDayWeekCalendar()
    const perDay = 24 * 60
    expect(weekdayIndex(cal, 0)).toBe(0)
    expect(weekdayIndex(cal, 8 * perDay)).toBe(8)
    expect(weekdayIndex(cal, 9 * perDay)).toBe(0) // wraps
  })

  it('cycles correctly for days before epoch (negative minutes)', () => {
    const cal = simpleCalendar() // 3-day week
    const perDay = 24 * 60
    expect(weekdayIndex(cal, -perDay)).toBe(2) // one day before epoch's weekday 0 -> last column
  })

  it('returns 0 when the calendar has no week days defined', () => {
    const cal = calendarFrontmatterSchema.parse({
      type: 'calendar',
      eras: [{ id: 'ce', name: 'CE', abbreviation: 'CE', direction: 'up' }],
      months: [{ id: 'm1', name: 'Month One', days: 30 }],
      weekDays: []
    })
    expect(weekdayIndex(cal, 12345)).toBe(0)
  })
})

describe('buildMonthGrid', () => {
  it('pads leading cells to the month-starting weekday and fills every day', () => {
    const cal = simpleCalendar() // epoch = m1 day 1 = weekday 0, 3-day week
    const grid = buildMonthGrid(cal, { eraId: 'ce', year: 1, monthId: 'm1' })!
    expect(grid.daysInMonth).toBe(30)
    // First row starts right at day 1 since day 1 IS weekday 0 here.
    expect(grid.weeks[0][0]).not.toBeNull()
    expect(grid.weeks[0][0]!.day).toBe(1)
    // All 30 days present across the grid, in order, no duplicates/gaps.
    const days = grid.weeks.flat().filter((c): c is NonNullable<typeof c> => c !== null).map((c) => c.day)
    expect(days).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
  })

  it('leaves trailing null cells to fill out the last row', () => {
    const cal = simpleCalendar()
    const grid = buildMonthGrid(cal, { eraId: 'ce', year: 1, monthId: 'm1' })!
    const lastRow = grid.weeks[grid.weeks.length - 1]
    expect(lastRow).toHaveLength(3)
  })

  it('grows a leap-rule-targeted month by extraDays in a leap year', () => {
    const cal = gregorianStyleCalendar()
    const leapGrid = buildMonthGrid(cal, { eraId: 'ce', year: 2024, monthId: 'feb' })!
    const normalGrid = buildMonthGrid(cal, { eraId: 'ce', year: 2023, monthId: 'feb' })!
    expect(leapGrid.daysInMonth).toBe(29)
    expect(normalGrid.daysInMonth).toBe(28)
  })

  it('returns null for a month/era that does not exist on this calendar', () => {
    const cal = simpleCalendar()
    expect(buildMonthGrid(cal, { eraId: 'ce', year: 1, monthId: 'nonexistent' })).toBeNull()
    expect(buildMonthGrid(cal, { eraId: 'nonexistent', year: 1, monthId: 'm1' })).toBeNull()
  })
})

describe('stepMonth', () => {
  it('steps forward within a year', () => {
    const cal = simpleCalendar()
    expect(stepMonth(cal, { eraId: 'ce', year: 1, monthId: 'm1' }, 1)).toEqual({ eraId: 'ce', year: 1, monthId: 'm2' })
  })

  it('steps backward within a year', () => {
    const cal = simpleCalendar()
    expect(stepMonth(cal, { eraId: 'ce', year: 1, monthId: 'm2' }, -1)).toEqual({ eraId: 'ce', year: 1, monthId: 'm1' })
  })

  it('rolls over into the next year going forward', () => {
    const cal = simpleCalendar()
    expect(stepMonth(cal, { eraId: 'ce', year: 1, monthId: 'm2' }, 1)).toEqual({ eraId: 'ce', year: 2, monthId: 'm1' })
  })

  it('rolls back into the previous year going backward, when the year has one to roll into', () => {
    const cal = simpleCalendar()
    expect(stepMonth(cal, { eraId: 'ce', year: 2, monthId: 'm1' }, -1)).toEqual({ eraId: 'ce', year: 1, monthId: 'm2' })
  })

  it('returns null stepping back past epoch when no "down" era exists to roll into', () => {
    const cal = simpleCalendar() // only a single "up" era
    expect(stepMonth(cal, { eraId: 'ce', year: 1, monthId: 'm1' }, -1)).toBeNull()
  })

  it('crosses the up/down era boundary forward (AM year 1 -> AF year 1, stepping back past epoch)', () => {
    const cal = twoEraCalendar()
    // AF year 1 is the year immediately before AM year 1 (no year zero) — stepping
    // backward from AM year 1's first month must land in AF, not AM year 0.
    const result = stepMonth(cal, { eraId: 'am', year: 1, monthId: 'aucaela' }, -1)
    expect(result?.eraId).toBe('af')
    expect(result?.year).toBe(1)
  })

  it('crosses the up/down era boundary backward (AF year 1 -> AM year 1, stepping forward past epoch)', () => {
    const cal = twoEraCalendar()
    const result = stepMonth(cal, { eraId: 'af', year: 1, monthId: 'auctera' }, 1)
    expect(result?.eraId).toBe('am')
    expect(result?.year).toBe(1)
  })
})

describe('monthRefForMinutes', () => {
  it('round-trips with toCanonicalMinutes', () => {
    const cal = simpleCalendar()
    const minutes = toCanonicalMinutes(cal, { eraId: 'ce', year: 3, monthId: 'm2', day: 15, hour: 0, minute: 0 })!
    expect(monthRefForMinutes(cal, minutes)).toEqual({ eraId: 'ce', year: 3, monthId: 'm2' })
  })
})

describe('bucketByDay', () => {
  it('groups items by 1-based day number', () => {
    const cal = simpleCalendar()
    const grid = buildMonthGrid(cal, { eraId: 'ce', year: 1, monthId: 'm1' })!
    const day5Minutes = grid.firstStartMinutes + 4 * grid.minutesPerDay
    const buckets = bucketByDay(grid, [
      { minutes: day5Minutes, data: 'a' },
      { minutes: day5Minutes + 60, data: 'b' } // same day, later hour
    ])
    expect(buckets.get(5)).toEqual(['a', 'b'])
  })

  it('drops items outside the month range instead of throwing', () => {
    const cal = simpleCalendar()
    const grid = buildMonthGrid(cal, { eraId: 'ce', year: 1, monthId: 'm1' })!
    const beforeMonth = grid.firstStartMinutes - grid.minutesPerDay
    const afterMonth = grid.firstStartMinutes + grid.daysInMonth * grid.minutesPerDay
    const buckets = bucketByDay(grid, [
      { minutes: beforeMonth, data: 'before' },
      { minutes: afterMonth, data: 'after' }
    ])
    expect(buckets.size).toBe(0)
  })
})
