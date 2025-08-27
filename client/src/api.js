const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export async function api(path, opts={}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers||{}) }
  const token = localStorage.getItem('token')
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${API}/api${path}`, { ...opts, headers })
  if (!res.ok) throw new Error((await res.json()).error || 'Eroare')
  return res.json()
}
