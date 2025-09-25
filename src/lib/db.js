// src/lib/db.js
// Universal MySQL pool (Railway DATABASE_URL veya MYSQL* env'leri)
import mysql from "mysql2/promise";

let _pool;

/** mysql://user:pass@host:port/db -> {host,port,user,password,database} */
function parseDatabaseUrl(raw) {
  try {
    if (!raw) return null;
    const u = new URL(raw);
    if (u.protocol !== "mysql:") return null;
    return {
      host: u.hostname,
      port: u.port ? Number(u.port) : 3306,
      user: decodeURIComponent(u.username || ""),
      password: decodeURIComponent(u.password || ""),
      database: (u.pathname || "").replace(/^\//, ""),
    };
  } catch {
    return null;
  }
}

export function getPool() {
  if (_pool) return _pool;

  // 1) DATABASE_URL (Railway)
  const parsed = parseDatabaseUrl(process.env.DATABASE_URL);

  // 2) MYSQL* isimleri (Railway/standart)
  const host =
    process.env.MYSQLHOST ||
    process.env.MYSQL_HOST ||
    parsed?.host;

  const port =
    Number(process.env.MYSQLPORT || process.env.MYSQL_PORT || parsed?.port || 3306);

  const user =
    process.env.MYSQLUSER ||
    process.env.MYSQL_USER ||
    parsed?.user;

  const password =
    process.env.MYSQLPASSWORD ||
    process.env.MYSQL_PASSWORD ||
    parsed?.password;

  const database =
    process.env.MYSQLDATABASE ||
    process.env.MYSQL_DATABASE ||
    parsed?.database;

  if (!host || !user || !database) {
    throw new Error(
      "DB env eksik: DATABASE_URL ya da MYSQLHOST/MYSQLUSER/MYSQLDATABASE sağlayın."
    );
  }

  _pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
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
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const res = await fn(conn);
    await conn.commit();
    return res;
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    conn.release();
  }
}
