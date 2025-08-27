import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { query } from '../db.js';

const router = express.Router();

/** Listare servicii pentru un angajat */
router.get('/', authRequired, requireRole('SUPER_ADMIN','ADMIN'), async (req, res) => {
  const employee_id = Number(req.query.employee_id);
  if (!employee_id) return res.status(400).json({ error: 'employee_id necesar' });

  const rows = await query(`
    SELECT es.service_id, s.name, s.duration_minutes, s.price_cents
    FROM employee_services es
    JOIN services s ON s.id = es.service_id
    WHERE es.employee_id = ?
    ORDER BY s.name
  `, [employee_id]);

  res.json(rows);
});

/** Adaugă asociere angajat–serviciu */
router.post('/', authRequired, requireRole('SUPER_ADMIN','ADMIN'), async (req, res) => {
  const { employee_id, service_id } = req.body;
  if (!employee_id || !service_id) return res.status(400).json({ error: 'employee_id și service_id necesare' });

  await query(
    'INSERT IGNORE INTO employee_services (employee_id, service_id) VALUES (?,?)',
    [employee_id, service_id]
  );
  res.json({ ok: true });
});

/** Șterge asociere angajat–serviciu */
router.delete('/', authRequired, requireRole('SUPER_ADMIN','ADMIN'), async (req, res) => {
  const employee_id = Number(req.query.employee_id);
  const service_id = Number(req.query.service_id);
  if (!employee_id || !service_id) return res.status(400).json({ error: 'employee_id și service_id necesare' });

  await query('DELETE FROM employee_services WHERE employee_id=? AND service_id=?', [employee_id, service_id]);
  res.json({ ok: true });
});

export default router;
