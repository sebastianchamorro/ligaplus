// Utilidades para "agregar al calendario" un partido - 100% client-side, sin backend
// ni costo (nada que ver con las notificaciones push/email, que son otra historia).

function toUtcStamp(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export type CalendarMatch = {
  title: string
  startIso: string
  durationMinutes?: number
  location?: string
  details?: string
}

export function googleCalendarUrl(m: CalendarMatch) {
  const start = new Date(m.startIso)
  const end = new Date(start.getTime() + (m.durationMinutes ?? 90) * 60000)
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: m.title,
    dates: `${toUtcStamp(start.toISOString())}/${toUtcStamp(end.toISOString())}`,
    details: m.details ?? '',
    location: m.location ?? ''
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function icsContent(m: CalendarMatch) {
  const start = new Date(m.startIso)
  const end = new Date(start.getTime() + (m.durationMinutes ?? 90) * 60000)
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//liga.futbol.app//ES',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@liga.futbol.app`,
    `DTSTAMP:${toUtcStamp(new Date().toISOString())}`,
    `DTSTART:${toUtcStamp(start.toISOString())}`,
    `DTEND:${toUtcStamp(end.toISOString())}`,
    `SUMMARY:${m.title}`,
    m.location ? `LOCATION:${m.location}` : '',
    m.details ? `DESCRIPTION:${m.details}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ]
    .filter(Boolean)
    .join('\r\n')
}

export function downloadIcs(m: CalendarMatch, filename: string) {
  const blob = new Blob([icsContent(m)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
