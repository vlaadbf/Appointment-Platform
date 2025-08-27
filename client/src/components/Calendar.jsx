import React, { useEffect, useMemo, useState } from 'react'
import {
  addMonths, subMonths,
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameDay, isSameMonth, format,
  startOfDay, isBefore
} from 'date-fns'
import { ro } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react'

/**
 * Calendar lunar (RO):
 * - combină disponibilitatea pe lună (endpoint-ul tău existent)
 *   cu zilele închise din /api/hours/range (program + excepții)
 * - blochează automat zilele din trecut (calculat pe RO)
 * - NU folosește date-fns-tz; utilizează Intl.DateTimeFormat cu timeZone: 'Europe/Bucharest'
 */
export default function Calendar({ value, onChange, serviceId, employeeId, apiBase }) {
  const TZ = 'Europe/Bucharest'
  const current = value ?? new Date()
  const [cursor, setCursor] = useState(startOfMonth(current))
  const [monthMap, setMonthMap] = useState([]) // [{day (1..31), available:boolean}]
  const [closedSet, setClosedSet] = useState(()=>new Set()) // Set('YYYY-MM-DD')

  // --- Helpers TZ (RO) fără date-fns-tz ---
  const dayKeyRO = (date) => {
    // 'en-CA' formatează implicit ca YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date)
  }
  const isPastRO = (date) => {
    // comparăm cheile (YYYY-MM-DD) lexicografic
    return dayKeyRO(date) < dayKeyRO(new Date())
  }

  // Fetch disponibilitatea pentru luna curentă (endpoint existent)
  useEffect(()=>{
    if(!serviceId) { setMonthMap([]); return }
    const y = cursor.getFullYear()
    const m = cursor.getMonth() + 1
    const p = new URLSearchParams({ service_id: String(serviceId), year: String(y), month: String(m) })
    if (employeeId) p.set('employee_id', String(employeeId))
    fetch(`${apiBase}/api/availability/calendar?`+p.toString())
      .then(r=>r.json()).then(setMonthMap).catch(()=>setMonthMap([]))
  },[cursor, serviceId, employeeId, apiBase])

  // Fetch zile închise din /hours/range, pentru luna curentă (chei pe RO)
  useEffect(()=>{
    const fromStr = dayKeyRO(startOfMonth(cursor))
    const toStr   = dayKeyRO(endOfMonth(cursor))
    fetch(`${apiBase}/api/hours/range?from=${fromStr}&to=${toStr}`, { credentials:'include' })
      .then(r=>r.json())
      .then(arr=>{
        const s = new Set()
        if (Array.isArray(arr)) {
          for (const d of arr) if (d?.closed) s.add(d.date)
        }
        setClosedSet(s)
      })
      .catch(()=>setClosedSet(new Set()))
  }, [cursor, apiBase])

  const lookup = useMemo(()=>{
    const map = new Map()
    monthMap.forEach(x => map.set(x.day, x.available))
    return map
  },[monthMap])

  const weeks = useMemo(()=>{
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    const days = []
    let d = start
    while (d <= end) { days.push(d); d = addDays(d, 1) }
    const rows = []
    for (let i=0;i<days.length;i+=7) rows.push(days.slice(i, i+7))
    return rows
  },[cursor])

  // "Astăzi" pentru UI (doar pentru selected/highlight), dar blocarea se face cu isPastRO(day)
  const todayLocal = startOfDay(new Date())

  return (
    <div className="card" style={{padding:12}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
        <button onClick={()=>setCursor(subMonths(cursor,1))}><ChevronLeft size={18}/></button>
        <div style={{display:'flex', gap:8, alignItems:'center', fontWeight:600}}>
          <CalIcon size={18}/> {format(cursor, 'LLLL yyyy', { locale: ro })}
        </div>
        <button onClick={()=>setCursor(addMonths(cursor,1))}><ChevronRight size={18}/></button>
      </div>

      <div className="cal-grid">
        {['L','Ma','Mi','J','V','S','D'].map((h,i)=>( // Luni=1
          <div key={i} className="cal-head">{h}</div>
        ))}
        {weeks.map((row, ri)=>row.map((day, di)=>{
          const selected = value && isSameDay(day, value)
          const faded = !isSameMonth(day, cursor)

          // cheie pentru setul de zile închise (calculată pe RO)
          const dayKey = dayKeyRO(day)

          // disponibilitatea o luăm din lookup DOAR pentru zilele din luna curentă
          const availableForDay = faded ? false : (lookup.get(day.getDate()) ?? true)

          // blocăm: trecut (în RO) + zile închise + indisponibile
          const isPast = isPastRO(day)
          const isClosed = closedSet.has(dayKey)
          const blocked = isPast || isClosed || !availableForDay

          return (
            <button
              key={`${ri}-${di}`}
              className={`cal-cell ${selected?'selected':''} ${faded?'faded':''} ${blocked?'blocked':''}`}
              onClick={()=>!blocked && onChange?.(day)}
              type="button"
              title={blocked ? (isClosed ? 'Închis' : 'Indisponibil') : 'Disponibil'}
            >
              {format(day,'d')}
            </button>
          )
        }))}
      </div>
    </div>
  )
}
