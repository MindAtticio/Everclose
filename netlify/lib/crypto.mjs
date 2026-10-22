// Shared NOWPayments setup for the EVERCLOSE Netlify Functions.
// Keys live ONLY in Netlify environment variables, never in the site files:
//   NOWPAYMENTS_API_KEY     API key from the NOWPayments dashboard
//   NOWPAYMENTS_IPN_SECRET  IPN secret key from the NOWPayments dashboard (Settings > Payments > IPN)
//   NOWPAYMENTS_SANDBOX     "true" while testing with a sandbox account (account-sandbox.nowpayments.io)
// Finished crypto payments are recorded in Netlify Blobs (store "crypto") so the unlock bar can add them.
import { createHmac, timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";

export const isSandbox = () => String(process.env.NOWPAYMENTS_SANDBOX).toLowerCase() === "true";
export const apiBase = () => (isSandbox() ? "https://api-sandbox.nowpayments.io/v1" : "https://api.nowpayments.io/v1");

export const cryptoStore = () => getStore({ name: "crypto", consistency: "strong" });

/** Recursively sort object keys, the way NOWPayments serialises the IPN body before signing it. */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, k) => { acc[k] = sortKeys(value[k]); return acc; }, {});
  }
  return value;
}

/** True when the x-nowpayments-sig header matches HMAC-SHA512(sorted JSON body, IPN secret). */
export function verifyIpn(rawBody, signature) {
  const secret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!secret || !signature) return false;
  let parsed;
  try { parsed = JSON.parse(rawBody); } catch { return false; }
  const expected = createHmac("sha512", secret).update(JSON.stringify(sortKeys(parsed))).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signature).trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Recompute the crypto totals from the recorded payments and save them as one small record. */
export async function recomputeTotals(store = cryptoStore()) {
  let cents = 0, count = 0;
  const { blobs } = await store.list({ prefix: "payments/" });
  for (const { key } of blobs) {
    const p = await store.get(key, { type: "json" });
    if (p && Number(p.usd) > 0) { cents += Math.round(Number(p.usd) * 100); count += 1; }
  }
  const totals = { raised: cents / 100, supporters: count, updated: new Date().toISOString() };
  await store.setJSON("totals", totals);
  return totals;
}

/** Crypto totals for the unlock bar. Never throws: a crypto problem must not break the Stripe total. */
export async function readTotals() {
  try {
    const t = await cryptoStore().get("totals", { type: "json" });
    return { raised: Number(t?.raised) || 0, supporters: Number(t?.supporters) || 0 };
  } catch (err) {
    console.error("crypto totals unavailable:", err?.message);
    return { raised: 0, supporters: 0 };
  }
}
