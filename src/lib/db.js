// src/lib/db.js
import mysql from "mysql2/promise";

let pool;
export function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    // mysql://USER:PASS@HOST:PORT/DB?connectionLimit=10
    const u = new URL(url);
    pool = mysql.createPool({
      host: u.hostname,
      port: Number(u.port || 3306),
      user: u.username,
      password: u.password,
      database: u.pathname.replace("/", ""),
      connectionLimit: Number(u.searchParams.get("connectionLimit") || "10"),
      timezone: "Z",
      supportBigNumbers: true,
    });
  }
  return pool;
}

export async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}
