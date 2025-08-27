// utils/time.js
import { DateTime } from 'luxon'

export const TZ = 'Europe/Bucharest'

// Primește un Date/ISO și îl întoarce la zi ISO (1..7) în RO
export function getIsoDayRO(d) {
  return DateTime.fromJSDate(new Date(d), { zone: 'utc' }).setZone(TZ).weekday
}

// Îți dă un obiect HH:mm în RO
export function toHHmmRO(d) {
  const dt = DateTime.fromJSDate(new Date(d), { zone: 'utc' }).setZone(TZ)
  return dt.toFormat('HH:mm')
}

// Construiește Date UTC dintr-o dată/zi RO + ora locală
export function roLocalToUTC(dateLike, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const ro = DateTime.fromJSDate(new Date(dateLike), { zone: TZ }).set({ hour:h, minute:m, second:0, millisecond:0 })
  return ro.toUTC().toJSDate()
}
