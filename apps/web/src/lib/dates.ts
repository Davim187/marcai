import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { ptBR } from 'date-fns/locale'

export function fmt(date: string | Date, tz: string, pattern: string) {
  return formatInTimeZone(new Date(date), tz, pattern, { locale: ptBR })
}

export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Data local (YYYY-MM-DD) + hora (HH:mm) no fuso do estabelecimento → ISO UTC */
export function localToIso(date: string, time: string, tz: string) {
  return fromZonedTime(`${date}T${time}:00`, tz).toISOString()
}

export function todayIn(tz: string) {
  return formatInTimeZone(new Date(), tz, 'yyyy-MM-dd')
}

export function durationLabel(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`
}
