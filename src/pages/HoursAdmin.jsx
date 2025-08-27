import React, { useEffect, useState } from 'react'
import { api } from '../api'

const days = ['Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă','Duminică']
const hhmmToMin = s => { const [h,m]=s.split(':').map(Number); return h*60+m }
const minToHHMM = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`

export default function HoursAdmin(){
  // program recurent
  const [rows,setRows]=useState([])

  // excepții
  const [exList,setExList]=useState([])
  const [exDate,setExDate]=useState('')
  const [exClosed,setExClosed]=useState(true)
  const [exOpen,setExOpen]=useState('09:00')
  const [exClose,setExClose]=useState('18:00')
  const [exNote,setExNote]=useState('')

  async function loadHours(){
    const r = await api('/hours')
    // business_hours weekday: 1..7 (L..D)
    const map = new Map(r.map(x=>[x.weekday, x]))
    const full = Array.from({length:7}, (_,i)=>{
      const w = i+1
      const row = map.get(w) || { weekday:w, open_min:540, close_min:1080, active: w<=5 ? 1:0 }
      return { weekday:w, open:minToHHMM(row.open_min), close:minToHHMM(row.close_min), active:!!row.active }
    })
    setRows(full)
  }
  async function loadExceptions(){
    const r = await api('/hours/exceptions')
    setExList(r)
  }

  useEffect(()=>{ loadHours(); loadExceptions() },[])

  function updateRow(i, patch){
    setRows(rs => { const copy=[...rs]; copy[i]={...copy[i], ...patch}; return copy })
  }

  async function saveRow(i){
    const r = rows[i]
    await api('/hours', {
      method:'PUT',
      body: JSON.stringify({
        weekday: r.weekday,
        open_min: hhmmToMin(r.open),
        close_min: hhmmToMin(r.close),
        active: r.active
      })
    })
    loadHours()
  }

  async function addException(){
    if (!exDate) return alert('Alege data')
    if (!exClosed && (!exOpen || !exClose)) return alert('Completează orele')
    await api('/hours/exceptions', {
      method:'POST',
      body: JSON.stringify({
        date: exDate,
        closed: exClosed,
        open_min: exClosed ? undefined : hhmmToMin(exOpen),
        close_min: exClosed ? undefined : hhmmToMin(exClose),
        note: exNote || null
      })
    })
    setExDate(''); setExClosed(true); setExOpen('09:00'); setExClose('18:00'); setExNote('')
    loadExceptions()
  }

  async function delException(id){
    await api(`/hours/exceptions/${id}`, { method:'DELETE' })
    loadExceptions()
  }

  return (
    <div className="card" style={{display:'grid', gap:16}}>
      <h2>Program & Excepții</h2>

      {/* Program recurent L–D */}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Zi</th><th>Deschidere</th><th>Închidere</th><th>Activ</th><th></th></tr></thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.weekday}>
                <td>{days[i]}</td>
                <td><input type="time" value={r.open} onChange={e=>updateRow(i,{open:e.target.value})} /></td>
                <td><input type="time" value={r.close} onChange={e=>updateRow(i,{close:e.target.value})} /></td>
                <td style={{textAlign:'center'}}><input type="checkbox" checked={r.active} onChange={e=>updateRow(i,{active:e.target.checked})} /></td>
                <td><button className="primary" onClick={()=>saveRow(i)}>Salvează</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Excepții (zile închise sau program special) */}
      <div className="card" style={{display:'grid', gap:10}}>
        <h3>Excepții pe zile (închis / program special)</h3>

        <div className="grid-2">
          <div style={{display:'grid', gap:8}}>
            <label>Data</label>
            <input type="date" value={exDate} onChange={e=>setExDate(e.target.value)} />
          </div>
          <div style={{display:'grid', gap:8}}>
            <label>Închis toată ziua</label>
            <input type="checkbox" checked={exClosed} onChange={e=>setExClosed(e.target.checked)} />
          </div>
          {!exClosed && (
            <>
              <div style={{display:'grid', gap:8}}>
                <label>Deschidere</label>
                <input type="time" value={exOpen} onChange={e=>setExOpen(e.target.value)} />
              </div>
              <div style={{display:'grid', gap:8}}>
                <label>Închidere</label>
                <input type="time" value={exClose} onChange={e=>setExClose(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <input placeholder="Notă (opțional)" value={exNote} onChange={e=>setExNote(e.target.value)} />
        <div style={{display:'flex', justifyContent:'flex-end'}}>
          <button className="primary" onClick={addException}>Adaugă / Actualizează</button>
        </div>

        <div className="table-wrap" style={{marginTop:8}}>
          <table className="data">
            <thead><tr><th>Data</th><th>Tip</th><th>Program</th><th>Notă</th><th></th></tr></thead>
            <tbody>
              {exList.map(x=>(
                <tr key={x.id}>
                  <td>{x.date}</td>
                  <td>{x.closed ? 'Închis' : 'Program special'}</td>
                  <td>{x.closed ? '—' : `${minToHHMM(x.open_min)}–${minToHHMM(x.close_min)}`}</td>
                  <td>{x.note || '—'}</td>
                  <td><button onClick={()=>delException(x.id)}>Șterge</button></td>
                </tr>
              ))}
              {exList.length===0 && <tr><td colSpan="5" style={{textAlign:'center', color:'var(--muted)'}}>Nu există excepții.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
