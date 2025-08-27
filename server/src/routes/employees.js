import express from 'express';
import bcrypt from 'bcryptjs';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { query } from '../db.js';

const router = express.Router();

/** Listare angajați, opțional filtru după serviciu (PUBLIC pentru Book) */
router.get('/', async (req, res) => {
  const serviceId = req.query.service_id ? Number(req.query.service_id) : null;

  let sql = `
    SELECT e.id, u.name, u.email, u.phone, e.position, e.active, e.location_id
    FROM employees e
    JOIN users u ON u.id=e.user_id
    WHERE e.active=1
  `;
  const params = [];
  if (serviceId) {
    sql += ` AND EXISTS (
      SELECT 1 FROM employee_services es WHERE es.employee_id=e.id AND es.service_id=?
    )`;
    params.push(serviceId);
  }
  sql += ' ORDER BY u.name';
  const rows = await query(sql, params);
  res.json(rows);
});

/** Creează DOAR employee dacă user-ul există */
router.post('/', authRequired, requireRole('SUPER_ADMIN','ADMIN'), async (req, res) => {
  const { user_id, position, location_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id necesar' });
  const r = await query(
    'INSERT INTO employees (user_id,position,location_id,active) VALUES (?,?,?,1)',
    [user_id, position || null, location_id || null]
  );
  res.json({ id: r.insertId });
});

/** Creează user(EMPLOYEE) + employee */
router.post('/create-with-user', authRequired, requireRole('SUPER_ADMIN','ADMIN'), async (req, res) => {
  const { name, email, phone, password, position, location_id } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password necesare' });

  const exists = await query('SELECT id FROM users WHERE email=?', [email]);
  if (exists.length) return res.status(409).json({ error: 'Email deja folosit' });

  const hash = await bcrypt.hash(password, 10);
  const user = await query(
    'INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?,?)',
    [name, email, phone || null, hash, 'EMPLOYEE']
  );
  const user_id = user.insertId;

  const emp = await query(
    'INSERT INTO employees (user_id, position, location_id, active) VALUES (?,?,?,1)',
    [user_id, position || null, location_id || null]
  );

  res.json({ employee_id: emp.insertId, user_id });
});

/** 🔹 Profilul angajatului logat (map user_id -> employees) */
router.get('/me', authRequired, async (req, res) => {
  const rows = await query(`
    SELECT e.id as employee_id, u.name, u.email, u.phone, e.position, e.location_id
    FROM employees e
    JOIN users u ON u.id=e.user_id
    WHERE u.id=? AND e.active=1
    LIMIT 1
  `, [req.user.id]);
  res.json(rows[0] || null);
});

/** 🔹 Serviciile alocate angajatului logat */
router.get('/me/services', authRequired, async (req, res) => {
  const me = await query('SELECT id FROM employees WHERE user_id=? AND active=1 LIMIT 1', [req.user.id]);
  if (!me.length) return res.json([]);
  const employee_id = me[0].id;
  const rows = await query(`
    SELECT s.id, s.name, s.duration_minutes, s.price_cents
    FROM employee_services es
    JOIN services s ON s.id=es.service_id
    WHERE es.employee_id=?
    ORDER BY s.name
  `, [employee_id]);
  res.json(rows);
});

export default router;
