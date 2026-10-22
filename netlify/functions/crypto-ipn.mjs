// POST /api/crypto-ipn  (called by NOWPayments, not by the site)
// Verifies the x-nowpayments-sig signature, and when a payment is "finished" records it once in
// Netlify Blobs and refreshes the crypto totals that /api/progress adds to the unlock bar.
// Only "finished" payments count, valued at the USD amount of the invoice. Partial or expired
// payments are acknowledged but not counted (check those in the NOWPayments dashboard).
import { verifyIpn, cryptoStore, recomputeTotals } from "../lib/crypto.mjs";
import { json } from "../lib/stripe.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const raw = await req.text();
  if (!verifyIpn(raw, req.headers.get("x-nowpayments-sig"))) {
    console.error("crypto-ipn: rejected, bad or missing signature");
    return json(401, { error: "invalid signature" });
  }

  const p = JSON.parse(raw);
  const paymentId = String(p.payment_id || "");
  console.log("crypto-ipn:", paymentId, p.payment_status, p.order_id || "");
  if (p.payment_status !== "finished" || !paymentId) return json(200, { ok: true, counted: false });

  const usd = Number(p.price_amount);
  if (String(p.price_currency).toLowerCase() !== "usd" || !(usd > 0)) {
    console.error("crypto-ipn: unexpected amount", p.price_amount, p.price_currency);
    return json(200, { ok: true, counted: false });
  }

  try {
    const store = cryptoStore();
    const key = `payments/${paymentId}`;
    if (!(await store.get(key))) {
      const orderInfo = p.order_id ? await store.get(`orders/${p.order_id}`, { type: "json" }).catch(() => null) : null;
      await store.setJSON(key, {
        usd,
        coin: p.pay_currency || "",
        paid: p.actually_paid ?? null,
        order_id: p.order_id || "",
        credit_name: orderInfo?.name || "",
        at: new Date().toISOString(),
      });
    }
    await recomputeTotals(store);
    return json(200, { ok: true, counted: true });
  } catch (err) {
    console.error("crypto-ipn: could not record payment:", err?.message);
    // A non-2xx answer makes NOWPayments retry the notification later.
    return json(500, { error: "could not record payment" });
  }
};

export const config = { path: "/api/crypto-ipn" };
