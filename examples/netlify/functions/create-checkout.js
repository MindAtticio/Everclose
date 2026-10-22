// EXAMPLE ONLY (not used in test mode). Netlify Function: creates a Stripe Checkout Session.
// Deploy: move to /netlify/functions/, run `npm i stripe`, set env var STRIPE_SECRET_KEY in Netlify.
// Then set CONFIG.stripe.checkoutEndpoint = "/.netlify/functions/create-checkout".
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const SITE = process.env.SITE_URL || "https://everclose.tv";
// Monthly tiers: create 3 recurring Prices in the Stripe Dashboard and paste their IDs here (or as env vars).
const TIER_PRICES = { stray: process.env.PRICE_STRAY, bonded: process.env.PRICE_BONDED, veluri: process.env.PRICE_VELURI };

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const { frequency, amount, tierId, name } = JSON.parse(event.body || "{}");
  const common = {
    success_url: SITE + "/?thanks=1#unlock",
    cancel_url: SITE + "/#support",
    metadata: { campaign: "chapter2_unlock", credit_name: (name || "").slice(0, 40) },
    automatic_tax: { enabled: false }
  };
  let session;
  if (frequency === "monthly") {
    const price = TIER_PRICES[tierId];
    if (!price) return { statusCode: 400, body: JSON.stringify({ error: "unknown tier" }) };
    session = await stripe.checkout.sessions.create({ ...common, mode: "subscription", line_items: [{ price, quantity: 1 }] });
  } else {
    const cents = Math.round(Number(amount) * 100);
    if (!(cents >= 200 && cents <= 500000)) return { statusCode: 400, body: JSON.stringify({ error: "amount out of range" }) };
    session = await stripe.checkout.sessions.create({
      ...common, mode: "payment", submit_type: "donate",
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name: "Support EVERCLOSE (Chapter 2 unlock)" } } }]
    });
  }
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: session.url }) };
};
