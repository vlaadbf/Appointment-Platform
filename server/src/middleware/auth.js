// server/src/middleware/auth.js
import jwt from 'jsonwebtoken'

export function authRequired(req, res, next) {
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
  if (!token) return res.status(401).json({ error: 'Neautentificat' })
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = payload // { id, role, employee_id? }
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Token invalid' })
  }
}

// >>> NOU: permite acces fără token; dacă există token valid, atașează req.user
export function authOptional(req, _res, next) {
  const hdr = req.headers.authorization || ''
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null
  if (!token) return next()
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.user = payload
  } catch (_e) {
    // ignoră token invalid; nu blocăm ruta publică
  }
  next()
}
