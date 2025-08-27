// server/src/routes/dashboard.js
import express from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';

const router = express.Router();

// mic helper pt. a permite bypass la auth doar local (.env AUTH_BYPASS=true)
const maybeAuth = process.env.AUTH_BYPASS === 'true'
  ? (_req, _res, next) => next()
  : authRequired;

const maybeRole = process.env.AUTH_BYPASS === 'true'
  ? (_req, _res, next) => next()
  : requireRole('SUPER_ADMIN','ADMIN','EMPLOYEE');

router.get('/ping', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), authBypass: process.env.AUTH_BYPASS === 'true' });
});

router.get('/appointments', maybeAuth, maybeRole, async (req, res, next) => {
  try {
    const { from, to, employeeId, serviceId, status } = req.query;
    if (!from || !to) return res.status(400).json({ error: '`from` și `to` sunt obligatorii (ISO)' });

    const where = ['a.start_time BETWEEN ? AND ?'];
    const params = [new Date(from), new Date(to)];

    if (employeeId && employeeId !== 'all') { where.push('a.employee_id = ?'); params.push(Number(employeeId)); }
    if (serviceId  && serviceId  !== 'all') { where.push('a.service_id = ?');  params.push(Number(serviceId));  }
    if (status     && status     !== 'all') { where.push('a.status = ?');      params.push(String(status));     }

    const rows = await query(
      `
      SELECT
        a.id,
        a.start_time,
        a.end_time,
        a.status,
        a.customer_name,
        a.customer_phone,
        a.service_id,
        s.name  AS service_name,
        s.duration_minutes AS service_duration_minutes,
        s.price_cents      AS service_price_cents,
        a.employee_id,
        COALESCE(u.name,  CONCAT('Emp ', e.id)) AS employee_name,
        i.total_cents AS invoice_total_cents,
        i.status      AS invoice_status
      FROM appointments a
      LEFT JOIN services   s ON s.id = a.service_id
      LEFT JOIN employees  e ON e.id = a.employee_id
      LEFT JOIN users      u ON u.id = e.user_id
      LEFT JOIN invoices   i ON i.appointment_id = a.id AND i.status IN ('PAID','ISSUED')
      WHERE ${where.join(' AND ')}
      ORDER BY a.start_time ASC
      `,
      params
    );

    res.json(rows);
    // asigură array-ul în răspuns, chiar dacă driverul ți-a întors 1 obiect
 res.json(Array.isArray(rows) ? rows : (rows ? [rows] : []));
  } catch (e) { next(e); }
});

// DEBUG: vezi rapid câte rânduri ai pe interval + 5 mostre brute
router.get('/_debug', maybeAuth, maybeRole, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from/to lipsesc' });

    const [cnt] = await query(
      `SELECT COUNT(*) AS c FROM appointments WHERE start_time BETWEEN ? AND ?`,
      [new Date(from), new Date(to)]
    );
    const [sample] = await query(
      `SELECT id, start_time, end_time, status, service_id, employee_id FROM appointments
       WHERE start_time BETWEEN ? AND ? ORDER BY start_time ASC LIMIT 5`,
      [new Date(from), new Date(to)]
    );

    res.json({
      ok: true,
      count: cnt?.[0]?.c ?? 0,
      sample
    });
  } catch (e) { next(e); }
});

export default router;
