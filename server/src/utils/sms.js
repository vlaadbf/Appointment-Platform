import twilio from 'twilio';
import { config } from '../config.js';

let client = null;
if (config.sms.enabled && config.sms.accountSid && config.sms.authToken) {
  client = twilio(config.sms.accountSid, config.sms.authToken);
}

export async function sendSMS(to, body) {
  if (!config.sms.enabled) {
    console.log('[SMS simulare]', { to, body });
    return { simulated: true };
  }
  if (!client) {
    console.warn('Twilio neconfigurat. SMS nu a fost trimis.');
    return { error: 'Twilio not configured' };
  }
  try {
    const msg = await client.messages.create({
      from: config.sms.from,
      to,
      body
    });
    return { sid: msg.sid };
  } catch (e) {
    console.error('Eroare Twilio:', e.message);
    return { error: e.message };
  }
}
