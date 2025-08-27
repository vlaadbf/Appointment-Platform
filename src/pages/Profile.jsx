import React, { useEffect, useState, useMemo } from 'react'

export default function Profile(){
  const [me, setMe] = useState(null)
  const [svc, setSvc] = useState([])
  const [loading, setLoading] = useState(true)

  const API_BASE = useMemo(
    () => (import.meta.env.VITE_API_URL || 'http://localhost:4000'),
    []
  )

  useEffect(()=>{
    async function load(){
      try{
        const headers = { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        const [prof, mysvc] = await Promise.all([
          fetch(`${API_BASE}/api/employees/me`, { headers }).then(r=>r.json()),
          fetch(`${API_BASE}/api/employees/me/services`, { headers }).then(r=>r.json())
        ])
        setMe(prof)
        setSvc(Array.isArray(mysvc) ? mysvc : [])
      } catch(e) {
        // poți adăuga un toast/alert aici dacă vrei
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [API_BASE])

  const initials = (fullName) => {
    if(!fullName) return '?'
    return fullName
      .split(' ')
      .filter(Boolean)
      .slice(0,2)
      .map(p=>p[0]?.toUpperCase())
      .join('')
  }

  return (
    <div className="card profile">
      <h2 className="profile-title">Profil</h2>

      {/* HEADER */}
      {loading ? (
        <div className="profile-header">
          <div className="avatar skeleton" />
          <div className="header-text">
            <div className="skeleton line lg" />
            <div className="skeleton line md" />
          </div>
        </div>
      ) : me ? (
        <div className="profile-header">
          <div className="avatar" aria-hidden="true">{initials(me.name)}</div>
          <div className="header-text">
            <div className="name">{me.name}</div>
            <div className="subtle">{me.position || '—'}</div>
          </div>
        </div>
      ) : (
        <i>Nu am putut încărca profilul.</i>
      )}

      {/* META GRID */}
      {loading ? (
        <div className="meta-grid">
          <div className="meta-item"><div className="label skeleton line sm" /><div className="value skeleton line md" /></div>
          <div className="meta-item"><div className="label skeleton line sm" /><div className="value skeleton line md" /></div>
          <div className="meta-item"><div className="label skeleton line sm" /><div className="value skeleton line md" /></div>
          <div className="meta-item"><div className="label skeleton line sm" /><div className="value skeleton line md" /></div>
        </div>
      ) : me && (
        <div className="meta-grid">
          <div className="meta-item">
            <div className="label">Email</div>
            <div className="value">{me.email}</div>
          </div>
          <div className="meta-item">
            <div className="label">Telefon</div>
            <div className="value">{me.phone || '—'}</div>
          </div>
          <div className="meta-item">
            <div className="label">Funcție</div>
            <div className="value">{me.position || '—'}</div>
          </div>
          <div className="meta-item">
            <div className="label">Status</div>
            <div className="value"><span className="chip chip-ok">Activ</span></div>
          </div>
        </div>
      )}

      {/* SERVICII */}
      <h3 className="section-title">Servicii alocate</h3>
      {loading ? (
        <div className="svc-grid">
          {Array.from({length:3}).map((_,i)=>(
            <div key={i} className="svc-card">
              <div className="skeleton line md" />
              <div className="svc-meta">
                <span className="skeleton chip" />
                <span className="skeleton chip" />
              </div>
            </div>
          ))}
        </div>
      ) : svc.length === 0 ? (
        <i>Fără servicii alocate încă.</i>
      ) : (
        <div className="svc-grid">
          {svc.map(s => (
            <div key={s.id} className="svc-card">
              <div className="svc-name">{s.name}</div>
              <div className="svc-meta">
                <span className="chip">{s.duration_minutes} min</span>
                <span className="chip chip-accent">{(s.price_cents/100).toFixed(2)} RON</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
