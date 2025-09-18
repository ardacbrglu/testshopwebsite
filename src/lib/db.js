// src/lib/db.js
// Sadece server ortamında kullanılmalı
import mysql from "mysql2/promise.js"; // <-- .js eki kritik olabilir

let pool;

/**
 * DATABASE_URL örn:
 * mysql://root:PASS@caboose.proxy.rlwy.net:19502/railway
 */
export function getPool() {
  if (!pool) {
    const url = new URL(process.env.DATABASE_URL);
    const sslNeeded =
      (process.env.MYSQL_SSL || "").toLowerCase() === "1" ||
      url.hostname.endsWith("railway.app") ||
      url.hostname.includes("aws") ||
      url.hostname.includes("gcp");

    pool = mysql.createPool({
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username || ""),
      password: decodeURIComponent(url.password || ""),
      database: (url.pathname || "").replace(/^\//, ""),
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      decimalNumbers: true,
      timezone: "Z",
      ...(sslNeeded ? { ssl: { rejectUnauthorized: true } } : {}),
    });
  }
  return pool;
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}
