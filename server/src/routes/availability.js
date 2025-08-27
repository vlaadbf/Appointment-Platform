import express from 'express';
import { query } from '../db.js';

const router = express.Router();

/* Helpers local time */
const dayStartLocal = (dateStr) => new Date(dateStr + 'T00:00:00');
const minutesToLocalDate = (base, minutes) => new Date(base.getTime() + minutes * 60000);
const mapWeekday = (jsDay) => (jsDay === 0 ? 7 : jsDay); // 1=Mon .. 7=Sun

/** Ia programul pentru o zi: întâi EXCEPȚII, apoi fallback la business_hours */
async function getDayHours(dateStr) {
  // excepție?
  const ex = (await query(`SELECT open_min, close_min, closed FROM business_exceptions WHERE date=?`, [dateStr]))[0];
  if (ex) {
    if (ex.closed) return null;                  // închis toată ziua
    return { open_min: ex.open_min, close_min: ex.close_min }; // program special
  }
  // altfel program recurent
  const base = dayStartLocal(dateStr);
  const weekday = mapWeekday(base.getDay());
  const hours = (await query(
    `SELECT open_min, close_min FROM business_hours WHERE weekday=? AND active=1 AND location_id IS NULL`,
    [weekday]
  ))[0];
  return hours || null;
}

/** GET /api/availability?service_id=1&date=YYYY-MM-DD&employee_id=2 */
router.get('/', async (req, res) => {
  try {
    const service_id = Number(req.query.service_id);
    const date = req.query.date;
    const employee_id = req.query.employee_id ? Number(req.query.employee_id) : null;
    if (!service_id || !date) return res.status(400).json({ error: 'service_id și date necesare' });

    const svc = (await query('SELECT duration_minutes FROM services WHERE id=? AND active=1', [service_id]))[0];
    if (!svc) return res.status(404).json({ error: 'Serviciu inexistent sau inactiv' });
    const duration = svc.duration_minutes;

    const hours = await getDayHours(date);
    if (!hours) return res.json(employee_id ? { slots: [] } : { by_employee: [] });
    const { open_min, close_min } = hours;

    // angajați eligibili
    let employees = [];
    if (employee_id) {
      employees = await query(`SELECT e.id, u.name FROM employees e JOIN users u ON u.id=e.user_id WHERE e.id=? AND e.active=1`, [employee_id]);
    } else {
      employees = await query(`
        SELECT e.id, u.name
        FROM employees e JOIN users u ON u.id=e.user_id
        WHERE e.active=1 AND EXISTS (SELECT 1 FROM employee_services es WHERE es.employee_id=e.id AND es.service_id=?)
        ORDER BY u.name`, [service_id]);
    }
    if (!employees.length) return res.json(employee_id ? { slots: [] } : { by_employee: [] });

    // programările existente în acea zi (local)
    const ids = employees.map(e => e.id);
    const placeholders = ids.map(()=>'?').join(',');
    const existing = await query(
      `SELECT employee_id, start_time, end_time
       FROM appointments
       WHERE status='BOOKED' AND DATE(start_time)=? AND employee_id IN (${placeholders})`,
      [date, ...ids]
    );

    const base = dayStartLocal(date);
    const byEmp = [];
    const now = new Date();

    for (const emp of employees) {
      const slots = [];
      for (let m = open_min; m + duration <= close_min; m += duration) {
        const start = minutesToLocalDate(base, m);
        const end = minutesToLocalDate(base, m + duration);

        // NU oferim sloturi din trecut (ex: azi înainte de „acum”)
        if (start < now) continue;

        const conflict = existing.some(ap =>
          ap.employee_id === emp.id && !(end <= ap.start_time || start >= ap.end_time)
        );
        if (!conflict) slots.push({ start, end });
      }
      byEmp.push({ employee_id: emp.id, employee_name: emp.name, slots });
    }

    if (employee_id) return res.json({ slots: byEmp[0]?.slots || [] });
    return res.json({ by_employee: byEmp });
  } catch (e) {
    console.error('GET /availability error:', e);
    res.status(500).json({ error: 'Eroare la calculul disponibilității' });
  }
});

/** GET /api/availability/calendar?service_id=1&year=YYYY&month=MM&employee_id=2 */
router.get('/calendar', async (req, res) => {
  try {
    const service_id = Number(req.query.service_id);
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const employee_id = req.query.employee_id ? Number(req.query.employee_id) : null;

    if (!service_id || !year || !month) return res.status(400).json({ error: 'service_id, year, month necesare' });

    const svc = (await query('SELECT duration_minutes FROM services WHERE id=? AND active=1', [service_id]))[0];
    if (!svc) return res.status(404).json({ error: 'Serviciu inexistent sau inactiv' });
    const duration = svc.duration_minutes;

    // angajați eligibili
    let employees = [];
    if (employee_id) {
      employees = await query('SELECT e.id FROM employees e WHERE e.id=? AND e.active=1', [employee_id]);
    } else {
      employees = await query(`
        SELECT e.id FROM employees e
        WHERE e.active=1 AND EXISTS (SELECT 1 FROM employee_services es WHERE es.employee_id=e.id AND es.service_id=?)
      `, [service_id]);
    }
    if (!employees.length) return res.json([]);

    const totalDays = new Date(year, month, 0).getDate();
    const results = [];

    for (let d = 1; d <= totalDays; d++) {
      const ymd = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const hours = await getDayHours(ymd);
      if (!hours) { results.push({ day: d, available: false }); continue; }

      const { open_min, close_min } = hours;
      const ids = employees.map(e => e.id);
      const placeholders = ids.map(()=>'?').join(',');

      const existing = await query(
        `SELECT employee_id, start_time, end_time
         FROM appointments
         WHERE status='BOOKED' AND DATE(start_time)=? AND employee_id IN (${placeholders})`,
        [ymd, ...ids]
      );

      let dayHasSlot = false;
      outer:
      for (const emp of employees) {
        for (let m = open_min; m + duration <= close_min; m += duration) {
          const start = new Date(year, month - 1, d, 0, 0, 0);
          start.setMinutes(start.getMinutes() + m);
          const end = new Date(start.getTime());
          end.setMinutes(end.getMinutes() + duration);

          if (start < new Date()) continue; // nu marcăm „disponibil” dacă ziua/ora e deja în trecut (ex: azi după program)

          const conflict = existing.some(ap =>
            ap.employee_id === emp.id && !(end <= ap.start_time || start >= ap.end_time)
          );
          if (!conflict) { dayHasSlot = true; break outer; }
        }
      }
      results.push({ day: d, available: dayHasSlot });
    }

    res.json(results);
  } catch (e) {
    console.error('GET /availability/calendar error:', e);
    res.status(500).json({ error: 'Eroare la calendar availability' });
  }
});

export default router;
