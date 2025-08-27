import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 4000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'platforma_programari',
  },
  jwtSecret: process.env.JWT_SECRET || 'changeme',
  tz: process.env.TZ || 'Europe/Bucharest',
  sms: {
    enabled: (process.env.SMS_ENABLED ?? 'true') === 'true',
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
  }
};
