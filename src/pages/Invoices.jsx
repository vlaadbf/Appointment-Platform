import React, { useState } from 'react'
import { api } from '../api'

export default function Invoices(){
  const [customer_name,setCustomerName]=useState('')
  const [customer_phone,setCustomerPhone]=useState('')
  const [desc,setDesc]=useState('Serviciu')
  const [qty,setQty]=useState(1)
  const [price,setPrice]=useState(10000)
  const [created,setCreated]=useState(null)

  async function create(){
    const r = await api('/invoices', {
      method:'POST',
      body: JSON.stringify({
        customer_name, customer_phone,
        items: [{ description: desc, qty: Number(qty), unit_price_cents: Number(price) }]
      })
    })
    setCreated(r)
  }

  return (
    <div>
      <h2>Facturi</h2>
      <div style={{display:'grid', gap:8, maxWidth:400}}>
        <input placeholder="Nume client" value={customer_name} onChange={e=>setCustomerName(e.target.value)} />
        <input placeholder="Telefon" value={customer_phone} onChange={e=>setCustomerPhone(e.target.value)} />
        <input placeholder="Descriere" value={desc} onChange={e=>setDesc(e.target.value)} />
        <input type="number" placeholder="Cantitate" value={qty} onChange={e=>setQty(e.target.value)} />
        <input type="number" placeholder="Preț (bani)" value={price} onChange={e=>setPrice(e.target.value)} />
        <button onClick={create}>Generează</button>
      </div>
      {created && (
        <div style={{marginTop:12}}>
          <div>Factura {created.number} — Total: {(created.total_cents/100).toFixed(2)} RON</div>
          <a href={`${import.meta.env.VITE_API_URL}/api/invoices/${created.id}/pdf`} target="_blank">Descarcă PDF</a>
        </div>
      )}
    </div>
  )
}
