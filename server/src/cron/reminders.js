import cron from 'node-cron';
import { query } from '../db.js';
import { sendSMS } from '../utils/sms.js';
import { config } from '../config.js';

// rulează zilnic la 08:00 Europe/Bucharest
cron.schedule('0 8 * * *', async () => {
  try {
    const rows = await query(
      `SELECT a.id, a.customer_name, a.customer_phone, a.start_time
       FROM appointments a
       WHERE DATE(CONVERT_TZ(a.start_time,'+00:00','+00:00')) = UTC_DATE()
         AND a.status='BOOKED'`
    );
    for (const a of rows) {
      const msg = `Reminder: ai programare azi la ${(new Date(a.start_time)).toISOString().slice(11,16)}.`;
      await sendSMS(a.customer_phone, msg);
      await query('INSERT INTO notifications (appointment_id,type,status,sent_at) VALUES (?,"REMINDER","SENT",NOW())',[a.id]);
    }
    if (rows.length) console.log(`Remindere trimise: ${rows.length}`);
  } catch (e) {
    console.error('Eroare reminder cron:', e.message);
  }
}, { timezone: config.tz });
