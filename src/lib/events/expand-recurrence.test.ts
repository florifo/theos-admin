import { describe, it, expect } from 'vitest'
import { expandRecurring, nextOccurrence, recurrenceLabel, isPastEvent } from './expand-recurrence'

// Charla típica: martes 19:00 hora CR = miércoles 01:00 UTC. El caso que
// motivó el truco fake-UTC: sin él, WEEKLY:TUE generaba lunes locales.
const marTes19CR = {
  id: 'ev1',
  start_at: '2026-07-07T19:00:00-06:00', // martes 7 jul 2026, 19:00 CR
  end_at: '2026-07-07T21:00:00-06:00',
  is_recurring: true,
  recurrence_rule: 'WEEKLY:TUE',
  recurrence_end: null as string | null,
}

/** Día de la semana EN CR de un ISO (0=domingo…2=martes). CR es UTC-6 fijo. */
function crWeekday(iso: string): number {
  return new Date(new Date(iso).getTime() - 6 * 3600_000).getUTCDay()
}

describe('expandRecurring', () => {
  it('WEEKLY:TUE de una charla nocturna genera MARTES en hora CR (no lunes)', () => {
    const occ = expandRecurring(marTes19CR, new Date('2026-07-08T00:00:00Z'), new Date('2026-08-01T00:00:00Z'))
    expect(occ.length).toBeGreaterThan(0)
    for (const o of occ) {
      expect(crWeekday(o.start_at)).toBe(2) // martes
    }
  })

  it('conserva la duración del evento', () => {
    const occ = expandRecurring(marTes19CR, new Date('2026-07-08T00:00:00Z'), new Date('2026-07-20T00:00:00Z'))
    const o = occ[0]
    expect(new Date(o.end_at).getTime() - new Date(o.start_at).getTime()).toBe(2 * 3600_000)
  })

  it('no duplica la instancia original', () => {
    const occ = expandRecurring(marTes19CR, new Date('2026-07-01T00:00:00Z'), new Date('2026-07-20T00:00:00Z'))
    expect(occ.some(o => o.start_at === new Date(marTes19CR.start_at).toISOString())).toBe(false)
  })

  it('excluye las fechas exceptuadas (canceladas/override) en hora CR', () => {
    const withException = { ...marTes19CR, exception_dates: ['2026-07-14'] }
    // Ventana hasta el 23: la ocurrencia del martes 21 19:00 CR es 22 01:00Z.
    const occ = expandRecurring(withException, new Date('2026-07-08T00:00:00Z'), new Date('2026-07-23T00:00:00Z'))
    const dates = occ.map(o => new Date(new Date(o.start_at).getTime() - 6 * 3600_000).toISOString().slice(0, 10))
    expect(dates).not.toContain('2026-07-14')
    expect(dates).toContain('2026-07-21')
  })

  it('respeta recurrence_end', () => {
    const ending = { ...marTes19CR, recurrence_end: '2026-07-15T00:00:00Z' }
    const occ = expandRecurring(ending, new Date('2026-07-08T00:00:00Z'), new Date('2026-09-01T00:00:00Z'))
    for (const o of occ) {
      expect(new Date(o.start_at).getTime()).toBeLessThan(new Date('2026-07-16T00:00:00Z').getTime())
    }
  })

  it('regla inválida no revienta: devuelve []', () => {
    const bad = { ...marTes19CR, recurrence_rule: 'CADA_LUNA_LLENA' }
    expect(expandRecurring(bad, new Date('2026-07-01T00:00:00Z'), new Date('2026-08-01T00:00:00Z'))).toEqual([])
  })

  it('no recurrente devuelve []', () => {
    const single = { ...marTes19CR, is_recurring: false }
    expect(expandRecurring(single, new Date('2026-07-01T00:00:00Z'), new Date('2026-08-01T00:00:00Z'))).toEqual([])
  })
})

describe('nextOccurrence', () => {
  it('devuelve la instancia original si aún no pasa', () => {
    const next = nextOccurrence(marTes19CR, new Date('2026-07-01T00:00:00Z'))
    expect(next?.toISOString()).toBe(new Date(marTes19CR.start_at).toISOString())
  })
  it('después de la original, devuelve el siguiente martes CR', () => {
    const next = nextOccurrence(marTes19CR, new Date('2026-07-10T00:00:00Z'))
    expect(next).not.toBeNull()
    expect(crWeekday(next!.toISOString())).toBe(2)
  })
  it('salta fechas exceptuadas', () => {
    const withException = { ...marTes19CR, exception_dates: ['2026-07-14'] }
    const next = nextOccurrence(withException, new Date('2026-07-10T00:00:00Z'))
    const crDate = new Date(next!.getTime() - 6 * 3600_000).toISOString().slice(0, 10)
    expect(crDate).toBe('2026-07-21')
  })
})

describe('recurrenceLabel', () => {
  it('semanal simple y múltiple', () => {
    expect(recurrenceLabel('WEEKLY:TUE')).toBe('Cada martes')
    expect(recurrenceLabel('WEEKLY:TUE,THU')).toBe('Cada martes y jueves')
  })
  it('mensual por día del mes y por posición', () => {
    expect(recurrenceLabel('FREQ=MONTHLY;BYMONTHDAY=15')).toBe('El día 15 de cada mes')
    expect(recurrenceLabel('FREQ=MONTHLY;BYDAY=2TU')).toBe('El segundo martes de cada mes')
  })
  it('null → null', () => {
    expect(recurrenceLabel(null)).toBeNull()
  })
})

describe('isPastEvent', () => {
  it('compara contra end_at (o start_at si no hay)', () => {
    const now = new Date('2026-07-10T00:00:00Z')
    expect(isPastEvent({ start_at: '2026-07-01T00:00:00Z', end_at: '2026-07-02T00:00:00Z' }, now)).toBe(true)
    expect(isPastEvent({ start_at: '2026-07-09T00:00:00Z', end_at: '2026-07-11T00:00:00Z' }, now)).toBe(false)
  })
})

// Una serie de Madrid cruzando el cambio de horario. Con el desfase fijo de -6h
// que había antes, todas las ocurrencias posteriores al último domingo de
// octubre se corrían una hora — y la del propio cambio podía caer otro día.
describe('serie en otra zona horaria', () => {
  const charlaMadrid = {
    id: 'madrid',
    // Domingo 13 de setiembre de 2026, 12:00 de Madrid (verano: UTC+2).
    start_at: '2026-09-13T10:00:00.000Z',
    end_at: '2026-09-13T12:00:00.000Z',
    is_recurring: true,
    recurrence_rule: 'WEEKLY:SUN',
    recurrence_end: '2027-12-31T23:59:59Z',
    timezone: 'Europe/Madrid',
  }

  const hhmm = (iso: string, zona: string) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date(iso))

  it('sigue siendo el mediodía de Madrid después del cambio de horario', () => {
    const occ = expandRecurring(charlaMadrid, new Date('2026-10-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'))
    expect(occ.length).toBeGreaterThan(6)
    for (const o of occ) expect(hhmm(o.start_at, 'Europe/Madrid')).toBe('12:00')
  })

  it('y por eso en Costa Rica SÍ cambia: 4:00am en octubre, 5:00am en noviembre', () => {
    const occ = expandRecurring(charlaMadrid, new Date('2026-10-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'))
    const oct = occ.find(o => o.start_at < '2026-10-25')!
    const nov = occ.find(o => o.start_at > '2026-11-01')!
    expect(hhmm(oct.start_at, 'America/Costa_Rica')).toBe('04:00')
    expect(hhmm(nov.start_at, 'America/Costa_Rica')).toBe('05:00')
  })

  it('todas caen en domingo, no se corre el día', () => {
    const occ = expandRecurring(charlaMadrid, new Date('2026-09-14T00:00:00Z'), new Date('2026-12-01T00:00:00Z'))
    for (const o of occ) {
      const dia = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short' })
        .format(new Date(o.start_at))
      expect(dia).toBe('Sun')
    }
  })
})
