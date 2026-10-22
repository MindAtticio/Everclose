// GET /api/progress  ->  { raised: number, supporters: number, updated: ISO string }
// The public unlock total, read straight from Stripe so it can never drift from real payments:
// every successful USD charge since the campaign started (one-time gifts and every membership
// payment), minus refunds. Netlify's CDN caches the answer for 60 seconds, so page visits
// don't hit Stripe; at most one request a minute does.
//
// Crypto (NOWPayments) totals are added from the records kept by /api/crypto-ipn. Anything paid
// outside both can still be added by hand with CRYPTO_RAISED (USD) / CRYPTO_SUPPORTERS, then redeploy.
import { stripe, json } from "../lib/stripe.mjs";
import { readTotals } from "../lib/crypto.mjs";

const CAMPAIGN_START = process.env.CAMPAIGN_START || "2026-10-20T00:00:00Z";

export default async () => {
  try {
    let cents = 0;
    const supporters = new Set();
    const since = Math.floor(Date.parse(CAMPAIGN_START) / 1000);
    for await (const ch of stripe.charges.list({ limit: 100, created: { gte: since } })) {
      if (ch.status !== "succeeded" || ch.currency !== "usd") continue;
      const net = ch.amount - ch.amount_refunded;
      if (net <= 0) continue;
      cents += net;
      supporters.add(ch.customer || ch.billing_details?.email?.toLowerCase() || ch.id);
    }
    const crypto = await readTotals();
    const raised = cents / 100 + crypto.raised + (Number(process.env.CRYPTO_RAISED) || 0);
    const count = supporters.size + crypto.supporters + (Number(process.env.CRYPTO_SUPPORTERS) || 0);
    return json(
      200,
      { raised: Math.round(raised * 100) / 100, supporters: count, updated: new Date().toISOString() },
      {
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Netlify-CDN-Cache-Control": "public, durable, s-maxage=60, stale-while-revalidate=300",
      }
    );
  } catch (err) {
    console.error("progress failed:", err?.message);
    return json(502, { error: "progress unavailable" }, { "Cache-Control": "no-store" });
  }
};

export const config = { path: "/api/progress" };
