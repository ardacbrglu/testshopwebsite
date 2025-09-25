// src/lib/db.js
// MySQL2 Promise Pool (Railway / .env uyumlu)
import mysql from "mysql2/promise";

let _pool;

export function getPool() {
  if (_pool) return _pool;

  const {
    MYSQLHOST = process.env.MYSQL_HOST,
    MYSQLPORT = process.env.MYSQL_PORT,
    MYSQLUSER = process.env.MYSQL_USER,
    MYSQLPASSWORD = process.env.MYSQL_PASSWORD,
    MYSQLDATABASE = process.env.MYSQL_DATABASE,
  } = process.env;

  if (!MYSQLHOST || !MYSQLUSER || !MYSQLDATABASE) {
    throw new Error("DB env eksik: MYSQLHOST, MYSQLUSER, MYSQLDATABASE gerekli.");
  }

  _pool = mysql.createPool({
    host: MYSQLHOST,
    port: Number(MYSQLPORT || 3306),
    user: MYSQLUSER,
    password: MYSQLPASSWORD,
    database: MYSQLDATABASE,
    connectionLimit: 8,
    namedPlaceholders: false,
    decimalNumbers: false,
  });

  return _pool;
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

export async function withTransaction(fn) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
}
