// Lightweight MySQL helper — pure JS (no TypeScript syntax)
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  idleTimeout: 60000,
});

/**
 * Run a SQL query and return rows
 * @param {string} sql
 * @param {any[]=} params
 * @returns {Promise<any[]>}
 */
export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}
