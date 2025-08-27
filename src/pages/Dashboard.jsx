import React, { useEffect, useMemo, useState } from "react";

import { Download, CalendarDays, TrendingUp, Clock, ChevronDown, AlertTriangle, Star } from "lucide-react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import isBetween from "dayjs/plugin/isBetween";
import { api } from '../api';

dayjs.extend(isoWeek);
dayjs.extend(isBetween);

/**
 * Dashboard conectabil la DB — versiunea curată după cerințele tale
 *
 * ✅ Eliminat: top membri pe venit, filtru pe canal, top 3 membri în Deep‑Dive
 * ✅ Doar programările pe 24h (nu 48h)
 * ✅ Export CSV/XLSX
 * ✅ Fallback automat pe mock dacă API-ul nu e încă gata
 *
 * API recomandat (dacă îl ai deja, folosește-l):
 *   GET /api/dashboard/appointments?from=ISO&to=ISO
 * Răspuns așteptat (poate fi un view cu join la services/employees/invoices):
 *   [{ id, start_time, end_time, status, customer_name, customer_phone,
 *      service_id, service_name, service_duration_minutes, service_price_cents,
 *      employee_id, employee_name,
 *      invoice_total_cents, invoice_status }]
 */

// ===== Helpers =====
function downloadBlob(filename, text, type = "text/csv;charset=utf-8;") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
async function exportAppointments() {
  if (!filtered?.length) return;

  // 1) pregătim rândurile (în ordinea dorită a coloanelor)
  const rows = filtered.map(a => ({
    ID: a.id,
    Data: dayjs(a.date).format('DD.MM.YYYY HH:mm'),
    Angajat: a.employeeName || '-',
    Serviciu: a.serviceName || '-',
    Durata_min: a.duration ?? '',
    Pret: a.price ?? '',
    Status: a.status,
    Client: a.client?.name || '',
    Telefon: a.client?.phone || ''
  }));

  // 2) generăm fișierul XLSX (fără fallback CSV)
  const XLSX = (await import('xlsx')).default;

  const headers = ['ID','Data','Angajat','Serviciu','Durata_min','Pret','Status','Client','Telefon'];

  // foaie cu headerul în ordinea dorită
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });

  // opțional: lățimi de coloane (WCH = width characters)
  ws['!cols'] = [
    { wch: 8 },   // ID
    { wch: 18 },  // Data
    { wch: 18 },  // Angajat
    { wch: 20 },  // Serviciu
    { wch: 10 },  // Durata_min
    { wch: 10 },  // Pret
    { wch: 14 },  // Status
    { wch: 22 },  // Client
    { wch: 14 },  // Telefon
  ];

  // opțional: AutoFilter pe header
  const range = XLSX.utils.decode_range(ws['!ref']);
  ws['!autofilter'] = { ref: XLSX.utils.encode_range(range) };

  // 3) carte + scriere
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Programari');

  const fname = `programari_${rangeFromToFile(range)}.xlsx`;
  XLSX.writeFile(wb, fname); // declanșează descărcarea
}

// helper pt nume fișier
function rangeFromToFile(r) {
  try {
    return `${range.from.format('YYYYMMDD')}_${range.to.format('YYYYMMDD')}`;
  } catch {
    return dayjs().format('YYYYMMDD_HHmm');
  }
}
async function tryFetchAppointments(range, { employeeId='all', serviceId='all', status='all' } = {}) {
  const qs = new URLSearchParams({
      from: range.from.toISOString(),
    to: range.to.toISOString(),
    employeeId, serviceId, status
   }).toString();
  return api(`/dashboard/appointments?${qs}`);
 }

function mapApiToModel(rows) {
  if (!Array.isArray(rows)) {
    console.error('mapApiToModel: expected array, got', rows);
    return [];
  }
  return rows.map(r => ({
    id: r.id,
    date: new Date(r.start_time),
    hour: dayjs(r.start_time).hour(),
    employeeId: r.employee_id ?? null,
    employeeName: r.employee_name ?? "-",
    serviceId: r.service_id,
    serviceName: r.service_name,
    duration: r.service_duration_minutes ?? dayjs(r.end_time).diff(dayjs(r.start_time), 'minute'),
    price: (r.service_price_cents ?? 0) / 100,
    status: mapStatus(r.status),
    client: { id: r.customer_phone || r.customer_name, name: r.customer_name, phone: r.customer_phone },
    realized: (r.invoice_status === 'PAID' ? (r.invoice_total_cents ?? 0) / 100 : 0)
  }));
}
function mapStatus(dbStatus) {
  // DB: 'PENDING','BOOKED','WORKING','COMPLETED','CANCELLED','OVERDUE'
  switch (dbStatus) {
    case 'CANCELLED': return 'anulat';
    case 'COMPLETED': return 'finalizat'; // tratăm COMPLETED ca prezentat
    case 'BOOKED': return 'în așteptare';
    case 'WORKING': return 'confirmat';
    case 'OVERDUE': return 'no-show';
    case 'PENDING':
    default: return 'în așteptare';
  }
}


// ====== UI mini-componente ======
function Section({ title, subtitle, right, children }){
  return (
    <section className="card" style={{ padding: 16 }}>
      <header style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
        <div style={{ flex:1 }}>
          <h3 style={{ margin:0 }}>{title}</h3>
          {subtitle && <p style={{ margin:0, opacity:.7 }}>{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function Kpi({ icon:Icon, label, value, hint }){
  return (
    <div className="card" style={{ padding:14, display:'grid', gap:6 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, opacity:.8 }}>
        <Icon size={16}/><span style={{ fontSize:12 }}>{label}</span>
      </div>
      <div style={{ fontWeight:700, fontSize:22 }}>{value}</div>
      {hint && <div style={{ fontSize:12, opacity:.7 }}>{hint}</div>}
    </div>
  );
}

function Chip({ children }){
  return <span style={{ padding:'4px 8px', background:'var(--hover)', border:'1px solid var(--border)', borderRadius:999, fontSize:12 }}>{children}</span>;
}

export default function Dashboard(){
  // ===== Range & filtre =====
  const [period, setPeriod] = useState('month'); // today|week|month|custom
  const [customRange, setCustomRange] = useState({ from:null, to:null });
  const [employee, setEmployee] = useState('all');
  const [service, setService] = useState('all');

  const now = dayjs();
  const range = useMemo(()=>{
    if (period==='today') return { from: now.startOf('day'), to: now.endOf('day') };
    if (period==='week') return { from: now.startOf('week'), to: now.endOf('week') };
    if (period==='month') return { from: now.startOf('month'), to: now.endOf('month') };
    const f = customRange.from ? dayjs(customRange.from) : dayjs().startOf('month');
    const t = customRange.to ? dayjs(customRange.to) : dayjs();
    return { from: f, to: t };
  },[period, customRange, now]);

  // ===== Data state =====
  const [workHours, setWorkHours] = useState([9,10,11,12,13,14,15,16,17]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [errorMsg, setErrorMsg] = useState('');

useEffect(()=> {
  let alive = true;
  (async()=>{
    setLoading(true);
    setErrorMsg('');
    try {
      const apiRows = await tryFetchAppointments(range, { employeeId: employee, serviceId: service, status: 'all' });
      if (!alive) return;
      const rows = mapApiToModel(apiRows);
      setAppointments(rows);
    } catch (e) {
      if (!alive) return;
      console.error('API /dashboard/appointments a eșuat:', e);
      setErrorMsg(e?.message || 'Eroare necunoscută la /dashboard/appointments');
      setAppointments([]); // fără mock
    } finally {
      if (alive) setLoading(false);
    }
  })();
  return()=>{ alive=false };
}, [range.from.valueOf(), range.to.valueOf(), employee, service]);

  // ===== Filtrare locală =====
  const filtered = useMemo(()=>{
    return appointments.filter(a=>{
      if (employee!=="all" && a.employeeId!==Number(employee)) return false;
      if (service!=="all" && a.serviceId!==Number(service)) return false;
      // range deja aplicat la fetch/mock, dar păstrăm safety:
      const d = dayjs(a.date);
      if (!d.isBetween(range.from, range.to, null, '[]')) return false;
      return true;
    });
  },[appointments, employee, service, range]);

  // ===== KPI-uri =====
  const kpiToday = appointments.filter(a=>dayjs(a.date).isSame(now,'day'));
  const kpiWeek = appointments.filter(a=>dayjs(a.date).isSame(now,'week'));
  const kpiMonth = appointments.filter(a=>dayjs(a.date).isSame(now,'month'));

  const occupancyByHourToday = useMemo(()=>{
    const map = Object.fromEntries(workHours.map(h=>[h,0]));
    kpiToday.forEach(a=>{ if (a.status!=="anulat") map[a.hour] = (map[a.hour]||0)+1; });
    return workHours.map(h=>({ hour: `${h}:00`, ocupare: map[h] }));
  },[kpiToday, workHours]);

  const capacityPerHour = 2; // TODO: poți înlocui cu o valoare din settings/locații
  const occupancyRateToday = useMemo(()=>{
    const totalSlots = workHours.length * capacityPerHour;
    const booked = occupancyByHourToday.reduce((s,x)=> s + Math.min(x.ocupare, capacityPerHour), 0);
    return Math.round((booked/totalSlots)*100);
  },[occupancyByHourToday, workHours]);

  const revenueEstimated = filtered.reduce((s,a)=> (a.status!=="anulat" ? s + (a.price||0) : s), 0);
  // Venit realizat: din facturi PAID (dacă le aduci în API); fallback 0
  const revenueRealized = filtered.reduce((s,a)=> s + (a.realized||0), 0);

  // ===== Serii grafice =====
   const seriesDaily = useMemo(()=>{
   // 1) ia din toate programările doar ce pică în intervalul selectat
   const inRange = appointments.filter(a =>
     dayjs(a.date).isBetween(range.from, range.to, null, '[]')
   );

   // 2) pregătește bucket-ele pe zile (ca să nu lipsească zilele fără programări)
   const map = {};
    for (let d = range.from.startOf('day'); d.isBefore(range.to.add(1,'day')); d = d.add(1,'day')) {
     map[d.format('YYYY-MM-DD')] = { date: d, count: 0, venit: 0 };
   }
   
   // 3) agregă
   // 
      inRange.forEach(a => {
  const key = dayjs(a.date).format('YYYY-MM-DD');
     if (!map[key]) map[key] = { date: dayjs(a.date), count: 0, venit: 0 };
    if (a.status !== 'anulat') map[key].count += 1;
    map[key].venit += a.realized || 0;
   });

   const arr = Object.values(map).map(x => ({
      name: x.date.format('DD MMM'),
      Programari: Number(x.count) || 0,
      Venit: Number(x.venit) || 0
    }));

    // 4) dacă toate sunt zero (ex. interval greșit), întoarce array gol ca să afișăm mesaj
    const allZero = arr.every(p => (p.Programari === 0 && p.Venit === 0));
    return allZero ? [] : arr;
  }, [appointments, range]);

  // ===== Alerte =====
  const alertOverCap = useMemo(()=>{
    const byHour = {};
    filtered.forEach(a=>{
      const key = dayjs(a.date).format('YYYY-MM-DD|H');
      byHour[key] = (byHour[key]||0)+1;
    });
    const perDay = {};
    Object.entries(byHour).forEach(([key,val])=>{
      const dayKey = key.split('|')[0];
      perDay[dayKey] = (perDay[dayKey]||0) + Math.min(val, capacityPerHour);
    });
    const maxSlots = workHours.length * capacityPerHour;
    const hit = Object.entries(perDay).find(([day, used]) => used/maxSlots > 0.85);
    return hit ? { day: dayjs(hit[0]).format('DD MMM YYYY'), rate: Math.round((hit[1]/maxSlots)*100) } : null;
  },[filtered, workHours]);

  const freeSlotsTomorrow = useMemo(()=>{
    const tomorrow = now.add(1,'day');
    const apptsT = appointments.filter(a=> dayjs(a.date).isSame(tomorrow,'day') && a.status!=="anulat");
    const byHour = Object.fromEntries(workHours.map(h=>[h,0]));
    apptsT.forEach(a=> byHour[a.hour] = (byHour[a.hour]||0)+1 );
    const slots = workHours.map(h=>({ hour: h, free: Math.max(0, capacityPerHour - (byHour[h]||0)) }));
    const total = slots.reduce((s,x)=> s + x.free, 0);
    return { total, slots };
  },[appointments, workHours, now]);

  // ===== Programări viitoare (doar 24h) =====
  const upcoming24h = useMemo(()=>{
    const start = now;
    const end = now.add(1,'day');
    return appointments
      .filter(a=> dayjs(a.date).isBetween(start, end, null, '[]'))
      .sort((a,b)=> new Date(a.date) - new Date(b.date))
      .slice(0, 50);
  },[appointments, now]);


  // ===== UI =====
  return (
    
    <div style={{ display:'grid', gap:16 }}>
      {errorMsg && (
  <div className="card" style={{ padding:12, borderLeft:'4px solid #e53935', background:'rgba(229,57,53,0.08)' }}>
    <strong>Eroare la încărcare:</strong> <span style={{opacity:.9}}>{String(errorMsg)}</span>
    <div style={{marginTop:6, fontSize:12, opacity:.8}}>
      Verifică Network → <code>/api/dashboard/appointments</code> sau încearcă <code>/api/dashboard/_debug</code>.
    </div>
  </div>
)}
      {/* FILTRE GLOBALE (fără canal) */}
     <Section
  title="Filtre"
  subtitle="Perioadă, angajați, servicii"
  right={
    <button className="icon-btn" onClick={exportAppointments} title="Exportă raport">
      <Download size={16}/> Export
    </button>
  }
>

        <div style={{ display:'flex', gap:20, flexWrap:'wrap', alignItems:'center' }}>
          <label className="filter-label" style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <span>Perioadă</span>
          <select value={period} onChange={e=>setPeriod(e.target.value)}>
            <option value="today">Azi</option>
            <option value="week">Săptămâna aceasta</option>
            <option value="month">Luna aceasta</option>
            <option value="custom">Interval personalizat</option>
          </select>
        </label>

          {period==='custom' && (
            <>
              <label style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:12, opacity:.7 }}>De la</span>
                <input type="date" onChange={e=>setCustomRange(r=>({...r, from: e.target.value}))}/>
              </label>
              <label style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:12, opacity:.7 }}>Până la</span>
                <input type="date" onChange={e=>setCustomRange(r=>({...r, to: e.target.value}))}/>
              </label>
            </>
          )}

          {/* Angajați – derivăm din appointments; dacă vrei listă fixă, fă un GET /api/employees */}
          <label style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:12, opacity:.7 }}>Angajat</span>
       
              <select value={employee} onChange={e=>setEmployee(e.target.value)}>
                <option value="all">Toți</option>
                {Array.from(new Map(appointments.map(a=>[a.employeeId, a.employeeName])).entries())
                  .filter(([id])=>id!=null)
                  .map(([id, name])=> <option key={id} value={id}>{name}</option>)}
              </select>
         
     
          </label>

          <label style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:12, opacity:.7 }}>Serviciu</span>
        
              <select value={service} onChange={e=>setService(e.target.value)}>
                <option value="all">Toate</option>
                {Array.from(new Map(appointments.map(a=>[a.serviceId, a.serviceName])).entries())
                  .map(([id, name])=> <option key={id} value={id}>{name}</option>)}
              </select>
       
          
          </label>

          <div style={{ marginLeft:'auto' }}>
            <Chip>{range.from.format('DD MMM YYYY')} – {range.to.format('DD MMM YYYY')}</Chip>
          </div>
        </div>
      </Section>

      {/* EXECUTIVE OVERVIEW */}
      <Section title="Executive Overview" subtitle="Rezumat pentru management">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12 }}>
          <Kpi icon={CalendarDays} label="Programări azi" value={kpiToday.length} />
          <Kpi icon={CalendarDays} label="Programări săptămâna aceasta" value={kpiWeek.length} />
          <Kpi icon={CalendarDays} label="Programări luna aceasta" value={kpiMonth.length} />
          <Kpi icon={Clock} label="Grad ocupare azi" value={`${occupancyRateToday}%`} />
          <Kpi icon={TrendingUp} label="Venit estimat (filtru)" value={`${revenueEstimated.toLocaleString()} RON`} />
         
      {/*  <Kpi icon={TrendingUp} label="Venit realizat (filtru)" value={`${revenueRealized.toLocaleString()} RON`} />*/}
        </div>


      </Section>

      {/* OPERATIONAL DAILY */}
      <Section title="Operational Daily" subtitle="Focus pe ziua curentă: ocupare pe ore, programări & alerte">


        {/* Programări viitoare (24h) */}
        <div className="card" style={{ padding:12, marginTop:16 }}>
          <h4 style={{ margin:'0 0 8px' }}>Programări următoarele 24h</h4>
          <div className="table" style={{ overflowX:'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Ora</th>
                  <th>Client</th>
                  <th>Serviciu</th>
                  <th>Angajat</th>
                  <th>Status</th>
                  {/*<th>Acțiuni</th>*/}
                </tr>
              </thead>
              <tbody>
                {upcoming24h.map(a=> (
                  <tr key={a.id}>
                    <td>{dayjs(a.date).format('DD MMM YYYY')}</td>
                    <td>{dayjs(a.date).format('HH:mm')}</td>
                    <td>{a.client.name}</td>
                    <td>{a.serviceName}</td>
                    <td>{a.employeeName}</td>
                    <td><span className={`status ${a.status.replace(/\s+/g,'-')}`}>{a.status}</span></td>
                    <td>
                     {/* <div style={{ display:'flex', gap:6 }}>
                         TODO: leagă de acțiunile reale 
                        <button className="icon-btn">Confirmă</button>
                        <button className="icon-btn">Reprogramează</button>
                        <button className="icon-btn">Anulează</button>
                      </div>*/}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

     

      {/* PANOU CLIENȚI FIDELI (rămâne) */}
      <Section title="Clienți fideli" subtitle="Top vizite & ultimele prezențe">
        {/* Derivăm din appointments; pentru acuratețe, recomand un endpoint dedicat */}
        <LoyalClients cardsFromAppointments={appointments} />
      </Section>

      <style>{`
        .select{ position: relative; display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border); background:var(--card); padding:4px 8px; border-radius:10px }
        .select select{ border:none; background:transparent; outline:none }
        .status{ padding:4px 8px; border-radius:999px; font-size:12px; border:1px solid var(--border) }
        .status.confirmat{ background: rgba(0,200,0,.1) }
        .status.in-așteptare{ background: rgba(255,170,0,.12) }
        .status.anulat{ background: rgba(255,0,0,.08) }
        .status.no-show{ background: rgba(120,120,120,.12) }
      `}</style>
    </div>
  );
}

function LoyalClients({ cardsFromAppointments }){
  // Construim rapid top clienți pe baza programărilor CONFIRMAT (COMPLETED/WORKING)
  const map = new Map();
  cardsFromAppointments.forEach(a=>{
    const key = `${a.client.phone || a.client.name}|${a.client.name}`;
    if (!map.has(key)) map.set(key, { id:key, name:a.client.name, visits:0, last:null });
    if (a.status==='confirmat') {
      const obj = map.get(key);
      obj.visits += 1;
      if (!obj.last || dayjs(a.date).isAfter(obj.last)) obj.last = a.date;
    }
  });
  const loyal = Array.from(map.values()).sort((a,b)=> b.visits - a.visits).slice(0,5);

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12 }}>
      {loyal.map(c=> (
        <div key={c.id} className="card" style={{ padding:12, display:'grid', gap:6 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <Star size={16}/><strong>{c.name}</strong>
          </div>
          <div style={{ fontSize:13 }}>Vizite: <b>{c.visits}</b></div>
          <div style={{ fontSize:12, opacity:.8 }}>Ultima vizită: {c.last ? dayjs(c.last).format('DD MMM YYYY') : '-'}</div>

        </div>
      ))}
    </div>
  );
}
