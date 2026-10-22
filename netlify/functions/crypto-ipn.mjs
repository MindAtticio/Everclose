// POST /api/crypto-ipn  (called by NOWPayments, not by the site)
// Verifies the x-nowpayments-sig signature, then records each "finished" or "partially_paid" payment
// in Netlify Blobs (one record per payment, updated if its status changes) and refreshes the crypto
// totals that /api/progress adds to the unlock bar.
// Every payment is counted at the real USD value that arrived, to the cent: the gift amount scaled by
// how much of the quoted crypto amount actually arrived (crypto rates move between quote and payment,
// so a fan who sends exactly what NOWPayments showed can land a little short or over). No rounding up,
// so the bar never runs ahead of the money received. The gift amount is kept on the record too.
import { verifyIpn, cryptoStore, recomputeTotals } from "../lib/crypto.mjs";
import { json } from "../lib/stripe.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const raw = await req.text();
  console.log("crypto-ipn: notice received,", raw.length, "bytes");
  const check = verifyIpn(raw, req.headers.get("x-nowpayments-sig"));
  if (!check.ok) {
    console.error("crypto-ipn: rejected:", check.reason);
    return json(401, { error: "invalid signature" });
  }

  const p = JSON.parse(raw);
  const paymentId = String(p.payment_id || "");
  console.log("crypto-ipn: signature ok (" + check.reason + "):", paymentId, p.payment_status,
    "price", p.price_amount, p.price_currency, "quoted", p.pay_amount, "paid", p.actually_paid, p.pay_currency);
  const COUNTED = ["finished", "partially_paid"];
  if (!COUNTED.includes(p.payment_status) || !paymentId) return json(200, { ok: true, counted: false });

  const usd = countedUsd(p);
  if (!(usd > 0)) {
    console.error("crypto-ipn: nothing to count", p.price_amount, p.price_currency, p.pay_amount, p.actually_paid);
    return json(200, { ok: true, counted: false });
  }

  try {
    const store = cryptoStore();
    const key = `payments/${paymentId}`;
    // One record per payment: a repeat notification overwrites it instead of counting twice,
    // and a partial payment that is later topped up to "finished" is updated to the full amount.
    const existing = await store.get(key, { type: "json" }).catch(() => null);
    if (existing?.status === "finished" && p.payment_status !== "finished") {
      return json(200, { ok: true, counted: true }); // late, out-of-order notice: keep the finished record
    }
    {
      const orderInfo = p.order_id ? await store.get(`orders/${p.order_id}`, { type: "json" }).catch(() => null) : null;
      await store.setJSON(key, {
        usd,                                  // real value received (what the bar counts)
        gift_usd: Number(p.price_amount) || 0, // the amount the fan chose
        status: p.payment_status,
        coin: p.pay_currency || "",
        paid: p.actually_paid ?? null,
        order_id: p.order_id || "",
        credit_name: orderInfo?.name || "",
        at: new Date().toISOString(),
      });
    }
    const totals = await recomputeTotals(store);
    console.log("crypto-ipn: recorded", paymentId, "usd", usd, "-> crypto total", totals.raised, "from", totals.supporters, "payments");
    return json(200, { ok: true, counted: true });
  } catch (err) {
    console.error("crypto-ipn: could not record payment:", err?.message);
    // A non-2xx answer makes NOWPayments retry the notification later.
    return json(500, { error: "could not record payment" });
  }
};

/** Real USD value received: the gift amount x (crypto that arrived / crypto quoted), to the cent. */
function countedUsd(p) {
  const price = Number(p.price_amount);
  if (String(p.price_currency).toLowerCase() !== "usd" || !(price > 0)) return 0;
  const quoted = Number(p.pay_amount), paid = Number(p.actually_paid);
  if (quoted > 0 && paid > 0) return Math.floor(price * (paid / quoted) * 100) / 100;
  const fiat = Number(p.actually_paid_at_fiat);
  if (fiat > 0) return Math.floor(fiat * 100) / 100;
  return p.payment_status === "finished" ? price : 0; // no amounts in the notice: trust "finished"
}

export const config = { path: "/api/crypto-ipn" };
