import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LoadingPage() {
  const nav = useNavigate()

  useEffect(() => {
    const target = sessionStorage.getItem('postLoginTarget') || '/'

    const t = setTimeout(() => {
      nav(target, { replace: true })
      sessionStorage.removeItem('postLoginTarget')
    }, 1250)

    return () => clearTimeout(t)
  }, [nav])

  return (
    <div className="splash-overlay">
      <div className="splash-spinner" />
      <div className="splash-text">Se încarcă</div>
      <div className="splash-progress"><span /></div>
    </div>
  )
}
