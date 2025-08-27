import express from 'express'
import { query } from '../db.js'
import { requireRole } from '../middleware/roles.js'
import { authRequired, authOptional } from '../middleware/auth.js'

const router = express.Router()

// GET /api/appointment-fields?active=1&for_booking=1   (public pt. BOOK)
// GET /api/appointment-fields?all=1                    (admin)
router.get('/', authOptional, async (req,res)=>{
  try {
    const { active, for_booking } = req.query
    const where = []
    const params = []

    if (active)      where.push('active=1')
    if (for_booking) where.push('for_booking=1')

    let sql = `
      SELECT id, field_key, label, type, options,
             required, active, show_in_table, for_booking, sort_order
      FROM appointment_fields
    `
    if (where.length) sql += ' WHERE ' + where.join(' AND ')
    sql += ' ORDER BY sort_order ASC, id ASC'

    const rows = await query(sql, params)
    rows.forEach(r=>{
      try { r.options = r.options ? JSON.parse(r.options) : [] } catch { r.options = [] }
      // normalize booleans
      r.required     = !!r.required
      r.active       = !!r.active
      r.show_in_table= !!r.show_in_table
      r.for_booking  = !!r.for_booking
    })
    res.json(rows)
  } catch (e) {
    console.error('GET /appointment-fields error:', e)
    res.status(500).json({ error: 'Eroare la listarea câmpurilor' })
  }
})

// POST create
router.post('/', authRequired, requireRole('ADMIN','SUPER_ADMIN'), async (req, res) => {
  try{
    const {
      field_key, label, type='text',
      required=false, options=null,
      active=true, show_in_table=true,
      for_booking=false,
      sort_order=0
    } = req.body

    if (!field_key || !label) {
      return res.status(400).json({ error: 'field_key și label sunt obligatorii' })
    }

    await query(
      `INSERT INTO appointment_fields
       (field_key,label,type,required,options,active,show_in_table,for_booking,sort_order)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        field_key,
        label,
        type,
        required?1:0,
        options ? JSON.stringify(options) : null,
        active?1:0,
        show_in_table?1:0,
        for_booking?1:0,
        sort_order|0
      ]
    )
    res.json({ ok:true })
  }catch(e){
    console.error('POST /appointment-fields error:', e)
    res.status(500).json({ error:'Eroare la creare câmp' })
  }
})

// PUT update (patch)
router.put('/:id', authRequired, requireRole('ADMIN','SUPER_ADMIN'), async (req, res) => {
  try{
    const id = Number(req.params.id)
    const {
      field_key, label, type,
      required, options,
      active, show_in_table,
      for_booking,
      sort_order
    } = req.body

    const sets=[], vals=[]
    const push=(col,val)=>{ sets.push(`${col}=?`); vals.push(val) }

    if (field_key!==undefined)    push('field_key', field_key)
    if (label!==undefined)        push('label', label)
    if (type!==undefined)         push('type', type)
    if (required!==undefined)     push('required', required?1:0)
    if (options!==undefined)      push('options', options?JSON.stringify(options):null)
    if (active!==undefined)       push('active', active?1:0)
    if (show_in_table!==undefined)push('show_in_table', show_in_table?1:0)
    if (for_booking!==undefined)  push('for_booking', for_booking?1:0)
    if (sort_order!==undefined)   push('sort_order', sort_order|0)

    if (!sets.length) return res.json({ ok:true })
    vals.push(id)
    await query(`UPDATE appointment_fields SET ${sets.join(', ')} WHERE id=?`, vals)
    res.json({ ok:true })
  }catch(e){
    console.error('PUT /appointment-fields/:id error:', e)
    res.status(500).json({ error:'Eroare la actualizare câmp' })
  }
})

// DELETE
router.delete('/:id', authRequired, requireRole('ADMIN','SUPER_ADMIN'), async (req, res) => {
  try{
    const id = Number(req.params.id)
    await query('DELETE FROM appointment_fields WHERE id=?', [id])
    res.json({ ok:true })
  }catch(e){
    console.error('DELETE /appointment-fields/:id error:', e)
    res.status(500).json({ error:'Eroare la ștergere câmp' })
  }
})

export default router
