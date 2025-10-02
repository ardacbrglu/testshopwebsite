import { randomBytes } from "crypto";

/** Rastgele 32 hex karakterlik cart id (string) */
export function newId(): string {
  return randomBytes(16).toString("hex");
}
