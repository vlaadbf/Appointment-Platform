import React, { useEffect, useState } from 'react'
import { api } from '../api'

export default function FieldsAdmin(){
  const [fields,setFields]=useState([])
  const [form,setForm]=useState({
    field_key:'', label:'', type:'text',
    required:false, active:true, show_in_table:true,
    for_booking:false,
    sort_order:0, options:''
  })

  async function load(){
    const rows = await api('/appointment-fields?all=1')
    setFields(rows)
  }
  useEffect(()=>{ load() },[])

  function onChange(k,v){ setForm(f=>({ ...f, [k]:v })) }

  async function create(){
    if(!form.field_key || !form.label) return alert('field_key și label sunt obligatorii')
    let opts = null
    if (form.type==='select' && form.options.trim()) {
      opts = form.options.split(',').map(s=>s.trim()).filter(Boolean)
    }
    await api('/appointment-fields', {
      method:'POST',
      body: JSON.stringify({
        field_key: form.field_key,
        label: form.label,
        type: form.type,
        required: form.required,
        active: form.active,
        show_in_table: form.show_in_table,
        for_booking: form.for_booking,     // <— nou
        sort_order: Number(form.sort_order)||0,
        options: opts
      })
    })
    setForm({
      field_key:'', label:'', type:'text',
      required:false, active:true, show_in_table:true,
      for_booking:false,
      sort_order:0, options:''
    })
    load()
  }

  async function update(id, patch){
    await api(`/appointment-fields/${id}`, { method:'PUT', body: JSON.stringify(patch) })
    load()
  }
  async function del(id){
    if(!confirm('Sigur ștergi câmpul?')) return
    await api(`/appointment-fields/${id}`, { method:'DELETE' })
    load()
  }

  return (
    <div className="card" style={{display:'grid', gap:16}}>
      <h2>Câmpuri programare</h2>

      <div className="card" style={{display:'grid', gap:8}}>
        <h3>Adaugă câmp</h3>
        <div className="grid-2">
          <input placeholder="field_key (unic, ex: vehicle_make)" value={form.field_key} onChange={e=>onChange('field_key',e.target.value)} />
          <input placeholder="Label (ex: Marcă)" value={form.label} onChange={e=>onChange('label',e.target.value)} />
          <select value={form.type} onChange={e=>onChange('type',e.target.value)}>
            <option value="text">text</option>
            <option value="number">number</option>
            <option value="date">date</option>
            <option value="textarea">textarea</option>
            <option value="select">select</option>
          </select>
          <input type="number" placeholder="Ordine" value={form.sort_order} onChange={e=>onChange('sort_order',e.target.value)} />
          <label><input type="checkbox" checked={form.required} onChange={e=>onChange('required',e.target.checked)} /> Obligatoriu</label>
          <label><input type="checkbox" checked={form.active} onChange={e=>onChange('active',e.target.checked)} /> Activ</label>
          <label><input type="checkbox" checked={form.show_in_table} onChange={e=>onChange('show_in_table',e.target.checked)} /> Arată în tabel</label>
          <label><input type="checkbox" checked={form.for_booking} onChange={e=>onChange('for_booking',e.target.checked)} /> Apare la rezervare</label> {/* <— nou */}
        </div>

        {form.type==='select' && (
          <input placeholder="Opțiuni (separate prin virgulă)" value={form.options} onChange={e=>onChange('options',e.target.value)} />
        )}
        <div style={{display:'flex', justifyContent:'flex-end'}}>
          <button className="primary" onClick={create}>Adaugă</button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Key</th><th>Label</th><th>Tip</th>
              <th>Obl.</th><th>Activ</th><th>În tabel</th><th>La rezervare</th>
              <th>Ordine</th><th>Opțiuni</th><th></th>
            </tr>
          </thead>
          <tbody>
            {fields.map(f=>(
              <tr key={f.id}>
                <td>{f.field_key}</td>
                <td>{f.label}</td>
                <td>{f.type}</td>
                <td><input type="checkbox" checked={!!f.required} onChange={e=>update(f.id,{required:e.target.checked})} /></td>
                <td><input type="checkbox" checked={!!f.active} onChange={e=>update(f.id,{active:e.target.checked})} /></td>
                <td><input type="checkbox" checked={!!f.show_in_table} onChange={e=>update(f.id,{show_in_table:e.target.checked})} /></td>
                <td><input type="checkbox" checked={!!f.for_booking} onChange={e=>update(f.id,{for_booking:e.target.checked})} /></td> {/* <— nou */}
                <td><input type="number" value={f.sort_order||0} onChange={e=>update(f.id,{sort_order:Number(e.target.value)||0})} style={{width:80}}/></td>
                <td style={{maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{Array.isArray(f.options)?f.options.join(', '):''}</td>
                <td><button onClick={()=>del(f.id)}>Șterge</button></td>
              </tr>
            ))}
            {fields.length===0 && <tr><td colSpan="10" style={{textAlign:'center', color:'var(--muted)'}}>Nu există câmpuri.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
