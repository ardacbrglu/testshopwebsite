// src/lib/db.js
// Robust MySQL helper — handles Railway proxy drops (PROTOCOL_CONNECTION_LOST)
// pure JS (no TypeScript syntax)

import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  // Fail fast: avoids confusing "closed connection" errors later
  throw new Error("DATABASE_URL is missing in environment variables.");
}

/**
 * Create a resilient pool:
 * - enableKeepAlive: helps prevent idle disconnects
 * - connectTimeout: avoids hanging
 * - keepAliveInitialDelay: keep TCP alive
 * - maxIdle/idleTimeout: keep pool lean
 */
const pool = mysql.createPool({
  uri: DATABASE_URL,

  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  queueLimit: 0,

  // Timeouts / keep-alive (important for Railway public proxy)
  connectTimeout: 15000, // 15s
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,

  // mysql2 pool options:
  // maxIdle is supported in mysql2 (limits idle connections kept in pool)
  maxIdle: Number(process.env.DB_POOL_MAX_IDLE || 5),

  // mysql2 v3 uses "idleTimeout" (ms) in pool options; keep your current intent
  idleTimeout: Number(process.env.DB_POOL_IDLE_TIMEOUT || 60000), // 60s
});

// Optional: log connection errors in dev (no secrets)
pool.on?.("connection", (conn) => {
  // Set session settings if needed; safe no-op here
  conn.on?.("error", (err) => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[mysql] connection error:", err?.code || err?.message || err);
    }
  });
});

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Retry only on transient/network errors
function isRetryable(err) {
  const code = err?.code;
  return (
    code === "PROTOCOL_CONNECTION_LOST" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR" ||
    code === "PROTOCOL_ENQUEUE_AFTER_QUIT"
  );
}

/**
 * Run a SQL query and return rows (with small retry on transient disconnects)
 * @param {string} sql
 * @param {any[]=} params
 * @returns {Promise<any[]>}
 */
export async function query(sql, params = []) {
  const maxAttempts = Number(process.env.DB_QUERY_RETRIES || 3);

  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const [rows] = await pool.query(sql, params);
      return rows;
    } catch (err) {
      lastErr = err;

      if (!isRetryable(err) || attempt === maxAttempts) {
        // Re-throw non-retryable or exhausted retries
        throw err;
      }

      // small backoff: 150ms, 300ms, 600ms...
      const backoff = 150 * Math.pow(2, attempt - 1);
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[mysql] transient error (${err?.code}); retrying ${attempt}/${maxAttempts} in ${backoff}ms`
        );
      }
      await sleep(backoff);
    }
  }

  // Should never reach
  throw lastErr || new Error("DB_QUERY_FAILED");
}
