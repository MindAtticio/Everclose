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

/** Constant-time comparison of two hex signatures. */
function sameHex(a, b) {
  const x = Buffer.from(String(a), "utf8"), y = Buffer.from(String(b).trim().toLowerCase(), "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Checks the x-nowpayments-sig header: HMAC-SHA512 of the sorted JSON body, keyed with the IPN secret.
 * NOWPayments' docs build that JSON as JSON.stringify(body, Object.keys(body).sort()), which sorts the
 * top level and (as a side effect of the replacer) drops nested keys; other integrations sort recursively.
 * Both forms need the secret, so either is accepted. Returns { ok, reason } for the log; never the secret.
 */
export function verifyIpn(rawBody, signature) {
  const secret = String(process.env.NOWPAYMENTS_IPN_SECRET || "").trim();
  if (!secret) return { ok: false, reason: "NOWPAYMENTS_IPN_SECRET is not set" };
  if (!signature) return { ok: false, reason: "no x-nowpayments-sig header" };
  let parsed;
  try { parsed = JSON.parse(rawBody); } catch { return { ok: false, reason: "body is not JSON" }; }
  const hmac = (str) => createHmac("sha512", secret).update(str).digest("hex");
  const forms = {
    docs: JSON.stringify(parsed, Object.keys(parsed).sort()),
    recursive: JSON.stringify(sortKeys(parsed)),
  };
  for (const [name, str] of Object.entries(forms)) {
    if (sameHex(hmac(str), signature)) return { ok: true, reason: name };
  }
  return { ok: false, reason: "signature does not match (check NOWPAYMENTS_IPN_SECRET matches the IPN key in NOWPayments)" };
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

/** Keep the last 20 IPN outcomes (no secrets, no personal data) for /api/crypto-status. Never throws. */
export async function logEvent(entry) {
  try {
    const store = cryptoStore();
    const list = (await store.get("events", { type: "json" })) || [];
    list.unshift({ at: new Date().toISOString(), ...entry });
    await store.setJSON("events", list.slice(0, 20));
  } catch { /* diagnostics only */ }
}
