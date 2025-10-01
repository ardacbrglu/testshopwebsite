export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID().replace(/-/g, "");
  const arr = new Uint8Array(16);
  // @ts-ignore
  (globalThis.crypto || require("node:crypto").webcrypto).getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
