// POST /api/checkout  body: { frequency: "once"|"monthly", amount?: number, tierId?: string, name?: string }
// Creates a Stripe-hosted Checkout Session and returns { url } for the page to redirect to.
// One-time gifts use the "Support EVERCLOSE" product with the amount the fan chose on the site;
// monthly memberships use the fixed tier prices. Card, Apple Pay, Google Pay and Link are shown by
// Stripe automatically (managed in Dashboard > Settings > Payment methods).
import { stripe, getPrices, TIER_LOOKUP_KEYS, ONE_TIME_LOOKUP_KEY, ONE_TIME_MIN, ONE_TIME_MAX, siteUrl, json } from "../lib/stripe.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let order;
  try { order = await req.json(); } catch { return json(400, { error: "Invalid request" }); }
  const { frequency, amount, tierId } = order || {};
  // Name for the supporter credits: optional, plain text, short.
  const creditName = String(order?.name || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);

  const site = siteUrl();
  const metadata = { campaign: "episode2_unlock", credit_name: creditName };

  try {
    const prices = await getPrices();
    const common = {
      success_url: `${site}/?thanks=1&session_id={CHECKOUT_SESSION_ID}#unlock`,
      cancel_url: `${site}/#support`,
      metadata,
      // Not VAT registered yet (under the UK threshold). When registered, add the registration in
      // Stripe Tax and switch this to true.
      automatic_tax: { enabled: false },
    };

    let session;
    if (frequency === "monthly") {
      const price = prices[TIER_LOOKUP_KEYS[tierId]];
      if (!price) return json(400, { error: "Unknown membership tier" });
      session = await stripe.checkout.sessions.create({
        ...common,
        mode: "subscription",
        line_items: [{ price: price.id, quantity: 1 }],
        subscription_data: { metadata },
      });
    } else if (frequency === "once") {
      const usd = Number(amount);
      if (!Number.isFinite(usd) || usd < ONE_TIME_MIN || usd > ONE_TIME_MAX) {
        return json(400, { error: `Please choose an amount between $${ONE_TIME_MIN} and $${ONE_TIME_MAX}.` });
      }
      const product = prices[ONE_TIME_LOOKUP_KEY]?.product;
      if (!product) throw new Error(`No active price with lookup key ${ONE_TIME_LOOKUP_KEY}`);
      session = await stripe.checkout.sessions.create({
        ...common,
        mode: "payment",
        submit_type: "donate",
        line_items: [{
          quantity: 1,
          price_data: { currency: "usd", unit_amount: Math.round(usd * 100), product },
        }],
        payment_intent_data: { metadata },
      });
    } else {
      return json(400, { error: "Unknown payment type" });
    }

    return json(200, { url: session.url });
  } catch (err) {
    console.error("create-checkout failed:", err?.type, err?.message);
    // On previews, show the real reason on screen to make testing easier; fans on production see a friendly message.
    const detail = process.env.CONTEXT === "production" ? "" : ` [${err?.type || "Error"}: ${err?.message}]`;
    return json(502, { error: "Checkout is unavailable right now. Please try again in a moment." + detail });
  }
};

export const config = { path: "/api/checkout" };
