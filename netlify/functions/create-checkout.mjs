// POST /api/checkout  body: { frequency: "once"|"monthly", amount?: number, tierId?: string, name?: string }
// Creates a Stripe-hosted Checkout Session and returns { url }.
// One-time gifts use an inline price for the amount chosen on the site (no pre-created Product).
// Monthly memberships use a Stripe Price lookup key when one exists, otherwise the tier amount
// in TIER_AMOUNTS_USD. Card, Apple Pay, Google Pay and Link are shown by Stripe.
import {
  getStripe, getPrices, TIER_LOOKUP_KEYS, TIER_AMOUNTS_USD, TIER_NAMES,
  ONE_TIME_MIN, ONE_TIME_MAX, siteUrl, json, publicCheckoutError, logStripe, isStripeAuthError,
} from "../lib/stripe.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let order;
  try { order = await req.json(); } catch { return json(400, { error: "Invalid request" }); }
  const { frequency, amount, tierId } = order || {};
  const creditName = String(order?.name || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);

  if (frequency !== "monthly" && frequency !== "once") {
    return json(400, { error: "Unknown payment type" });
  }

  const site = siteUrl(req);
  const metadata = { campaign: "episode2_unlock", credit_name: creditName };

  try {
    const stripe = getStripe();
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
      const line = await monthlyLineItem(tierId);
      if (!line) return json(400, { error: "Unknown membership tier" });
      session = await stripe.checkout.sessions.create({
        ...common,
        mode: "subscription",
        line_items: [{ quantity: 1, ...line }],
        subscription_data: { metadata },
      });
    } else {
      const usd = Number(amount);
      if (!Number.isFinite(usd) || usd < ONE_TIME_MIN || usd > ONE_TIME_MAX) {
        return json(400, { error: `Please choose an amount between $${ONE_TIME_MIN} and $${ONE_TIME_MAX}.` });
      }
      session = await stripe.checkout.sessions.create({
        ...common,
        mode: "payment",
        submit_type: "donate",
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(usd * 100),
            product_data: { name: "Support EVERCLOSE (Episode 2 unlock)" },
          },
        }],
        payment_intent_data: { metadata },
      });
    }

    if (!session?.url) throw new Error("missing_url");
    return json(200, { url: session.url });
  } catch (err) {
    logStripe("create-checkout failed", err);
    const { status, error, code } = publicCheckoutError(err);
    return json(status, { error, code });
  }
};

/** Prefer the Dashboard price. If it is missing or not readable, charge the tier amount. */
async function monthlyLineItem(tierId) {
  const lookup = TIER_LOOKUP_KEYS[tierId];
  const usd = TIER_AMOUNTS_USD[tierId];
  if (!lookup || !usd) return null;
  try {
    const prices = await getPrices();
    if (prices[lookup]?.id) return { price: prices[lookup].id };
  } catch (err) {
    if (isStripeAuthError(err)) throw err;
    logStripe("monthly price lookup skipped", err);
  }
  return {
    price_data: {
      currency: "usd",
      unit_amount: Math.round(usd * 100),
      recurring: { interval: "month" },
      product_data: { name: `EVERCLOSE ${TIER_NAMES[tierId] || tierId} membership` },
    },
  };
}

export const config = { path: "/api/checkout" };
