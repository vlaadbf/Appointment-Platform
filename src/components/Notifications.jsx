import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { io } from 'socket.io-client'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function Notifications(){
  const { isLogged, role } = useAuth()
  const [items,setItems]=useState([])
  const [open,setOpen]=useState(false)
  const socketRef = useRef(null)
  const navigate = useNavigate()
  const isEmployee = role === 'EMPLOYEE'

  // încărcare inițială a notificărilor (doar EMPLOYEE)
  useEffect(()=>{
    if (!isLogged || !isEmployee) { setItems([]); return }
    let alive = true
    ;(async ()=>{
      try {
        const qs = new URLSearchParams({ created_by:'CLIENT', status:'PENDING', limit:'10' })
        const data = await api('/appointments?'+qs.toString())
        const norm = Array.isArray(data) ? data.map(x=>({
          id:x.id, name:x.customer_name, service:x.service_name, start:x.start_time
        })) : []
        if (alive) setItems(norm)
      } catch {}
    })()
    return ()=>{ alive = false }
  },[isLogged, isEmployee])

  // realtime: conectare cu token + subscribe fallback
  useEffect(()=>{
    if (!isLogged || !isEmployee) return
    const token = localStorage.getItem('token') || ''
    const s = io(API, { transports:['websocket'], auth:{ token } })
    socketRef.current = s

    ;(async ()=>{
      try {
        const me = await api('/users/me')
        if (me?.employee_id) s.emit('subscribe-employee', me.employee_id)
      } catch {}
    })()

    s.on('appointment:new', (p)=>{
      setItems(prev => {
        if (prev.some(it => it.id === p.id)) return prev
        const item = { id:p.id, name:p.customer_name, service:p.service_name||'', start:p.start_time }
        return [item, ...prev].slice(0, 15)
      })
    })

    return ()=>{ try { s.disconnect() } catch{} }
  },[isLogged, isEmployee])

  // închidere dropdown la click în afară
  useEffect(()=>{
    const handler = (e)=>{
      const panel = document.getElementById('notif-panel')
      const bell  = document.getElementById('notif-bell')
      if (!panel || !bell) return
      if (!panel.contains(e.target) && !bell.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', handler)
    return ()=>document.removeEventListener('click', handler)
  },[])

  const count = useMemo(()=>items.length, [items])

  function openAppointment(item){
    setItems(prev => prev.filter(x => x.id !== item.id)) // scoatem din listă
    setOpen(false)
    // mergem la pagina programărilor doar cu ID-ul; pagina va încărca programarea din DB
    navigate('/appointments', { state: { openForId: item.id, focusId: item.id } })
  }

  return (
    <>
      <button
        id="notif-bell"
        className="icon-btn"
        title={isEmployee ? 'Notificări' : 'Notificări (doar pentru angajați)'}
        onClick={()=>setOpen(o=>!o)}
        disabled={!isEmployee}
        style={{ opacity: isEmployee ? 1 : 0.6, cursor: isEmployee ? 'pointer' : 'not-allowed' }}
      >
        <Bell size={18}/>
        {count>0 && <span className="notif-badge">{count}</span>}
      </button>

      {open && isEmployee && (
        <div id="notif-panel" className="notif-panel">
          <div className="notif-head">Programări noi</div>
          <ul className="notif-list">
            {items.length===0 && <li className="muted" style={{padding:'10px 12px'}}>Nimic nou</li>}
            {items.map(it=>(
              <li key={it.id} className="notif-item" onClick={()=>openAppointment(it)} role="button">
                <div className="notif-title">{it.name}</div>
                <div className="notif-sub">
                  {(it.service || 'Serviciu')} • {new Date(it.start).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
