import { describe, expect, it } from 'vitest'
import { googleCalendarUrl, icsContent, type CalendarMatch } from '../composables/useCalendarLink'

const match: CalendarMatch = {
  title: 'Semifinal: Águilas & Cóndores',
  startIso: '2026-10-17T15:30:00-03:00',
  location: 'Estadio Central, Cancha 1',
  details: 'Fecha 3\nPresentarse 30 minutos antes'
}

describe('useCalendarLink', () => {
  it('builds a Google Calendar URL with UTC dates and encoded fields', () => {
    const url = new URL(googleCalendarUrl(match))

    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('dates')).toBe('20261017T183000Z/20261017T200000Z')
    expect(url.searchParams.get('text')).toBe(match.title)
    expect(url.searchParams.get('location')).toBe(match.location)
    expect(url.searchParams.get('details')).toBe(match.details)
    expect(url.search).toContain('text=Semifinal%3A+%C3%81guilas+%26+C%C3%B3ndores')
  })

  it('uses 90 minutes by default and accepts a custom duration', () => {
    expect(new URL(googleCalendarUrl(match)).searchParams.get('dates'))
      .toBe('20261017T183000Z/20261017T200000Z')
    expect(new URL(googleCalendarUrl({ ...match, durationMinutes: 45 })).searchParams.get('dates'))
      .toBe('20261017T183000Z/20261017T191500Z')
  })

  it('generates valid-looking ICS content with the same duration rules', () => {
    const ics = icsContent({ ...match, durationMinutes: 60 })

    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(ics).toContain('DTSTART:20261017T183000Z')
    expect(ics).toContain('DTEND:20261017T193000Z')
    expect(ics).toContain(`SUMMARY:${match.title}`)
    expect(ics).toContain(`LOCATION:${match.location}`)
    expect(ics).toContain('DESCRIPTION:Fecha 3\nPresentarse 30 minutos antes')
    expect(ics).toMatch(/\r\nEND:VEVENT\r\nEND:VCALENDAR$/)
  })
})
