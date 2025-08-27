import express from 'express';
import { authRequired } from '../middleware/auth.js';
import { query } from '../db.js';

const router = express.Router();

router.get('/me', authRequired, async (req, res) => {
  const user = await query('SELECT id,name,email,phone,role,created_at FROM users WHERE id=?', [req.user.id]);
  res.json(user[0] || null);
});

export default router;
