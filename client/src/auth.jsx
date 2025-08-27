import React, { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [user, setUser] = useState(null) // { id, name, email, role } sau null
  const isLogged = !!token
  const role = user?.role || null

  async function loadMe() {
    if (!token) { setUser(null); return }
    try {
      const me = await api('/users/me')
      setUser(me)
    } catch {
      // token invalid
      logout()
    }
  }

  useEffect(()=>{ loadMe() }, [token])

  function login(tokenStr) {
    localStorage.setItem('token', tokenStr)
    setToken(tokenStr)
    window.dispatchEvent(new Event('auth-changed'))
  }

  function logout() {
    localStorage.removeItem('token')
    setToken('')
    setUser(null)
    window.dispatchEvent(new Event('auth-changed'))
  }

  // reîmprospătăm meniul pe eveniment custom (și în alte taburi dacă vrei poți asculta 'storage')
  useEffect(()=>{
    const fn = ()=>{ setToken(localStorage.getItem('token') || ''); }
    window.addEventListener('auth-changed', fn)
    return ()=> window.removeEventListener('auth-changed', fn)
  },[])

  return (
    <AuthCtx.Provider value={{ isLogged, user, role, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth(){ return useContext(AuthCtx) }
