import React, { useEffect, useState } from 'react'
import { api } from '../api'

export default function EmployeesAdmin(){
  const [employees,setEmployees]=useState([])
  const [services,setServices]=useState([])
  const [empServices,setEmpServices]=useState({}) // { [empId]: [services] }

  // form
  const [name,setName]=useState('')
  const [email,setEmail]=useState('')
  const [phone,setPhone]=useState('')
  const [password,setPassword]=useState('ParolaAngajat!123')
  const [position,setPosition]=useState('')

  async function load(){
    const [e,s] = await Promise.all([api('/employees'), api('/services')])
    setEmployees(e); setServices(s)
    // încarcă serviciile pe angajat
    const entries = await Promise.all(e.map(emp => api(`/employee-services?employee_id=${emp.id}`).then(rows => [emp.id, rows])))
    setEmpServices(Object.fromEntries(entries))
  }
  useEffect(()=>{ load() },[])

  async function create(){
    if(!name || !email || !password) return alert('Completează nume, email, parolă')
    await api('/employees/create-with-user', { method:'POST', body: JSON.stringify({ name, email, phone, password, position }) })
    setName(''); setEmail(''); setPhone(''); setPassword('ParolaAngajat!123'); setPosition('')
    load()
  }

  async function addSrv(empId,srvId){ if(!srvId) return; await api('/employee-services',{ method:'POST', body: JSON.stringify({ employee_id:empId, service_id:srvId }) }); load() }
  async function rmSrv(empId,srvId){ await api(`/employee-services?employee_id=${empId}&service_id=${srvId}`, { method:'DELETE' }); load() }

  return (
  <div className="card" style={{display:'grid', gap:16}}>
    <h2>Angajați</h2>

    {/* FORM sus */}
    <div className="card" style={{display:'grid', gap:8}}>
      <h3>Adaugă angajat</h3>
      <div className="grid-2">
        <input placeholder="Nume" value={name} onChange={e=>setName(e.target.value)} />
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input placeholder="Telefon" value={phone} onChange={e=>setPhone(e.target.value)} />
        <input placeholder="Parolă" value={password} onChange={e=>setPassword(e.target.value)} />
      </div>
      <input placeholder="Funcție (opțional)" value={position} onChange={e=>setPosition(e.target.value)} />
      <div style={{display:'flex', justifyContent:'flex-end'}}>
        <button className="primary" onClick={create}>Creează</button>
      </div>
    </div>

    {/* TABEL jos */}
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr><th>Nume</th><th>Email</th><th>Servicii</th><th>Adaugă serviciu</th></tr>
        </thead>
        <tbody>
          {employees.map(e=>{
            const list = empServices[e.id] || []
            return (
              <tr key={e.id}>
                <td>{e.name}<div className="sub">{e.position||''}</div></td>
                <td>{e.email}</td>
                <td>
                  {list.length===0 ? <i>—</i> :
                    list.map(s=>(
                      <span key={s.service_id} className="badge booked" style={{marginRight:6}}>
                        {s.name}
                        <button className="chip-x" onClick={()=>rmSrv(e.id, s.service_id)} title="Elimină">×</button>
                      </span>
                    ))
                  }
                </td>
                <td>
                  <select defaultValue="" onChange={ev=>{ const id=Number(ev.target.value); if(id) addSrv(e.id,id); ev.target.value='' }}>
                    <option value="">Alege…</option>
                    {services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </td>
              </tr>
            )
          })}
          {employees.length===0 && <tr><td colSpan="4" style={{textAlign:'center', color:'var(--muted)'}}>Niciun angajat.</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
)

}
