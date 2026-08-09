import { describe, it, expect } from 'vitest'
import { matchEventsToPins, countUnplacedEvents, type EventSummary } from '../src/lib/mapTimeline'
import type { MapPin } from '../src/lib/noteTypes/map'

function event(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    id: 'event-1',
    name: 'Some Event',
    date: '1 Aucaela, 10 AM',
    summary: '',
    noteType: 'event',
    location: null,
    ...overrides
  }
}

function pin(overrides: Partial<MapPin> = {}): MapPin {
  return { id: 'pin-1', x: 0, y: 0, locationTitle: 'Townsville', label: '', ...overrides }
}

describe('matchEventsToPins', () => {
  it('matches an event to the pin sharing its location title', () => {
    const events = [event({ location: 'Townsville' })]
    const pins = [pin({ id: 'p1', locationTitle: 'Townsville' })]
    const matched = matchEventsToPins(events, pins)
    expect(matched).toHaveLength(1)
    expect(matched[0].pin.id).toBe('p1')
  })

  it('excludes events with no location', () => {
    const events = [event({ location: null })]
    expect(matchEventsToPins(events, [pin()])).toHaveLength(0)
  })

  it('excludes events whose location has no pin on this map', () => {
    const events = [event({ location: 'Nowhereville' })]
    expect(matchEventsToPins(events, [pin({ locationTitle: 'Townsville' })])).toHaveLength(0)
  })

  it('excludes History-section-derived facts even if they happen to have a location value', () => {
    const events = [event({ noteType: 'npc', location: 'Townsville' })]
    expect(matchEventsToPins(events, [pin({ locationTitle: 'Townsville' })])).toHaveLength(0)
  })

  it('ignores freehand pins (no locationTitle) when matching', () => {
    const events = [event({ location: 'Townsville' })]
    const pins = [pin({ locationTitle: null, label: 'Townsville' })]
    expect(matchEventsToPins(events, pins)).toHaveLength(0)
  })

  it('preserves the input chronological order among matches', () => {
    const events = [
      event({ name: 'First', date: '1 Aucaela, 5 AM', location: 'Townsville' }),
      event({ name: 'Unmatched', location: 'Nowhereville' }),
      event({ name: 'Second', date: '1 Aucaela, 10 AM', location: 'Townsville' })
    ]
    const matched = matchEventsToPins(events, [pin({ locationTitle: 'Townsville' })])
    expect(matched.map((m) => m.event.name)).toEqual(['First', 'Second'])
  })
})

describe('countUnplacedEvents', () => {
  it('counts events with a location that has no pin on this map', () => {
    const events = [event({ location: 'Townsville' }), event({ location: 'Nowhereville' })]
    expect(countUnplacedEvents(events, [pin({ locationTitle: 'Townsville' })])).toBe(1)
  })

  it('does not count events with no location at all', () => {
    const events = [event({ location: null })]
    expect(countUnplacedEvents(events, [])).toBe(0)
  })

  it('does not count non-event entries', () => {
    const events = [event({ noteType: 'npc', location: 'Nowhereville' })]
    expect(countUnplacedEvents(events, [])).toBe(0)
  })
})
