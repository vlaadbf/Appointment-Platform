import http from 'http'
import app from './app.js'
import { Server as IOServer } from 'socket.io'
import jwt from 'jsonwebtoken'

const PORT = process.env.PORT || 4000
const server = http.createServer(app)

export const io = new IOServer(server, {
  cors: { origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }
})

io.on('connection', (socket) => {
  // clientul trimite token și cere join în camera angajatului
  socket.on('join', ({ token }) => {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET) // { id, role, employee_id? }
      if (payload?.role === 'EMPLOYEE' && payload?.employee_id) {
        const room = `emp:${payload.employee_id}`
        socket.join(room)
        // (opțional) console.log('joined', room)
      }
    } catch (_e) { /* ignoră token invalid */ }
  })
})

server.listen(PORT, () => {
  console.log(`Server pornit pe http://localhost:${PORT}`)
})
