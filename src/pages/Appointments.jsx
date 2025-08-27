import { api } from '../api'
import { addDays, endOfMonth, startOfMonth, format } from 'date-fns'
import { ro } from 'date-fns/locale'
import { CalendarDays, X, ChevronLeft, ChevronRight, Wrench, ImagePlus, Search } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import React, { useEffect, useMemo, useRef, useState } from 'react'

export default function Appointments(){
  const location = useLocation()
  const navigate = useNavigate()

  const openForId = location.state?.openForId
  const initialFocusId = location.state?.focusId ? Number(location.state.focusId) : null
  const [focusId, setFocusId] = useState(initialFocusId)

  const [list,setList]=useState([])
  const [services,setServices]=useState([])
  const [employees,setEmployees]=useState([])

  // cine e logat
  const [isEmployee,setIsEmployee]=useState(false)
  const [myEmployeeId,setMyEmployeeId]=useState(null)

  // câmpuri dinamice
  const [tableFields,setTableFields]=useState([])
  const [allFields,setAllFields]=useState([])

  // filtre timp
  const [rangeMode,setRangeMode]=useState('quick')   // quick | custom
  const [quick,setQuick]=useState('next7')           // today | next7 | thismonth | all
  const [from,setFrom]=useState('')
  const [to,setTo]=useState('')

  // filtre listă (valorile rămân codurile din DB)
  const [status,setStatus]=useState('all')
  const [serviceId,setServiceId]=useState('all')
  const [employeeId,setEmployeeId]=useState('all')   // va fi setat automat dacă e EMPLOYEE

  // căutare
  const [q,setQ]=useState('')

  // pagination
  const [pageSize,setPageSize]=useState(10)
  const [page,setPage]=useState(1)

  // „Lucrează”
  const [workForId, setWorkForId] = useState(null)
  const [edit, setEdit] = useState({})
  const [editCustom,setEditCustom] = useState({})
  const [photos,setPhotos]=useState([])
  const [uploading,setUploading]=useState(false)

  // gardă /work
  const openedRef = useRef(new Set())
  const consumedOpenIdRef = useRef(null)

  // === traduceri status → RO (doar pentru afișare)
  const statusLabel = (code) => ({
    PENDING:   'În așteptare',
    BOOKED:    'Rezervată',
    WORKING:   'În lucru',
    COMPLETED: 'Finalizată',
    CANCELLED: 'Anulată',
    OVERDUE:   'Depășită',
  }[code] || code)

  // === load inițial
  async function load(){
    const me = await api('/users/me').catch(()=>null)
    const iAmEmployee = me?.role === 'EMPLOYEE'
    setIsEmployee(iAmEmployee)

    if (iAmEmployee && me?.employee_id) {
      setMyEmployeeId(me.employee_id)
      setEmployeeId(String(me.employee_id)) // forțăm filtrul pe angajatul curent
    }

    const a = await api('/appointments')
    setList(a)
    const [s,e,defs] = await Promise.all([
      api('/services'),
      api('/employees'),
      api('/appointment-fields?active=1')
    ])
    setServices(s); setEmployees(e)
    setAllFields(defs)
    setTableFields(defs.filter(d => d.show_in_table))
  }
  useEffect(()=>{ load() },[])

  useEffect(()=>{ setPage(1) }, [rangeMode,quick,from,to,status,serviceId,employeeId,pageSize,q])

  // === filtrare tabel (dacă avem focusId, afișăm doar acel rând)
  const filtered = useMemo(()=>{
    if (focusId) {
      const idNum = Number(focusId)
      return (list || []).filter(a => Number(a.id) === idNum)
    }

    const now = new Date()
    let start=null, end=null
    if (rangeMode==='quick') {
      if (quick==='today'){ start=new Date(now); start.setHours(0,0,0,0); end=addDays(start,1) }
      if (quick==='next7'){ start=new Date(now); start.setHours(0,0,0,0); end=addDays(start,7) }
      if (quick==='thismonth'){ start=startOfMonth(now); end=endOfMonth(now); end.setHours(23,59,59,999) }
      if (quick==='all'){ start=null; end=null }
    } else {
      if (from) start=new Date(from+'T00:00:00')
      if (to) { end=new Date(to+'T23:59:59') }
    }

    const ql = q.trim().toLowerCase()

    return (list||[]).filter(a=>{
      const st = new Date(a.start_time)
      if (start && st < start) return false
      if (end && st > end) return false
      if (status!=='all' && a.status!==status) return false
      if (serviceId!=='all' && Number(serviceId)!==a.service_id) return false

      // dacă e angajat logat, forțăm filtrul pe el indiferent de UI
      if (isEmployee) {
        if (myEmployeeId && Number(a.employee_id) !== Number(myEmployeeId)) return false
      } else {
        if (employeeId!=='all' && Number(employeeId)!==a.employee_id) return false
      }

      if (ql) {
        const hay = [
          a.customer_name, a.customer_phone, a.customer_email,
          a.service_name, a.employee_name,
          ...(tableFields.map(f => a.custom_fields?.[f.field_key] || ''))
        ].join(' ').toLowerCase()
        if (!hay.includes(ql)) return false
      }
      return true
    })
  },[list, rangeMode, quick, from, to, status, serviceId, employeeId, q, tableFields, isEmployee, myEmployeeId, focusId])

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * pageSize
  const endIdx = Math.min(startIdx + pageSize, total)
  const pageItems = filtered.slice(startIdx, endIdx)

  const fmt = d => format(new Date(d), "EEEE, d MMMM yyyy HH:mm", { locale: ro })

  // --- poze DOAR când se schimbă workForId
  useEffect(()=>{
    let alive = true
    async function run(){
      if (!workForId) { setPhotos([]); return }
      const ph = await api(`/appointments/${workForId}/photos`)
      if (alive) setPhotos(ph)
    }
    run()
    return ()=>{ alive = false }
  }, [workForId])

  // ---- Lucrează (inline)
  async function openWorkInline(appt){
    if (workForId === appt.id) return

    setWorkForId(appt.id)
    setEdit({
      customer_name: appt.customer_name || '',
      customer_phone: appt.customer_phone || '',
      customer_email: appt.customer_email || ''
    })
    setEditCustom(appt.custom_fields || {})

    // prima intrare: PENDING -> BOOKED
    if (!openedRef.current.has(appt.id) && appt.status === 'PENDING') {
      openedRef.current.add(appt.id)
      try {
        await api(`/appointments/${appt.id}/work`, { method:'PUT' })
        setList(prev => prev.map(x => x.id===appt.id ? { ...x, status:'BOOKED' } : x))
      } catch {
        openedRef.current.delete(appt.id)
      }
    }
  }

  function closeWorkInline(){ setWorkForId(null) }

  async function onWorkSave(){
    const requiredDefs = (allFields||[]).filter(f => f.required)
    for (const f of requiredDefs) {
      const v = (editCustom?.[f.field_key] ?? '').toString().trim()
      if (!v) { alert(`Completează câmpul obligatoriu: ${f.label}`); return }
    }
    await api(`/appointments/${workForId}`, {
      method:'PUT',
      body: JSON.stringify({ ...edit, custom_fields: editCustom })
    })
    setList(await api('/appointments'))
    alert('Salvat.')
  }

  async function onUpload(e){
    const files = Array.from(e.target.files||[])
    if(!files.length) return
    setUploading(true)
    const form = new FormData()
    files.forEach(f=>form.append('photos', f))
    const base = import.meta.env.VITE_API_URL || 'http://localhost:4000'
    const r = await fetch(`${base}/api/appointments/${workForId}/photos`, {
      method:'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')||''}` },
      body: form
    })
    const data = await r.json()
    setUploading(false)
    if(!r.ok){ alert(data.error||'Eroare upload'); return }
    setPhotos(await api(`/appointments/${workForId}/photos`))
  }

  const renderDynamicEditor = (f) => {
    const val = editCustom[f.field_key] ?? ''
    const set = v => setEditCustom(s => ({ ...s, [f.field_key]: v }))
    if (f.type==='select') {
      const opts = Array.isArray(f.options) ? f.options : []
      return (
        <div key={f.field_key} className="form-row">
          <label>{f.label}{f.required ? ' *':''}</label>
          <select value={val} onChange={e=>set(e.target.value)} required={!!f.required}>
            <option value="">Alege...</option>
            {opts.map(o=><option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )
    }
    if (f.type==='number') return (
      <div key={f.field_key} className="form-row">
        <label>{f.label}{f.required ? ' *':''}</label>
        <input type="number" value={val} onChange={e=>set(e.target.value)} required={!!f.required} />
      </div>
    )
    if (f.type==='date') return (
      <div key={f.field_key} className="form-row">
        <label>{f.label}{f.required ? ' *':''}</label>
        <input type="date" value={val} onChange={e=>set(e.target.value)} required={!!f.required} />
      </div>
    )
    if (f.type==='textarea') return (
      <div key={f.field_key} className="form-row">
        <label>{f.label}{f.required ? ' *':''}</label>
        <textarea value={val} onChange={e=>set(e.target.value)} required={!!f.required} />
      </div>
    )
    return (
      <div key={f.field_key} className="form-row">
        <label>{f.label}{f.required ? ' *':''}</label>
        <input value={val} onChange={e=>set(e.target.value)} required={!!f.required} />
      </div>
    )
  }

  // — Deschidere automată (notificare / focus): încărcăm din DB după ID și deschidem
  useEffect(()=>{
    const rawId = (typeof focusId !== 'undefined' && focusId !== null) ? focusId : openForId
    if (!rawId || consumedOpenIdRef.current === rawId) return

    const idNum = Number(rawId)
    let cancelled = false

    ;(async ()=>{
      // 1) caută în listă
      let target = (list||[]).find(x => Number(x.id) === idNum)

      // 2) dacă nu e în listă, ia-l din DB
      if (!target) {
        try { target = await api(`/appointments/${idNum}`) } catch { target = null }
        if (target) setList(prev => prev.some(x=>Number(x.id)===idNum) ? prev : [target, ...prev])
      }

      consumedOpenIdRef.current = rawId

      if (!target || cancelled) {
        navigate('.', { replace:true, state:null })
        return
      }

      // asigurăm focus
      setFocusId(idNum)

      // deschide + highlight + scroll
      setTimeout(()=>{
        if (cancelled) return
        openWorkInline(target)
        setTimeout(()=>{
          const el = document.getElementById(`row-appt-${target.id}`)
          if (el) {
            el.classList.add('highlight')
            el.scrollIntoView({ behavior:'smooth', block:'center' })
            setTimeout(()=>el.classList.remove('highlight'), 1700)
          }
        }, 0)
        navigate('.', { replace:true, state:null })
      }, 0)
    })()

    return ()=>{ cancelled = true }
  }, [focusId, openForId, list])  // eslint-disable-line

  return (
    <div className="card">
      <h2 style={{display:'flex', alignItems:'center', gap:8}}>
        <CalendarDays size={20}/> Programări
      </h2>

     {focusId && (
  <div className="info-bar focus-bar">
    <span><b>Mod focus</b>: se afișează doar programarea #{focusId}</span>
    <button
      className="secondary"
      onClick={()=>{
        setWorkForId(null)
        setFocusId(null)
        setStatus('all')
        setRangeMode('quick')
        setQuick('next7')
        setFrom('')
        setTo('')
        setQ('')
        setPage(1)
        navigate('.', { replace: true, state: null })
        // opțional: load()
      }}
    >
      Înapoi la listă
    </button>
  </div>
)}

      {/* FILTRE + CĂUTARE */}
      <div className="filters">
        <div>
          <label>Mod perioadă</label>
     
            <select value={rangeMode} onChange={e=>setRangeMode(e.target.value)}>
              <option value="quick">Rapid</option>
              <option value="custom">Interval</option>
            </select>
        
        </div>

        {rangeMode==='quick' ? (
          <div>
            <label>Perioadă</label>
       
              <select value={quick} onChange={e=>setQuick(e.target.value)}>
                <option value="today">Astăzi</option>
                <option value="next7">Următoarele 7 zile</option>
                <option value="thismonth">Luna aceasta</option>
                <option value="all">Toate</option>
              </select>
         
          </div>
        ) : (
          <>
            <div>
              <label>De la</label>
              <input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
            </div>
            <div>
              <label>Până la</label>
              <input type="date" value={to} onChange={e=>setTo(e.target.value)} />
            </div>
          </>
        )}

        <div>
          <label>Stare</label>

            <select value={status} onChange={e=>setStatus(e.target.value)}>
              <option value="all">Toate</option>
              <option value="PENDING">{statusLabel('PENDING')}</option>
              <option value="BOOKED">{statusLabel('BOOKED')}</option>
              <option value="WORKING">{statusLabel('WORKING')}</option>
              <option value="COMPLETED">{statusLabel('COMPLETED')}</option>
              <option value="CANCELLED">{statusLabel('CANCELLED')}</option>
              <option value="OVERDUE">{statusLabel('OVERDUE')}</option>
            </select>
        
        </div>

        <div>
          <label>Serviciu</label>
    
            <select value={serviceId} onChange={e=>setServiceId(e.target.value)}>
              <option value="all">Toate</option>
              {services.map(s=>(
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
   
        </div>

        {/* Ascunde filtrul Angajat când e logat un EMPLOYEE */}
        {!isEmployee && (
          <div>
            <label>Angajat</label>
       
              <select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
                <option value="all">Toți</option>
                {employees.map(e=>(
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
  
          </div>
        )}

        <div className="select--sm">
          <label>Pe pagină</label>
 
            <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
            </select>
     
        </div>

        <div style={{marginLeft:'auto', display:'flex', flexDirection:'column'}}>
          <label>Căutare</label>
          <div className="input-icon">
            <Search size={16}/>
            <input
              placeholder="Caută în rezultate"
              value={q}
              onChange={e=>setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* TABEL + Lucrează */}
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th >ID</th>
              <th >Client</th>
              <th >Serviciu</th>
              <th >Angajat</th>
              {tableFields.map(f => <th key={f.field_key}>{f.label}</th>)}
              <th >Start</th>
              <th >Stare</th>
              <th >Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map(a=>(
              <React.Fragment key={a.id}>
                <tr id={`row-appt-${a.id}`} className="appt-row">
                  <td>#{a.id}</td>
                  <td>{a.customer_name}<div className="sub">{a.customer_phone}</div></td>
                  <td>{a.service_name}</td>
                  <td>{a.employee_name||'-'}</td>
                  {tableFields.map(f => (
                    <td key={f.field_key}>{a.custom_fields?.[f.field_key] ?? '—'}</td>
                  ))}
                  <td>{fmt(a.start_time)}</td>
                  <td>
                    <span className={`badge ${a.status.toLowerCase()}`}>
                      {statusLabel(a.status)}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button onClick={()=>workForId===a.id ? closeWorkInline() : openWorkInline(a)}>
                        <Wrench size={14}/>
                      </button>
                      {a.status!=='CANCELLED' && (
                        <button onClick={async()=>{ await api(`/appointments/${a.id}/cancel`, { method:'PUT' }); setList(await api('/appointments')) }}>
                          <X size={14}/>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>

                {workForId===a.id && (
                  <tr className="work-row">
                    <td colSpan={9 + tableFields.length}>
                      <div className="work-panel">
                        <div className="work-grid">
                          <div className="form-row">
                            <label>Nume client</label>
                            <input value={edit.customer_name} onChange={e=>setEdit({...edit, customer_name:e.target.value})}/>
                          </div>
                          <div className="form-row">
                            <label>Telefon</label>
                            <input value={edit.customer_phone} onChange={e=>setEdit({...edit, customer_phone:e.target.value})}/>
                          </div>
                          <div className="form-row">
                            <label>Email</label>
                            <input value={edit.customer_email} onChange={e=>setEdit({...edit, customer_email:e.target.value})}/>
                          </div>

                          <div className="form-spacer"/>
                          <h4 className="work-subtitle">Detalii suplimentare</h4>

                          {allFields.length===0 && <div className="muted">Nu există câmpuri definite. Adaugă din Admin → Câmpuri.</div>}
                          {allFields.map(renderDynamicEditor)}

                          <div className="form-spacer"/>
                          <h4 className="work-subtitle">Imagini</h4>

                          <div className="upload-row">
                            <label className="icon-btn" htmlFor={`fileup-${a.id}`}><ImagePlus size={16}/> Adaugă imagini</label>
                            <input id={`fileup-${a.id}`} type="file" accept="image/*" multiple onChange={onUpload} style={{display:'none'}} />
                            {uploading && <span className="muted">Se încarcă…</span>}
                          </div>

                          <div className="photos-wrap">
                            {photos.map(p => (
                              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                                <img src={p.url} alt="" />
                              </a>
                            ))}
                            {(!photos || photos.length===0) && <span className="muted">Fără imagini încă.</span>}
                          </div>

                          <div className="work-actions">
                            <button className="primary" onClick={onWorkSave}>Salvează</button>
                            <button
                              className="success"
                              onClick={async ()=>{
                                await api(`/appointments/${workForId}`, {
                                  method:'PUT',
                                  body: JSON.stringify({ ...edit, custom_fields: editCustom })
                                })
                                try {
                                  await api(`/appointments/${workForId}/complete`, { method:'PUT' })
                                  alert('Programare finalizată.')
                                  setWorkForId(null)
                                  setList(await api('/appointments'))
                                } catch (e) {
                                  const msg = e?.error || 'Validare eșuată'
                                  const dyn = (e?.dynMissing||[]).map(x=>`- ${x.label}`).join('\n')
                                  const bits = [
                                    e?.coreMissing?.customer_name ? '• Nume lipsă' : null,
                                    e?.coreMissing?.customer_phone ? '• Telefon lipsă' : null,
                                    e?.photosMissing ? '• Trebuie cel puțin o poză' : null,
                                    dyn ? `• Câmpuri obligatorii:\n${dyn}` : null
                                  ].filter(Boolean).join('\n')
                                  alert(`${msg}\n\n${bits}`)
                                }
                              }}
                            >
                              Completează
                            </button>
                            <button onClick={closeWorkInline}>Închide</button>
                          </div>

                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {pageItems.length===0 && (
              <tr><td colSpan={9 + tableFields.length} style={{textAlign:'center', color:'var(--muted)'}}>Nicio programare în filtrul curent.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINARE */}
      <div className="pagination">
        <div className="muted">{total === 0 ? '0 rezultate' : `${startIdx+1}–${endIdx} din ${total}`}</div>
        <div className="pager">
          <button disabled={currentPage<=1} onClick={()=>setPage(p=>Math.max(1, p-1))}><ChevronLeft size={16}/> Înapoi</button>
          <span>Pagina {currentPage} / {totalPages}</span>
          <button disabled={currentPage>=totalPages} onClick={()=>setPage(p=>Math.min(totalPages, p+1))}>Înainte <ChevronRight size={16}/></button>
        </div>
      </div>
    </div>
  )
}
