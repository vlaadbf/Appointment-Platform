import React, { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth'

const WINDOW_MS = 5000 // splash valid 5s după login

export default function PostLoginSplash() {
  const { isLogged } = useAuth()
  const location = useLocation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    // nu arăta splash pe /login sau dacă nu ești logat
    if (!isLogged) { setShow(false); return }
    if (location.pathname === '/login') { setShow(false); return }

    const ts = Number(sessionStorage.getItem('postLoginSplashAt') || 0)
    const fresh = ts && (Date.now() - ts) <= WINDOW_MS

    if (fresh) {
      setShow(true)
      const t = setTimeout(() => {
        setShow(false)
        sessionStorage.removeItem('postLoginSplashAt')
      }, 2500)
      return () => clearTimeout(t)
    } else {
      // expirată / lipsă -> asigură curățenia
      sessionStorage.removeItem('postLoginSplashAt')
      setShow(false)
    }
  }, [isLogged, location.pathname])

  if (!show) return null

  return (
    <div className="splash-overlay" aria-live="polite" aria-busy="true">
      <div className="splash-spinner" />
      <div className="splash-text">Se încarcă</div>
      <div className="splash-progress"><span /></div>
    </div>
  )
}
