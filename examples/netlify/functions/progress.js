// EXAMPLE ONLY. Returns the public unlock total: {"raised": 1234.5, "supporters": 42}.
// Simplest reliable approach: sum successful Stripe payments for the campaign, plus a crypto total you
// record from the NOWPayments/Coinbase webhook (stored in Netlify Blobs, Supabase, a KV store, etc.).
// Cache for ~60s so the page polling doesn't hit Stripe on every visit.
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
let cache = { at: 0, body: null };
exports.handler = async () => {
  if (Date.now() - cache.at < 60000 && cache.body) return ok(cache.body);
  let raised = 0, supporters = new Set();
  for await (const ch of stripe.charges.list({ limit: 100, created: { gte: Math.floor(Date.parse("2026-10-20") / 1000) } })) {
    if (ch.paid && !ch.refunded) { raised += (ch.amount - ch.amount_refunded) / 100; supporters.add(ch.billing_details?.email || ch.id); }
  }
  const crypto = { raised: Number(process.env.CRYPTO_RAISED_FALLBACK || 0), supporters: 0 }; // replace with your stored webhook totals
  const body = JSON.stringify({ raised: Math.round((raised + crypto.raised) * 100) / 100, supporters: supporters.size + crypto.supporters });
  cache = { at: Date.now(), body };
  return ok(body);
};
const ok = (body) => ({ statusCode: 200, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" }, body });
