import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { query } from '../db.js';

const router = express.Router();

/**
 * GET /api/services  (PUBLIC)
 * Lista serviciilor active – necesară pentru pagina publică /book.
 */
router.get('/', async (_req, res) => {
  const rows = await query('SELECT id, name, duration_minutes, price_cents, location_id, active FROM services WHERE active=1 ORDER BY name');
  res.json(rows);
});

/**
 * POST /api/services  (ADMIN/SUPER_ADMIN)
 * Adaugă un serviciu nou.
 */
router.post('/', authRequired, requireRole('SUPER_ADMIN','ADMIN'), async (req, res) => {
  const { name, duration_minutes, price_cents, location_id } = req.body;
  if (!name || !duration_minutes || !price_cents) return res.status(400).json({ error: 'Câmpuri lipsă' });
  const r = await query(
    'INSERT INTO services (name,duration_minutes,price_cents,location_id,active) VALUES (?,?,?,?,1)',
    [name, duration_minutes, price_cents, location_id || null]
  );
  res.json({ id: r.insertId });
});

export default router;
