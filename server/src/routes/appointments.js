// server/src/routes/appointments.js
import express from 'express'
import path from 'node:path'
import fs from 'node:fs/promises'
import multer from 'multer'

import { query } from '../db.js'
import { sendSMS } from '../utils/sms.js'
import { io } from '../server.js'

import { authRequired, authOptional } from '../middleware/auth.js'
import { requireRole } from '../middleware/roles.js'
import { DateTime } from 'luxon'

const router = express.Router()
const TZ = 'Europe/Bucharest' // tot ce ține de logică de program se raportează la RO

// ---- Helpers -----------------------------------------------------

async function getEmployeeIdForUser(userId) {
  const r = await query('SELECT id FROM employees WHERE user_id=? LIMIT 1', [userId])
  return r[0]?.id ?? null
}

// Verifică suprapuneri pentru un angajat.
// excludeId: id programare de exclus (la edit)
async function isEmployeeFree(empId, start, end, excludeId = null) {
  const params = [empId, start, end]
  let sql = `
    SELECT id FROM appointments
    WHERE employee_id = ?
      AND status IN ('PENDING','BOOKED','WORKING')
      AND NOT (end_time <= ? OR start_time >= ?)
  `
  if (excludeId) {
    sql += ' AND id <> ?'
    params.push(excludeId)
  }
  // debug
  console.debug('[isEmployeeFree] SQL:', sql.replace(/\s+/g, ' ').trim())
  console.debug('[isEmployeeFree] params:', params)
  const rows = await query(sql, params)
  return rows.length === 0
}

// Salvează câmpurile dinamice trimise în custom_fields (object)
// suprascrie valorile existente (upsert).
async function saveCustomFields(appointmentId, custom) {
  if (!custom || typeof custom !== 'object') return
  const keys = Object.keys(custom)
  if (!keys.length) return

  // asigură-te că field_key există în schema de câmpuri
  const defs = await query(
    'SELECT field_key FROM appointment_fields WHERE active=1'
  )
  const allowed = new Set(defs.map(d => d.field_key))

  for (const k of keys) {
    if (!allowed.has(k)) continue
    const v = custom[k]
    const sql = `
      INSERT INTO appointment_custom_fields (appointment_id, field_key, value)
      VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE value=VALUES(value)
    `
    const params = [appointmentId, k, v == null ? '' : String(v)]
    console.debug('[saveCustomFields] SQL:', sql.replace(/\s+/g, ' ').trim())
    console.debug('[saveCustomFields] params:', params)
    await query(sql, params)
  }
}

// Citește câmpurile dinamice pentru listare
async function loadCustomFields(appointmentIds) {
  if (!appointmentIds.length) return {}
  const placeholders = appointmentIds.map(() => '?').join(',')
  const sql = `
    SELECT appointment_id, field_key, value
    FROM appointment_custom_fields
    WHERE appointment_id IN (${placeholders})
  `
  console.debug('[loadCustomFields] SQL:', sql.replace(/\s+/g, ' ').trim())
  console.debug('[loadCustomFields] params:', appointmentIds)
  const rows = await query(sql, appointmentIds)
  const map = {}
  for (const r of rows) {
    if (!map[r.appointment_id]) map[r.appointment_id] = {}
    map[r.appointment_id][r.field_key] = r.value
  }
  return map
}

// ---- Program (RO) -------------------------------------------------

// ISO weekday (1..7) pentru o dată 'YYYY-MM-DD' în zona RO
function isoWeekdayRO(dateStr) {
  return DateTime.fromISO(dateStr, { zone: TZ }).weekday // 1..7
}

// Dacă în DB weekday e 1..7 (ISO), păstrăm așa:
function mapWeekdayToDb(iso) { return iso } // dacă ai 0..6 (D=0), adaptează aici

// Returnează {closed:true} SAU {closed:false, open_min, close_min, source}
async function resolveDayWindow(dateStr /* 'YYYY-MM-DD' */) {
  // Excepția are prioritate
  const exc = (await query(
    `SELECT open_min, close_min, closed
       FROM business_exceptions
      WHERE date=? LIMIT 1`,
    [dateStr]
  ))[0]

  if (exc) {
    if (exc.closed) return { closed: true, source: 'exception' }
    if (exc.open_min == null || exc.close_min == null) return { closed: true, source: 'exception' }
    return {
      closed: false,
      open_min: Number(exc.open_min),
      close_min: Number(exc.close_min),
      source: 'exception'
    }
  }

  // Program recurent
  const iso = isoWeekdayRO(dateStr)
  const wd  = mapWeekdayToDb(iso)
  const rec = (await query(
    `SELECT open_min, close_min, active
       FROM business_hours
      WHERE location_id IS NULL AND weekday=? LIMIT 1`,
    [wd]
  ))[0]

  if (!rec || !rec.active) return { closed: true, source: 'recurring' }
  if (rec.open_min == null || rec.close_min == null) return { closed: true, source: 'recurring' }

  return {
    closed: false,
    open_min: Number(rec.open_min),
    close_min: Number(rec.close_min),
    source: 'recurring'
  }
}

// ---- Multer pentru poze ------------------------------------------

const disk = multer.diskStorage({
  destination: async (req, file, cb) => {
    const id = req.params.id
    const dir = path.join(process.cwd(), 'uploads', 'appointments', String(id))
    await fs.mkdir(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const ts = Date.now()
    const ext = (file.originalname || '').split('.').pop() || 'jpg'
    cb(null, `${ts}.${ext}`)
  }
})
const upload = multer({ storage: disk })

// ---- Enum helpers -------------------------------------------------

const CREATED_BY_VALUES = new Set(['CLIENT', 'EMPLOYEE', 'ADMIN', 'SUPER_ADMIN'])
// + OVERDUE în enum-ul serverului
const STATUS_VALUES = new Set(['PENDING', 'BOOKED', 'WORKING', 'COMPLETED', 'CANCELLED', 'OVERDUE'])

// ---- OVERDUE helper -----------------------------------------------
// Marchează ca OVERDUE toate programările trecute de start_time (UTC), dacă sunt încă PENDING/BOOKED.
async function markOverdueAppointments() {
  const sql = `
    UPDATE appointments
       SET status='OVERDUE'
     WHERE status IN ('PENDING','BOOKED')
       AND start_time < UTC_TIMESTAMP()
  `
  console.debug('[markOverdueAppointments] running...')
  await query(sql)
}

// rulează și periodic (la 60s) ca fallback
if (!globalThis.__overdueTimer__) {
  globalThis.__overdueTimer__ = setInterval(() => {
    markOverdueAppointments().catch(()=>{})
  }, 60_000)
}

// ---- LISTARE -----------------------------------------------------
// GET /api/appointments
// - angajatul vede DOAR programările lui
// - admin/super_admin văd tot
// - suportă: ?created_by=CLIENT&status=PENDING&limit=10
router.get('/', authRequired, async (req, res) => {
  try {
    // actualizează OVERDUE la fiecare listare
    await markOverdueAppointments()

    const isEmployee = req.user.role === 'EMPLOYEE'
    const created_by_q = req.query.created_by
    const status_q = req.query.status
    const limit_q = req.query.limit

    let sql = `
      SELECT a.*,
             s.name AS service_name,
             u.name AS employee_name
      FROM appointments a
      LEFT JOIN services s ON s.id=a.service_id
      LEFT JOIN employees e ON e.id=a.employee_id
      LEFT JOIN users u ON u.id=e.user_id
    `
    const params = []
    const where = []

    if (isEmployee) {
      const empIdRaw = await getEmployeeIdForUser(req.user.id)
      const safeEmpId = Number.isFinite(Number(empIdRaw)) ? Number(empIdRaw) : -1
      where.push('a.employee_id=?')
      params.push(safeEmpId)
    }

    if (created_by_q) {
      const cb = String(created_by_q).toUpperCase().trim()
      if (CREATED_BY_VALUES.has(cb)) {
        where.push('a.created_by=?')
        params.push(cb)
      }
    }

    if (status_q) {
      const st = String(status_q).toUpperCase().trim()
      if (STATUS_VALUES.has(st)) {
        where.push('a.status=?')
        params.push(st)
      }
    }

    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY a.start_time DESC'

    // limit sigur: între 1 și 500
    const limParsed = Number.parseInt(String(limit_q ?? ''), 10)
    const limit = Number.isFinite(limParsed) && limParsed > 0 ? Math.min(limParsed, 500) : 200
    // IMPORTANT: nu mai folosim placeholder pentru LIMIT
    sql += ` LIMIT ${limit}`

    // debug
    console.debug('[GET /appointments] SQL:', sql.replace(/\s+/g, ' ').trim())
    console.debug('[GET /appointments] params:', params)

    const rows = await query(sql, params)

    // atașează câmpuri dinamice
    const ids = rows.map(r => r.id)
    const cf = await loadCustomFields(ids)
    const out = rows.map(r => ({ ...r, custom_fields: cf[r.id] || {} }))

    res.json(out)
  } catch (e) {
    console.error('GET /appointments error:', e)
    res.status(500).json({ error: 'Eroare la listarea programărilor' })
  }
})

// ---- GET BY ID ----------------------------------------------------
// GET /api/appointments/:id  (util pt. focus mode / deschidere directă)
router.get('/:id', authRequired, async (req, res) => {
  try {
    // marchează overdue înainte de a returna
    await markOverdueAppointments()

    const id = Number(req.params.id)
    const sql = `
      SELECT a.*,
             s.name AS service_name,
             u.name AS employee_name
      FROM appointments a
      LEFT JOIN services s ON s.id=a.service_id
      LEFT JOIN employees e ON e.id=a.employee_id
      LEFT JOIN users u ON u.id=e.user_id
      WHERE a.id=?
      LIMIT 1
    `
    const rows = await query(sql, [id])
    if (!rows.length) return res.status(404).json({ error: 'Programare inexistentă' })

    const cf = await loadCustomFields([id])
    const custom_fields = cf[id] || {}
    res.json({ ...rows[0], custom_fields })
  } catch (e) {
    console.error('GET /appointments/:id error:', e)
    res.status(500).json({ error: 'Eroare la citirea programării' })
  }
})

// ---- CREARE (public + intern) -----------------------------------
// - dacă employee_id lipsește: auto-assign
// - validează for_booking=1 (required)
// - status inițial: PENDING (client) / BOOKED (intern)
// - emite realtime DOAR către emp:<employee_id>
router.post('/', authOptional, async (req, res) => {
  try {
    const {
      customer_name, customer_phone, customer_email,
      service_id, employee_id, start_time_utc, notes,
      custom_fields
    } = req.body

    if (!customer_name || !customer_phone || !service_id || !start_time_utc) {
      return res.status(400).json({ error: 'Câmpuri necesare lipsă' })
    }

    const svc = (await query(
      'SELECT id, name, duration_minutes FROM services WHERE id=? AND active=1',
      [service_id]
    ))[0]
    if (!svc) return res.status(404).json({ error: 'Serviciu inexistent' })

    const start = new Date(start_time_utc)
    if (isNaN(start.getTime())) return res.status(400).json({ error: 'Dată/oră invalidă' })
    if (start < new Date()) return res.status(400).json({ error: 'Nu poți crea programări în trecut' })
    const end = new Date(start.getTime() + svc.duration_minutes * 60000)

    // === VALIDARE program (RO): zi închisă / în afara intervalului ===
    const startRO = DateTime.fromJSDate(start, { zone: 'utc' }).setZone(TZ)
    const dayStr  = startRO.toFormat('yyyy-LL-dd')
    const minutesRO = startRO.hour * 60 + startRO.minute
    const dayInfo = await resolveDayWindow(dayStr)
    if (dayInfo.closed) {
      return res.status(409).json({ error: 'Unitatea este închisă în această zi.' })
    }
    if (minutesRO < dayInfo.open_min || minutesRO >= dayInfo.close_min) {
      return res.status(409).json({ error: 'Ora selectată este în afara programului.' })
    }

    // cine a creat + status inițial
    const created_by =
      req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN' ? 'ADMIN' :
      req.user?.role === 'EMPLOYEE' ? 'EMPLOYEE' : 'CLIENT'
    const initialStatus = created_by === 'CLIENT' ? 'PENDING' : 'BOOKED'

    // VALIDARE câmpuri dinamice for_booking
    const defs = await query(
      `SELECT field_key, label, required
       FROM appointment_fields
       WHERE active=1 AND for_booking=1
       ORDER BY sort_order ASC, id ASC`
    )
    if (defs.length) {
      const cf = (custom_fields && typeof custom_fields === 'object') ? custom_fields : {}
      const missing = []
      for (const d of defs) {
        if (d.required) {
          const v = (cf[d.field_key] ?? '').toString().trim()
          if (!v) missing.push(d.label)
        }
      }
      if (missing.length) {
        return res.status(400).json({
          error: 'Te rugăm să completezi toate câmpurile obligatorii.',
          missing
        })
      }
    }

    // alegerea / validarea angajatului
    let chosenEmpId = employee_id || null

    async function canDoService(empId) {
      const r = await query(
        `SELECT 1 FROM employee_services WHERE employee_id=? AND service_id=? LIMIT 1`,
        [empId, service_id]
      )
      return r.length > 0
    }

    if (!chosenEmpId) {
      // primul angajat activ care poate și e liber
      const emps = await query(
        `SELECT e.id
         FROM employees e
         WHERE e.active=1 AND EXISTS (
           SELECT 1 FROM employee_services es
           WHERE es.employee_id=e.id AND es.service_id=?
         )
         ORDER BY e.id`,
        [service_id]
      )
      for (const e of emps) {
        if (await isEmployeeFree(e.id, start, end)) { chosenEmpId = e.id; break }
      }
      if (!chosenEmpId) return res.status(409).json({ error: 'Niciun angajat disponibil pentru acest interval' })
    } else {
      if (!(await canDoService(chosenEmpId))) {
        return res.status(400).json({ error: 'Angajatul nu este alocat acestui serviciu' })
      }
      if (!(await isEmployeeFree(chosenEmpId, start, end))) {
        return res.status(409).json({ error: 'Angajatul este ocupat la acea oră' })
      }
    }

    const insertSql = `
      INSERT INTO appointments
       (customer_name, customer_phone, customer_email,
        service_id, employee_id, start_time, end_time, status, notes, created_by)
       VALUES (?,?,?,?,?,?,?, ?, ?, ?)
    `
    const insertParams = [
      customer_name, customer_phone, customer_email || null,
      service_id, chosenEmpId, start, end, initialStatus, notes || null, created_by
    ]
    console.debug('[POST /appointments] SQL:', insertSql.replace(/\s+/g, ' ').trim())
    console.debug('[POST /appointments] params:', insertParams)

    const ins = await query(insertSql, insertParams)
    const newId = ins.insertId

    await saveCustomFields(newId, custom_fields)

    // SMS confirmare (non-blocant)
    try {
      const when = start.toISOString().slice(0,16).replace('T',' ')
      await sendSMS(customer_phone, `Salut ${customer_name}, programarea ta a fost înregistrată pentru ${when}.`)
    } catch(_) {}

    // Realtime doar către angajatul vizat
    io.to(`emp:${chosenEmpId}`).emit('appointment:new', {
      id: newId,
      customer_name,
      customer_phone,
      service_id,
      service_name: svc.name,
      start_time: start
    })

    res.json({
      id: newId,
      start_time: start,
      end_time: end,
      employee_id: chosenEmpId,
      status: initialStatus,
      created_by
    })
  } catch (e) {
    console.error('POST /appointments error:', e)
    res.status(500).json({ error: 'Eroare la crearea programării' })
  }
})

// ---- Lucrează: prima intrare PENDING -> BOOKED --------------------
router.put('/:id/work', authRequired, requireRole('SUPER_ADMIN','ADMIN','EMPLOYEE'), async (req,res)=>{
  try{
    const id = Number(req.params.id)
    // doar angajatul programării sau adminii
    if (req.user.role === 'EMPLOYEE') {
      const empId = await getEmployeeIdForUser(req.user.id)
      const own = await query('SELECT employee_id, status FROM appointments WHERE id=?', [id])
      if (!own.length || own[0].employee_id !== empId) {
        return res.status(403).json({ error: 'Nu poți modifica această programare' })
      }
      if (own[0].status === 'PENDING') {
        await query("UPDATE appointments SET status='BOOKED' WHERE id=?", [id])
      }
    } else {
      // admin poate forța BOOKED dacă era PENDING
      await query("UPDATE appointments SET status=IF(status='PENDING','BOOKED',status) WHERE id=?", [id])
    }
    res.json({ ok:true })
  }catch(e){
    console.error('PUT /appointments/:id/work error:', e)
    res.status(500).json({ error:'Eroare la setarea statusului' })
  }
})

// ---- EDITARE ------------------------------------------------------
router.put('/:id', authRequired, requireRole('SUPER_ADMIN','ADMIN','EMPLOYEE'), async (req, res) => {
  try {
    const id = Number(req.params.id)
    const {
      customer_name, customer_phone, customer_email,
      service_id, employee_id, start_time_utc, status, notes,
      custom_fields
    } = req.body

    if (req.user.role === 'EMPLOYEE') {
      const empId = await getEmployeeIdForUser(req.user.id)
      const rows = await query('SELECT employee_id FROM appointments WHERE id=?', [id])
      if (!rows.length || rows[0].employee_id !== empId) {
        return res.status(403).json({ error: 'Nu poți edita această programare' })
      }
    }

    const prev = (await query('SELECT * FROM appointments WHERE id=?', [id]))[0]
    if (!prev) return res.status(404).json({ error: 'Programare inexistentă' })

    const svcId = service_id ?? prev.service_id
    const svc = (await query('SELECT duration_minutes FROM services WHERE id=?', [svcId]))[0]
    if (!svc) return res.status(400).json({ error: 'Serviciu invalid' })

    const newStart = start_time_utc ? new Date(start_time_utc) : new Date(prev.start_time)
    if (isNaN(newStart.getTime())) return res.status(400).json({ error: 'Dată/oră invalidă' })
    const newEnd = new Date(newStart.getTime() + svc.duration_minutes * 60000)
    const newEmp = employee_id ?? prev.employee_id

    // === VALIDARE program (RO) pe noul start ===
    const newStartRO = DateTime.fromJSDate(newStart, { zone: 'utc' }).setZone(TZ)
    const dayStr = newStartRO.toFormat('yyyy-LL-dd')
    const minutesRO = newStartRO.hour * 60 + newStartRO.minute
    const dayInfo = await resolveDayWindow(dayStr)
    if (dayInfo.closed) {
      return res.status(409).json({ error: 'Unitatea este închisă în această zi.' })
    }
    if (minutesRO < dayInfo.open_min || minutesRO >= dayInfo.close_min) {
      return res.status(409).json({ error: 'Ora selectată este în afara programului.' })
    }

    if (!(await isEmployeeFree(newEmp, newStart, newEnd, id))) {
      return res.status(409).json({ error: 'Angajatul este ocupat la noul interval' })
    }

    const updateSql = `
      UPDATE appointments
      SET customer_name=?, customer_phone=?, customer_email=?,
          service_id=?, employee_id=?, start_time=?, end_time=?,
          status=?, notes=?
      WHERE id=?
    `
    const updateParams = [
      customer_name ?? prev.customer_name,
      customer_phone ?? prev.customer_phone,
      customer_email ?? prev.customer_email,
      svcId, newEmp, newStart, newEnd,
      status ?? prev.status,
      notes ?? prev.notes,
      id
    ]
    console.debug('[PUT /appointments/:id] SQL:', updateSql.replace(/\s+/g, ' ').trim())
    console.debug('[PUT /appointments/:id] params:', updateParams)

    await query(updateSql, updateParams)

    await saveCustomFields(id, custom_fields)

    try {
      const when = newStart.toISOString().slice(0,16).replace('T',' ')
      await sendSMS(customer_phone ?? prev.customer_phone, `Actualizare programare: ${when}.`)
    } catch(_) {}

    res.json({ ok: true })
  } catch (e) {
    console.error('PUT /appointments/:id error:', e)
    res.status(500).json({ error: 'Eroare la actualizarea programării' })
  }
})

// ---- ANULARE ------------------------------------------------------
router.put('/:id/cancel', authRequired, requireRole('SUPER_ADMIN','ADMIN','EMPLOYEE'), async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (req.user.role === 'EMPLOYEE') {
      const empId = await getEmployeeIdForUser(req.user.id)
      const rows = await query('SELECT employee_id, customer_phone, customer_name FROM appointments WHERE id=?', [id])
      if (!rows.length || rows[0].employee_id !== empId) {
        return res.status(403).json({ error: 'Nu poți anula această programare' })
      }
      await query("UPDATE appointments SET status='CANCELLED' WHERE id=?", [id])
      await sendSMS(rows[0].customer_phone, `Salut ${rows[0].customer_name}, programarea ta a fost anulată.`)
      return res.json({ ok: true })
    }

    const rows = await query('SELECT customer_phone, customer_name FROM appointments WHERE id=?', [id])
    await query("UPDATE appointments SET status='CANCELLED' WHERE id=?", [id])
    if (rows[0]) {
      await sendSMS(rows[0].customer_phone, `Salut ${rows[0].customer_name}, programarea ta a fost anulată.`)
    }
    res.json({ ok: true })
  } catch (e) {
    console.error('PUT /appointments/:id/cancel error:', e)
    res.status(500).json({ error: 'Eroare la anulare' })
  }
})

// ---- COMPLETE (validează câmpuri & poze) -------------------------
router.put('/:id/complete', authRequired, requireRole('SUPER_ADMIN','ADMIN','EMPLOYEE'), async (req,res)=>{
  try{
    const id = Number(req.params.id)

    // doar angajatul respectiv sau admin
    if (req.user.role === 'EMPLOYEE') {
      const empId = await getEmployeeIdForUser(req.user.id)
      const own = await query('SELECT employee_id FROM appointments WHERE id=?', [id])
      if (!own.length || own[0].employee_id !== empId) {
        return res.status(403).json({ error: 'Nu poți modifica această programare' })
      }
    }

    // câmpuri dinamice obligatorii globale (active)
    const defs = await query(
      `SELECT field_key, label, required FROM appointment_fields
       WHERE active=1`
    )
    const reqDefs = defs.filter(d => d.required)
    let dynMissing = []
    if (reqDefs.length) {
      const rows = await query(
        `SELECT field_key, value FROM appointment_custom_fields WHERE appointment_id=?`,
        [id]
      )
      const map = {}
      rows.forEach(r => map[r.field_key] = r.value)
      for (const d of reqDefs) {
        const v = (map[d.field_key] ?? '').toString().trim()
        if (!v) dynMissing.push({ key:d.field_key, label:d.label })
      }
    }

    // poze: cere cel puțin 1
    const photos = await query('SELECT id FROM appointment_photos WHERE appointment_id=?', [id])
    const photosMissing = photos.length === 0

    if (dynMissing.length || photosMissing) {
      return res.status(400).json({
        error: 'Validare eșuată.',
        dynMissing,
        photosMissing
      })
    }

    await query("UPDATE appointments SET status='COMPLETED' WHERE id=?", [id])
    res.json({ ok:true })
  }catch(e){
    console.error('PUT /appointments/:id/complete error:', e)
    res.status(500).json({ error:'Eroare la completare' })
  }
})

// ---- POZE --------------------------------------------------------

// Listare poze
router.get('/:id/photos', authRequired, requireRole('SUPER_ADMIN','ADMIN','EMPLOYEE'), async (req,res)=>{
  try{
    const sql = `
      SELECT id, appointment_id, url
      FROM appointment_photos
      WHERE appointment_id=?
      ORDER BY id DESC
    `
    const params = [Number(req.params.id)]
    console.debug('[GET /appointments/:id/photos] SQL:', sql.replace(/\s+/g, ' ').trim())
    console.debug('[GET /appointments/:id/photos] params:', params)
    const rows = await query(sql, params)
    res.json(rows)
  }catch(e){
    console.error('GET /appointments/:id/photos error:', e)
    res.status(500).json({ error:'Eroare la listarea pozelor' })
  }
})

// Upload poze
router.post('/:id/photos', authRequired, requireRole('SUPER_ADMIN','ADMIN','EMPLOYEE'), upload.array('photos', 10), async (req,res)=>{
  try{
    const id = Number(req.params.id)
    const files = req.files || []
    const base = process.env.PUBLIC_BASE_URL || '' // dacă ai reverse proxy
    for (const f of files) {
      const rel = path.join('uploads','appointments', String(id), path.basename(f.path))
      const url = base ? `${base}/${rel.replace(/\\/g,'/')}` : `/${rel.replace(/\\/g,'/')}`
      const sql = `INSERT INTO appointment_photos (appointment_id, url) VALUES (?,?)`
      const params = [id, url]
      console.debug('[POST /appointments/:id/photos] SQL:', sql)
      console.debug('[POST /appointments/:id/photos] params:', params)
      await query(sql, params)
    }
    res.json({ ok:true, count: files.length })
  }catch(e){
    console.error('POST /appointments/:id/photos error:', e)
    res.status(500).json({ error:'Eroare la încărcarea imaginilor' })
  }
})

export default router
