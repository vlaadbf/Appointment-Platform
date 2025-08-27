import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';
import { query } from '../db.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

router.post('/', authRequired, requireRole('SUPER_ADMIN','ADMIN','EMPLOYEE'), async (req, res) => {
  const { customer_name, customer_email, customer_phone, items, appointment_id } = req.body;
  if (!customer_name || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Câmpuri lipsă' });
  }

  const total_cents = items.reduce((s, it) => s + Math.round((it.unit_price_cents || 0) * (it.qty || 1)), 0);

  // generate invoice number
  const today = new Date();
  const ymd = today.toISOString().slice(0,10).replace(/-/g,'');
  const serialRow = await query('SELECT COALESCE(MAX(id),0)+1 as nextId FROM invoices');
  const nextId = serialRow[0].nextId;
  const number = `INV-${ymd}-${String(nextId).padStart(4,'0')}`;

  const r = await query(
    'INSERT INTO invoices (number,customer_name,customer_email,customer_phone,appointment_id,total_cents,status) VALUES (?,?,?,?,?,?,?)',
    [number, customer_name, customer_email || null, customer_phone || null, appointment_id || null, total_cents, 'ISSUED']
  );
  const invoiceId = r.insertId;

  for (const it of items) {
    await query('INSERT INTO invoice_items (invoice_id,description,qty,unit_price_cents) VALUES (?,?,?,?)',
      [invoiceId, it.description, it.qty || 1, it.unit_price_cents || 0]);
  }

  // try to render PDF via Python (optional)
  const tmpJson = path.join(process.cwd(), 'tmp', uuidv4() + '.json');
  const outPdf = path.join(process.cwd(), 'tmp', `invoice_${invoiceId}.pdf`);
  const payload = { id: invoiceId, number, customer_name, customer_email, customer_phone, items, total_cents };
  fs.writeFileSync(tmpJson, JSON.stringify(payload, null, 2));

  const pythonPath = path.resolve(process.cwd(), '../python/generate_invoice.py');
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('python3', [pythonPath, '--input', tmpJson, '--output', outPdf]);
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Python exit ' + code))));
    });
    await query('UPDATE invoices SET pdf_path=? WHERE id=?', [outPdf, invoiceId]);
  } catch (e) {
    console.warn('Nu s-a generat PDF-ul (poate lipsește Python sau ReportLab):', e.message);
  } finally {
    try { fs.unlinkSync(tmpJson); } catch {}
  }

  res.json({ id: invoiceId, number, total_cents, pdf: `/api/invoices/${invoiceId}/pdf` });
});

router.get('/:id/pdf', authRequired, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await query('SELECT pdf_path FROM invoices WHERE id=?', [id]);
  if (!rows.length || !rows[0].pdf_path) return res.status(404).json({ error: 'PDF inexistent' });
  res.sendFile(rows[0].pdf_path);
});

export default router;
