import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { config } from '../config.js';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roles.js';

const router = express.Router();

// Bootstrap rule: dacă nu există niciun user, poți crea SUPER_ADMIN fără auth
router.post('/register', async (req, res) => {
  const { name, email, phone, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Câmpuri lipsă' });

  const usersCountRows = await query('SELECT COUNT(*) as c FROM users');
  const userCount = usersCountRows[0].c;

  if (userCount > 0 && role === 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Nu poți crea un alt SUPER_ADMIN direct' });
  }

  if (userCount === 0) {
    if (role !== 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'Primul user trebuie să fie SUPER_ADMIN' });
    }
  } else {
    // necesită SUPER_ADMIN pentru a crea ADMIN/EMPLOYEE
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Token lipsă' });
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      if (payload.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Doar SUPER_ADMIN poate crea utilizatori' });
      }
    } catch {
      return res.status(401).json({ error: 'Token invalid' });
    }
  }

  const existing = await query('SELECT id FROM users WHERE email=?', [email]);
  if (existing.length) return res.status(409).json({ error: 'Email deja folosit' });

  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?,?)',
    [name, email, phone || null, hash, role || 'ADMIN']
  );
  res.json({ id: result.insertId, name, email, role: role || 'ADMIN' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email și parolă necesare' });

  const users = await query('SELECT id,name,email,phone,password_hash,role FROM users WHERE email=?', [email]);
  if (!users.length) return res.status(401).json({ error: 'Credențiale greșite' });
  const u = users[0];
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: 'Credențiale greșite' });

  const token = jwt.sign({ id: u.id, role: u.role, name: u.name, email: u.email }, config.jwtSecret, { expiresIn: '7d' });
  res.json({ token, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

router.get('/whoami', authRequired, (req, res) => {
  res.json({ user: req.user });
});

export default router;
