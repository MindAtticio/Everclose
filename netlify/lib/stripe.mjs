// Shared Stripe setup for the EVERCLOSE Netlify Functions.
// The secret key lives ONLY in the Netlify environment variable STRIPE_SECRET_KEY.
// Never put the key in the repo, and never send Stripe's error text to the browser
// (it can contain a redacted copy of the key).
import Stripe from "stripe";

export class CheckoutConfigError extends Error {
  constructor(code) {
    super(code);
    this.name = "CheckoutConfigError";
    this.code = code;
  }
}

/** Trim a value pasted into the Netlify UI. Returns "" when the variable is unset. */
export function stripeSecret() {
  const raw = process.env.STRIPE_SECRET_KEY;
  if (typeof raw !== "string") return "";
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

let client = null;
/** Stripe client. Throws CheckoutConfigError when the key is missing or is a publishable key. */
export function getStripe() {
  const key = stripeSecret();
  if (!key) throw new CheckoutConfigError("missing_key");
  if (/^pk_(test|live)_/.test(key)) throw new CheckoutConfigError("publishable_key");
  if (!client) client = new Stripe(key);
  return client;
}

// Monthly tier ids match `tiers` in assets/js/config.js.
// Lookup keys are optional: when a matching Price exists it is used; otherwise the
// function charges the amount below with an inline recurring price.
export const TIER_LOOKUP_KEYS = {
  stray: "everclose_monthly_3",
  bonded: "everclose_monthly_7",
  veluri: "everclose_monthly_20",
};
export const TIER_AMOUNTS_USD = { stray: 3, bonded: 7, veluri: 20 };
export const TIER_NAMES = { stray: "Stray", bonded: "Bonded", veluri: "Veluri" };

// One-time limits in USD; keep in step with minCustom / maxCustom in assets/js/config.js.
export const ONE_TIME_MIN = 2;
export const ONE_TIME_MAX = 5000;

let priceCache = null;
/** Map of lookup_key -> Price. Empty object when Stripe cannot list prices. */
export async function getPrices() {
  if (priceCache) return priceCache;
  const stripe = getStripe();
  const keys = Object.values(TIER_LOOKUP_KEYS);
  const { data } = await stripe.prices.list({ lookup_keys: keys, active: true, limit: 100 });
  priceCache = Object.fromEntries((data || []).filter((p) => p.lookup_key).map((p) => [p.lookup_key, p]));
  return priceCache;
}

/**
 * Where to send the fan back. Prefer the host they actually used (so a published
 * preview still returns to everclose.tv), then the site's canonical URL.
 */
export function siteUrl(req) {
  const explicit = cleanUrl(process.env.SITE_URL);
  if (explicit) return explicit;
  const hostHeader = req?.headers?.get?.("x-forwarded-host") || req?.headers?.get?.("host") || "";
  const host = hostHeader.split(",")[0].trim();
  if (/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host) && !/^(localhost|127\.0\.0\.1)(?::|$)/.test(host)) {
    const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
    if (proto === "https" || proto === "http") return `${proto}://${host}`;
  }
  return cleanUrl(process.env.URL) || "https://everclose.tv";
}

function cleanUrl(value) {
  if (typeof value !== "string") return "";
  const v = value.trim().replace(/\/$/, "");
  return /^https?:\/\//i.test(v) ? v : "";
}

export function isStripeAuthError(err) {
  const type = err?.type || err?.rawType || "";
  return type === "StripeAuthenticationError" || type === "authentication_error";
}

export function isStripePermissionError(err) {
  const type = err?.type || err?.rawType || "";
  const code = err?.code || "";
  return type === "StripePermissionError" || type === "permission_error" || code === "more_permissions_required";
}

/** Log the Stripe failure without the message, which can echo the key. */
export function logStripe(label, err) {
  console.error(label, err?.type || err?.name || "Error", err?.code || "", err?.statusCode || "");
}

/** Fan-facing error. Does not include Stripe's message. */
export function publicCheckoutError(err) {
  if (err instanceof CheckoutConfigError || err?.name === "CheckoutConfigError") {
    if (err.code === "publishable_key") {
      return { status: 503, error: "Checkout is not set up yet. A publishable key was used.", code: "publishable_key" };
    }
    return { status: 503, error: "Checkout is not set up yet.", code: "missing_key" };
  }
  if (isStripeAuthError(err)) {
    return { status: 502, error: "Checkout is unavailable right now. The Stripe key was rejected.", code: "rejected_key" };
  }
  if (isStripePermissionError(err)) {
    return { status: 502, error: "Checkout is unavailable right now. The Stripe key is missing a permission.", code: "missing_permission" };
  }
  return { status: 502, error: "Checkout is unavailable right now. Please try again in a moment.", code: "unavailable" };
}

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
