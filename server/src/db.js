import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  port: config.db.port,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z', // stocăm în UTC
  dateStrings: false
});

export async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}
