import { cookies } from "next/headers";
import { verifyAuthToken } from "./auth";

export async function getCurrentUser() {
  const c = (await cookies()).get("auth_token");
  if (!c) return null;
  try { return await verifyAuthToken(c.value); } catch { return null; }
}
