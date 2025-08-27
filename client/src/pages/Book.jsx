import React, { useEffect, useMemo, useState } from 'react'
import Calendar from '../components/Calendar'
import { format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { Clock, UserRound, Phone, Mail, CheckCircle2 } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function Book(){
  // servicii/angajați/sloturi
  const [services,setServices]=useState([])
  const [employees,setEmployees]=useState([])
  const [serviceId,setServiceId]=useState('')
  const [employeeId,setEmployeeId]=useState('')
  const [dateObj,setDateObj]=useState(new Date())
  const [slots,setSlots]=useState([])
  const [selectedSlot,setSelectedSlot]=useState(null)

  // client
  const [name,setName]=useState('')
  const [phone,setPhone]=useState('')
  const [email,setEmail]=useState('')

  // câmpuri dinamice (definite de admin) + valori
  const [dynFields, setDynFields] = useState([])
  const [dynValues, setDynValues] = useState({})

  // succes overlay
  const [showSuccess, setShowSuccess] = useState(false)

  const dateStr = useMemo(()=>new Date(dateObj).toISOString().slice(0,10),[dateObj])

  // load servicii
  useEffect(()=>{ fetch(`${API}/api/services`).then(r=>r.json()).then(setServices).catch(()=>setServices([])) },[])

  // load angajați pentru serviciu
  useEffect(()=>{
    if(!serviceId){ setEmployees([]); setEmployeeId(''); return }
    fetch(`${API}/api/employees?service_id=${serviceId}`).then(r=>r.json()).then(setEmployees).catch(()=>setEmployees([]))
  },[serviceId])

  // load sloturi
  useEffect(()=>{ loadSlots() }, [serviceId, employeeId, dateStr])

  // load câmpuri dinamice ACTIVE + pentru BOOKING (filtrate pe client)
useEffect(()=>{
  fetch(`${API}/api/appointment-fields?active=1&for_booking=1`)
    .then(r=>r.json())
    .then(rows => setDynFields(Array.isArray(rows) ? rows : []))
    .catch(()=>setDynFields([]))
},[])


  async function loadSlots(){
    setSelectedSlot(null)
    if(!serviceId || !dateStr) { setSlots([]); return }
    const params = new URLSearchParams({ service_id: serviceId, date: dateStr })
    if (employeeId) params.set('employee_id', employeeId)
    const r = await fetch(`${API}/api/availability?`+params.toString())
    const data = await r.json()
    if (employeeId) setSlots((data.slots||[]).map(s=>({ ...s })))
    else {
      const merged=[]
      for (const e of (data.by_employee||[])) (e.slots||[]).forEach(s=>merged.push({ ...s, employee_id:e.employee_id, employee_name:e.employee_name }))
      setSlots(merged)
    }
  }

  async function createAppointment(){
    if(!selectedSlot){ alert('Alege un interval orar.'); return }
    if(!name || !phone || !serviceId){ alert('Completează nume, telefon și serviciu'); return }

    // construim câmpurile custom doar dacă există valori
    const cleanCustom = {}
    for (const f of dynFields) {
      const v = dynValues[f.field_key]
      if (v !== undefined && v !== null && String(v).trim() !== '') cleanCustom[f.field_key] = v
      if (f.required && !cleanCustom[f.field_key]) {
        alert(`Completează câmpul: ${f.label}`)
        return
      }
    }

    const payload = {
      service_id: Number(serviceId),
      employee_id: selectedSlot.employee_id ? Number(selectedSlot.employee_id) : (employeeId ? Number(employeeId) : null),
      customer_name: name,
      customer_phone: phone,
      customer_email: email || null,
      start_time_utc: selectedSlot.start,
      custom_fields: Object.keys(cleanCustom).length ? cleanCustom : undefined
    }

    const res = await fetch(`${API}/api/appointments`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    })
    const data = await res.json()
    if(!res.ok){ alert(data.error || 'Eroare'); return }

    // animația de succes
setShowSuccess(true)

// după 2.5 secunde se închide overlay și se face refresh
setTimeout(() => {
  setShowSuccess(false)
  window.location.reload()
}, 2500)
  }

  const now = new Date()
  const isSameSelectedDay = (d) => d.toDateString() === new Date(dateObj).toDateString()
  const visibleSlots = slots.filter(s=>{
    const st = new Date(s.start)
    if (isSameSelectedDay(st)) return st >= now
    return true
  })

  const renderField = (f) => {
    const val = dynValues[f.field_key] ?? ''
    const set = v => setDynValues(s => ({ ...s, [f.field_key]: v }))
    if (f.type==='select') {
      const opts = Array.isArray(f.options) ? f.options : []
      return (
        <div key={f.field_key}>
          <label>{f.label}{f.required ? ' *':''}</label>
          <select value={val} onChange={e=>set(e.target.value)} required={!!f.required}>
            <option value="">Alege...</option>
            {opts.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )
    }
    if (f.type==='number') return (
      <div key={f.field_key}>
        <label>{f.label}{f.required ? ' *':''}</label>
        <input type="number" value={val} onChange={e=>set(e.target.value)} required={!!f.required} />
      </div>
    )
    if (f.type==='date') return (
      <div key={f.field_key}>
        <label>{f.label}{f.required ? ' *':''}</label>
        <input type="date" value={val} onChange={e=>set(e.target.value)} required={!!f.required} />
      </div>
    )
    if (f.type==='textarea') return (
      <div key={f.field_key}>
        <label>{f.label}{f.required ? ' *':''}</label>
        <textarea value={val} onChange={e=>set(e.target.value)} required={!!f.required} />
      </div>
    )
    return (
      <div key={f.field_key}>
        <label>{f.label}{f.required ? ' *':''}</label>
        <input value={val} onChange={e=>set(e.target.value)} required={!!f.required} />
      </div>
    )
  }

  return (
    <>
      <div className="card">
        <div className="book-two-col">
          {/* STÂNGA — DATE CLIENT */}
          <div style={{display:'grid', gap:10}}>
            <h3>Detalii client</h3>
            <div className="input-icon"><UserRound size={16}/><input placeholder="Nume" value={name} onChange={e=>setName(e.target.value)} /></div>
            <div className="input-icon"><Phone size={16}/><input placeholder="Telefon (+40...)" value={phone} onChange={e=>setPhone(e.target.value)} /></div>
            <div className="input-icon"><Mail size={16}/><input placeholder="Email (opțional)" value={email} onChange={e=>setEmail(e.target.value)} /></div>

            <label>Serviciu</label>
            <select value={serviceId} onChange={e=>setServiceId(e.target.value)}>
              <option value="">Alege serviciul</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name} — {(s.price_cents/100).toFixed(2)} RON ({s.duration_minutes} min)</option>)}
            </select>

            <label>Angajat (opțional)</label>
            <select value={employeeId} onChange={e=>setEmployeeId(e.target.value)} disabled={!serviceId}>
              <option value="">Oricine</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>

            {dynFields.length>0 && <h3>Detalii suplimentare</h3>}
            {dynFields.map(renderField)}

           
          </div>
          {/* DREAPTA — ORE */}
          <div>
             <h3>Data</h3>
            <Calendar value={dateObj} onChange={setDateObj} serviceId={serviceId||null} employeeId={employeeId||null} apiBase={API} />
            <h3>Ore disponibile — {format(dateObj,'EEEE, d MMMM yyyy', { locale: ro })}</h3>
            {!serviceId ? <i>Alege întâi un serviciu.</i> :
              visibleSlots.length===0 ? <i>Nu sunt intervale libere pentru data aleasă.</i> :
              <div className="slot-grid compact">
                {visibleSlots.map((s,i)=>{
                  const isActive = selectedSlot?.start===s.start && selectedSlot?.employee_id===s.employee_id
                  const hhmm = new Date(s.start).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})
                  const empName = s.employee_name ? ` (${s.employee_name})` : ''
                  return (
                    <button key={i} className={`slot-btn ${isActive?'active':''}`} onClick={()=>setSelectedSlot(s)}>
                      <Clock size={14} style={{verticalAlign:'-2px'}}/> {hhmm}{empName}
                    </button>
                  )
                })}
              </div>
            }
            <div style={{marginTop:16, display:'flex', justifyContent:'flex-end'}}>
              <button className="primary" onClick={createAppointment}>
                <CheckCircle2 size={16} style={{verticalAlign:'-3px'}}/> Programează
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* OVERLAY SUCCES */}
      {showSuccess && (
        <div className="success-overlay">
          <CheckCircle2 size={120} className="success-check" />
          <p>Programare creată!</p>
        </div>
      )}
    </>
  )
}
