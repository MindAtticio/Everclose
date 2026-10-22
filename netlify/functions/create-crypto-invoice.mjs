// POST /api/crypto-invoice  body: { amount: number, name?: string }
// Creates a NOWPayments hosted invoice for a one-time crypto gift and returns { url }.
// The fan picks the coin (BTC, ETH, USDC, SOL, ...) on the NOWPayments page; which coins appear is
// set in the NOWPayments dashboard. When the payment finishes, NOWPayments calls /api/crypto-ipn.
import { randomUUID } from "node:crypto";
import { apiBase, cryptoStore } from "../lib/crypto.mjs";
import { siteUrl, json, ONE_TIME_MIN, ONE_TIME_MAX } from "../lib/stripe.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  if (!process.env.NOWPAYMENTS_API_KEY) return json(503, { error: "Crypto support is coming soon. Card, Apple Pay and Google Pay work now." });

  let order;
  try { order = await req.json(); } catch { return json(400, { error: "Invalid request" }); }
  const usd = Number(order?.amount);
  if (!Number.isFinite(usd) || usd < ONE_TIME_MIN || usd > ONE_TIME_MAX) {
    return json(400, { error: `Please choose an amount between $${ONE_TIME_MIN} and $${ONE_TIME_MAX}.` });
  }
  const creditName = String(order?.name || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);

  const site = siteUrl(req);
  const orderId = `ec-${randomUUID()}`;

  try {
    const res = await fetch(`${apiBase()}/invoice`, {
      method: "POST",
      headers: { "x-api-key": process.env.NOWPAYMENTS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        price_amount: Math.round(usd * 100) / 100,
        price_currency: "usd",
        order_id: orderId,
        order_description: "Support EVERCLOSE (Episode 2 unlock)",
        ipn_callback_url: `${site}/api/crypto-ipn`,
        success_url: `${site}/?thanks=1#unlock`,
        cancel_url: `${site}/#support`,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.invoice_url) {
      console.error("nowpayments invoice failed:", res.status, j?.code || "", j?.message || "");
      return json(502, { error: "Crypto checkout is unavailable right now. Please try again, or pay by card." });
    }

    // Remember the supporter-credits name for this order (NOWPayments has no metadata field).
    try {
      await cryptoStore().setJSON(`orders/${orderId}`, { name: creditName, usd, invoice_id: j.id, created: new Date().toISOString() });
    } catch (err) { console.error("could not save crypto order:", err?.message); }

    return json(200, { url: j.invoice_url });
  } catch (err) {
    console.error("create-crypto-invoice failed:", err?.message);
    return json(502, { error: "Crypto checkout is unavailable right now. Please try again, or pay by card." });
  }
};

export const config = { path: "/api/crypto-invoice" };
