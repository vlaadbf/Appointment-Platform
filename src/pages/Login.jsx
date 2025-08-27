import React, { useState, useMemo } from 'react'
import { api } from '../api'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { User2, LockKeyhole } from 'lucide-react'

/** Creează un overlay global în <body> care rămâne vizibil peste schimbarea de rută */
function showGlobalSplash() {
  // evităm dubluri
  if (document.getElementById('login-global-splash')) return () => {}

  const el = document.createElement('div')
  el.id = 'login-global-splash'
  el.className = 'global-splash-overlay'
  el.innerHTML = `
    <div class="global-splash-spinner"></div>
    <div class="global-splash-text">Se încarcă</div>
    <div class="global-splash-progress"><span></span></div>
  `
  document.body.appendChild(el)

  // blochează scroll
  const prevOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  // funcție de cleanup
  return () => {
    document.body.style.overflow = prevOverflow
    el.classList.add('global-splash-hide') // mic fade-out
    setTimeout(() => {
      el.remove()
    }, 180)
  }
}

export default function Login() {
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [error,setError] = useState('')
  const [submitting,setSubmitting] = useState(false)

  const nav = useNavigate()
  const loc = useLocation()
  const { login } = useAuth()

  const redirectTo = useMemo(
    () => (loc.state?.from?.pathname || '/'),
    [loc.state]
  )

async function onSubmit(e){
  e.preventDefault()
  if (submitting) return
  setError('')
  setSubmitting(true)
  try{
    const r = await api('/auth/login', { method:'POST', body: JSON.stringify({email,password}) })
    login(r.token)

    // salvează unde vrei să ajungi
    sessionStorage.setItem('postLoginTarget', redirectTo)

    // mergi imediat pe pagina goală (loading)
    nav('/loading', { replace:true })
  }catch(err){
    setError(err.message || 'Eroare de autentificare')
    setSubmitting(false)
  }
}

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="avatar">
          <User2 size={32}/>
        </div>
        <h2 style={{ textAlign: 'center' }}>Autentificare</h2>

        <form onSubmit={onSubmit} className="login-form">
          <div className="input-icon">
            <User2 size={16}/>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className="input-icon">
            <LockKeyhole size={16}/>
            <input
              type="password"
              placeholder="Parola"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              disabled={submitting}
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="primary" style={{width:'100%'}} disabled={submitting}>
            {submitting ? 'Se verifică...' : 'Intră'}
          </button>
        </form>
      </div>
    </div>
  )
}
