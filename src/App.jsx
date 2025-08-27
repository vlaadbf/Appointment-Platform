// App.jsx
import React, { useEffect, useState, useCallback } from 'react'
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { Sun, Moon, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from './auth'

// Pagini
import Login from './pages/Login'
import Book from './pages/Book'
import Appointments from './pages/Appointments'
import EmployeesAdmin from './pages/EmployeesAdmin'
import ServicesAdmin from './pages/ServicesAdmin'
import HoursAdmin from './pages/HoursAdmin'
import FieldsAdmin from './pages/FieldsAdmin'
import Profile from './pages/Profile'
import Notifications from "./components/Notifications";
import Footer from "./components/Footer";
import LoadingPage from './pages/LoadingPage' // ← pagina goală cu animație
import Dashboard from './pages/Dashboard'



function Protected({ children, roles }) {
  const { isLogged, role } = useAuth()
  const location = useLocation()
  if (!isLogged) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(role)) return <Navigate to="/" replace />
  return children
}

function ThemeButton(){
  const [isDark, setIsDark] = useState(() => document.body.classList.contains('dark'))
  useEffect(()=>{
    const saved = localStorage.getItem('theme')
    if (saved === 'dark') { document.body.classList.add('dark'); setIsDark(true) }
  },[])
  return (
    <button className="icon-btn" title="Schimbă tema"
      onClick={()=>{
        const nowDark = document.body.classList.toggle('dark')
        localStorage.setItem('theme', nowDark ? 'dark' : 'light')
        setIsDark(nowDark)
      }}>
      {isDark ? <Sun size={18}/> : <Moon size={18}/> }
    </button>
  )
}

/* ====== CSS minim pentru burger (poți muta în stylesheet) ====== */
const BURGER_CSS = `
.nav{ position:relative }
.nav-left{ display:flex; gap:8px; flex-wrap:wrap }
.nav-right{ display:flex; gap:8px; margin-left:auto; align-items:center }
.nav-mobile-toggle{ display:none }

/* Overlay & Drawer */
.nav-overlay{
  position:fixed; inset:0; background:rgba(0,0,0,.35);
  backdrop-filter: blur(2px);
  border:none; padding:0; margin:0;
  z-index: 999;
}
.nav-drawer{
  position:fixed; top:0; right:0; bottom:0; width:min(88vw, 360px);
  background: var(--card);
  border-left:1px solid var(--border);
  box-shadow: -20px 0 60px rgba(0,0,0,.25);
  transform: translateX(100%);
  transition: transform .22s ease-out;
  z-index: 1000;
  display:flex; flex-direction:column;
}
.nav-drawer.open{ transform: translateX(0) }
.nav-drawer .drawer-head{
  display:flex; align-items:center; justify-content:space-between;
  padding:12px; border-bottom:1px solid var(--border);
}
.nav-drawer .brand{ font-weight:700; letter-spacing:.2px }
.nav-drawer .drawer-content{
  padding:12px; display:grid; gap:6px; align-content:start; overflow:auto;
}
.nav-drawer a{
  padding:10px 12px; border-radius:10px; text-decoration:none; color:var(--text);
}
.nav-drawer a.active, .nav-drawer a:hover{ background:var(--hover) }
.nav-drawer .drawer-sep{ height:1px; background:var(--border); margin:8px 0 }

/* acțiuni în drawer pe un rând */
.nav-drawer .drawer-actions{
  display:flex; gap:10px; align-items:center; justify-content:flex-start;
  padding:8px 0;
}
.nav-drawer .drawer-actions .icon-btn{
  border:1px solid var(--border);
  background:var(--card);
  padding:6px;
  border-radius:10px;
}
.nav-drawer .drawer-actions .logout-btn{
  margin-left:auto;
  padding:8px 12px; border-radius:10px;
}

/* mobil */
@media (max-width:900px){
  .nav-left, .nav-right{ display:none }
  .nav-mobile-toggle{
    display:inline-flex; align-items:center; justify-content:center;
    margin-left:auto;
    border:1px solid var(--border); background:var(--card);
    padding:8px; border-radius:10px;
  }
  .nav-mobile-toggle:hover{ background:var(--hover) }
}
@media (prefers-reduced-motion: reduce){ .nav-drawer{ transition:none } }
.dark .nav-drawer{ background: var(--card); border-color: var(--border) }
`;

function NavBar(){
  const { isLogged, role, logout } = useAuth()
  const [open, setOpen] = useState(false)

  // logout comun (desktop + drawer): mai întâi /loading, apoi /login
  const handleLogout = useCallback(()=>{
    logout()                                // golește auth
    sessionStorage.setItem('postLoginTarget', '/login')  // LoadingPage va citi ținta
    window.location.href = '/loading'        // forțează pagina goală cu animație
  }, [logout])

  // blochează scroll când drawer-ul e deschis
  useEffect(()=>{
    const prev = document.body.style.overflow
    if (open) document.body.style.overflow = 'hidden'
    return ()=>{ document.body.style.overflow = prev }
  },[open])

  // închide la Escape
  const onKey = useCallback((e)=>{ if(e.key === 'Escape') setOpen(false) },[])
  useEffect(()=>{
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  },[onKey])

  if (!isLogged) return null

  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN'
  const isEmployee = role === 'EMPLOYEE'

  return (
    <nav className="navbar nav">
      <style>{BURGER_CSS}</style>

      {/* nav desktop */}
      <div className="nav-left">
        <NavLink to="/" className={({isActive})=>isActive?'active':''}>Acasă</NavLink>
        <NavLink to="/appointments" className={({isActive})=>isActive?'active':''}>Programări</NavLink>
        <NavLink to="hours" className={({isActive})=>isActive?'active':''}>Program & Excepții</NavLink>

        {isEmployee && (
          <>
            <NavLink to="/programare" className={({isActive})=>isActive?'active':''}>Adaugă</NavLink>
            <NavLink to="/profile" className={({isActive})=>isActive?'active':''}>Profil</NavLink>
          </>
        )}

        {isAdmin && (
          <>
            <NavLink to="/admin/services" className={({isActive})=>isActive?'active':''}>Servicii</NavLink>
            <NavLink to="/admin/employees" className={({isActive})=>isActive?'active':''}>Angajați</NavLink>
            <NavLink to="/admin/fields" className={({isActive})=>isActive?'active':''}>Câmpuri</NavLink>
          </>
        )}
      </div>

      <div className="nav-right">
        <Notifications/>
        <ThemeButton/>
        {/* desktop logout folosește același handler */}
        <button className="logout-btn" onClick={handleLogout}><LogOut size={16}/> Logout</button>
      </div>

      {/* burger (mobil) */}
      <button
        className="nav-mobile-toggle"
        aria-label="Deschide meniul"
        aria-expanded={open}
        aria-controls="nav-drawer"
        onClick={()=>setOpen(true)}
      >
        <Menu size={20}/>
      </button>

      {/* overlay + drawer (mobil) */}
      {open && <button className="nav-overlay" aria-label="Închide meniul" onClick={()=>setOpen(false)} />}

      <aside
        id="nav-drawer"
        className={`nav-drawer ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer-head">
          <span className="brand">Meniu</span>
          <button className="icon-btn" onClick={()=>setOpen(false)} aria-label="Închide"><X size={18}/></button>
        </div>

        <div className="drawer-content">
          <NavLink to="/" onClick={()=>setOpen(false)}>Acasă</NavLink>
          <NavLink to="/appointments" onClick={()=>setOpen(false)}>Programări</NavLink>
          <NavLink to="/hours" onClick={()=>setOpen(false)}>Program & Excepții</NavLink>


          {isEmployee && (
            <>
              <NavLink to="/programare" onClick={()=>setOpen(false)}>Programare</NavLink>
              <NavLink to="/profile" onClick={()=>setOpen(false)}>Profil</NavLink>
            </>
          )}

          {isAdmin && (
            <>
              <NavLink to="/admin/services" onClick={()=>setOpen(false)}>Servicii</NavLink>
              <NavLink to="/admin/employees" onClick={()=>setOpen(false)}>Angajați</NavLink>
              
              <NavLink to="/admin/fields" onClick={()=>setOpen(false)}>Câmpuri</NavLink>
            </>
          )}

          <div className="drawer-sep" />

          <div className="drawer-actions">
            <Notifications/>
            <ThemeButton/>
            {/* logout din drawer folosește același handler */}
            <button className="logout-btn" onClick={() => { setOpen(false); handleLogout(); }}>
              <LogOut size={16}/> Logout
            </button>
          </div>
        </div>
      </aside>
    </nav>
  )
}

export default function App() {
  const { isLogged } = useAuth()

  return (
    <div className="app-shell">
      {/* Meniu doar când ești logat */}
      <NavBar/>
      
      <div className="container">
        <Routes>
          {/* Public */}
          <Route path="/book" element={isLogged ? <Navigate to="/" replace /> : <Book />} />
          <Route path="/login" element={isLogged ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/loading" element={<LoadingPage />} /> {/* ← pagina goală cu animație */}

          {/* Protejate */}
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/appointments" element={<Protected><Appointments /></Protected>} />
          <Route path="/programare" element={<Protected><Book /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="hours" element={<Protected ><HoursAdmin /></Protected>} />


          {/* Admin */}
          <Route path="/admin/services" element={<Protected roles={['ADMIN','SUPER_ADMIN']}><ServicesAdmin /></Protected>} />
          <Route path="/admin/employees" element={<Protected roles={['ADMIN','SUPER_ADMIN']}><EmployeesAdmin /></Protected>} />
          <Route path="/admin/fields" element={<Protected roles={['ADMIN','SUPER_ADMIN']}><FieldsAdmin /></Protected>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to={isLogged?'/':'/login'} replace />} />
        </Routes>
        
      </div>
      <Footer/>
    </div>
    
  )
}
