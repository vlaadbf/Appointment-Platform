import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { Timer, Coins } from 'lucide-react'

export default function Services(){
  const [list,setList]=useState([])
  const [name,setName]=useState('')
  const [duration,setDuration]=useState(30)
  const [price,setPrice]=useState(100)

  async function load(){ setList(await api('/services')) }
  useEffect(()=>{ load() },[])

  async function create(){
    if(!name) return alert('Numele serviciului este obligatoriu')
    await api('/services', { method:'POST', body: JSON.stringify({ name, duration_minutes:Number(duration), price_cents:Number(price)*100 }) })
    setName(''); setDuration(30); setPrice(100)
    load()
  }

  return (
    <div className="card">
      <h2>Servicii</h2>

      <div className="grid-2">
        <div >
          <h3>Adaugă serviciu</h3>
          <div className="input-icon" style={{ margin:'10px 0 0 0' }}><Timer size={16}/><input type="text" placeholder="Nume serviciu" value={name} onChange={e=>setName(e.target.value)} /></div>
          <div className="input-icon" style={{ margin:'10px 0 0 0' }}><Timer size={16}/><input type="number" placeholder="Durată (minute)" value={duration} onChange={e=>setDuration(e.target.value)} /></div>
          <div className="input-icon" style={{ margin:'10px 0 0 0' }}><Coins size={16}/><input type="number" placeholder="Preț (RON)" value={price} onChange={e=>setPrice(e.target.value)} /></div>
          <button className="primary"style={{ margin:'10px 0 0 0' }} onClick={create}>Adaugă</button>
        </div>

        <div>
          <h3>Lista</h3>
          <div className="table-wrap">
            <table className="data" >
              <thead>
                <tr><th>Nume</th><th>Durată</th><th>Preț</th></tr>
              </thead>
              <tbody>
                {list.map(s=>(
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.duration_minutes} min</td>
                    <td>{(s.price_cents/100).toFixed(2)} RON</td>
                  </tr>
                ))}
                {list.length===0 && <tr><td colSpan="3" style={{textAlign:'center', color:'var(--muted)'}}>Niciun serviciu încă.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
