import express from 'express';
import { query } from '../db.js';
import { authRequired, authOptional } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { DateTime } from 'luxon';

const router = express.Router();
const TZ = 'Europe/Bucharest';

/** =========================================================
 * Utils pe timp (RO) + rezolvare ferestre zi
 * ======================================================= */

// Calculează ISO weekday (1..7) pentru data dată în RO.
// Exemplu: '2025-08-30' (sâmbătă) -> 6
function isoWeekdayRO(dateStr /* 'YYYY-MM-DD' */) {
  return DateTime.fromISO(dateStr, { zone: TZ }).weekday; // 1..7
}

// Dacă baza ta stochează weekday 0..6 (Duminică=0), decomentează asta:
// function mapWeekdayToDb(isoWeekday /*1..7*/) {
//   // 7 (duminică ISO) -> 0; 1..6 -> 1..6
//   return isoWeekday % 7;
// }
// Altfel, dacă stochezi 1..7 (ISO), folosește direct:
function mapWeekdayToDb(isoWeekday /*1..7*/) {
  return isoWeekday;
}

// întoarce { closed:true } sau { closed:false, open_min, close_min, source:'exception'|'recurring' }
async function resolveDayWindow(dateStr /* 'YYYY-MM-DD' */) {
  // 1) verifică excepție exactă pe dată
  const exc = (await query(
    `SELECT open_min, close_min, closed
       FROM business_exceptions
      WHERE date = ?
      LIMIT 1`,
    [dateStr]
  ))[0];

  if (exc) {
    if (exc.closed) return { closed: true, source: 'exception' };
    if (exc.open_min == null || exc.close_min == null) return { closed: true, source: 'exception' };
    return {
      closed: false,
      open_min: Number(exc.open_min),
      close_min: Number(exc.close_min),
      source: 'exception'
    };
  }

  // 2) altfel, program recurent
  const iso = isoWeekdayRO(dateStr);          // 1..7 în RO
  const wd  = mapWeekdayToDb(iso);            // mapează la formatul din DB
  const rec = (await query(
    `SELECT open_min, close_min, active
       FROM business_hours
      WHERE location_id IS NULL AND weekday = ?
      LIMIT 1`,
    [wd]
  ))[0];

  // fără rând sau inactive -> ÎNCHIS
  if (!rec || !rec.active) return { closed: true, source: 'recurring' };
  if (rec.open_min == null || rec.close_min == null) return { closed: true, source: 'recurring' };

  return {
    closed: false,
    open_min: Number(rec.open_min),
    close_min: Number(rec.close_min),
    source: 'recurring'
  };
}

/** ================= Program recurent (L–D) ================= */

router.get('/', authRequired,  async (_req, res) => {
  const rows = await query(
    `SELECT id, location_id, weekday, open_min, close_min, active
     FROM business_hours
     WHERE location_id IS NULL
     ORDER BY weekday`
  );
  res.json(rows);
});

router.put('/', authRequired, async (req, res) => {
  const { weekday, open_min, close_min, active } = req.body;
  if (weekday===undefined || open_min===undefined || close_min===undefined)
    return res.status(400).json({ error: 'weekday, open_min, close_min necesare' });

  await query(`
    INSERT INTO business_hours (location_id, weekday, open_min, close_min, active)
    VALUES (NULL, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE open_min=VALUES(open_min), close_min=VALUES(close_min), active=VALUES(active)
  `, [weekday, open_min, close_min, active ? 1 : 0]);

  res.json({ ok:true });
});

/** ================= Excepții pe date concrete ================= */

/** Listare excepții (optional: from / to) */
router.get('/exceptions', authRequired,  async (req, res) => {
  const { from, to } = req.query; // YYYY-MM-DD
  let sql = `SELECT id, date, open_min, close_min, closed, note
             FROM business_exceptions`;
  const params = [];
  if (from && to) { sql += ` WHERE date BETWEEN ? AND ?`; params.push(from, to); }
  sql += ` ORDER BY date DESC`;
  const rows = await query(sql, params);
  res.json(rows);
});

// Creează sau actualizează o excepție pentru o dată
router.post('/exceptions', authRequired,  async (req, res) => {
  const { date, open_min, close_min, note } = req.body;

  // normalizează booleanul closed (poate veni ca true/false, "true"/"false", 1/0)
  const closedRaw = req.body.closed;
  const isClosed =
    closedRaw === true || closedRaw === 1 || closedRaw === '1' || closedRaw === 'true';

  if (!date) return res.status(400).json({ error: 'date necesar (YYYY-MM-DD)' });
  if (!isClosed && (open_min === undefined || close_min === undefined)) {
    return res.status(400).json({ error: 'open_min/close_min necesare dacă nu e closed' });
  }

  const openVal  = isClosed ? null : Number(open_min);
  const closeVal = isClosed ? null : Number(close_min);
  const closedVal = isClosed ? 1 : 0;

  await query(
    `INSERT INTO business_exceptions (date, open_min, close_min, closed, note)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       open_min=VALUES(open_min),
       close_min=VALUES(close_min),
       closed=VALUES(closed),
       note=VALUES(note)`,
    // ORDIN CORECT: date, open_min, close_min, closed, note
    [date, openVal, closeVal, closedVal, note || null]
  );

  res.json({ ok: true });
});

/** Șterge o excepție */
router.delete('/exceptions/:id', authRequired, async (req, res) => {
  await query('DELETE FROM business_exceptions WHERE id=?', [req.params.id]);
  res.json({ ok:true });
});

/** ================= Endpoints noi pentru UI (public/employee) ================= */

// 1) Spune dacă o zi este închisă și dacă nu, care e fereastra de lucru (minute din miezul nopții RO)
router.get('/day', authRequired, async (req, res) => {
  try {
    const { date } = req.query; // 'YYYY-MM-DD'
    if (!date) return res.status(400).json({ error: 'Parametru "date" (YYYY-MM-DD) este necesar' });

    const info = await resolveDayWindow(date);
    res.json({ date, ...info });
  } catch (e) {
    console.error('GET /hours/day error', e);
    res.status(500).json({ error: 'Eroare server' });
  }
});

// 2) Interval: întoarce statusul (închis / open_min, close_min) pentru fiecare zi din [from, to]
router.get('/range', authRequired, async (req, res) => {
  try {
    const { from, to } = req.query; // 'YYYY-MM-DD'
    if (!from || !to) return res.status(400).json({ error: 'from și to necesare (YYYY-MM-DD)' });

    const start = DateTime.fromISO(from, { zone: TZ }).startOf('day');
    const end   = DateTime.fromISO(to,   { zone: TZ }).startOf('day');
    if (end < start) return res.status(400).json({ error: 'interval invalid' });

    const results = [];
    for (let d = start; d <= end; d = d.plus({ days: 1 })) {
      const ds = d.toFormat('yyyy-LL-dd');
      const info = await resolveDayWindow(ds);
      results.push({ date: ds, ...info });
    }
    res.json(results);
  } catch (e) {
    console.error('GET /hours/range error', e);
    res.status(500).json({ error: 'Eroare server' });
  }
});

export default router;
