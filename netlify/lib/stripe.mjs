// Shared Stripe setup for the EVERCLOSE Netlify Functions.
// The secret key lives ONLY in Netlify's environment variables (STRIPE_SECRET_KEY), never in the site files.
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY is not set in the Netlify environment");
}
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_missing");

// Prices are found by their lookup keys (set up in the EVERCLOSE Stripe account), so amounts can be
// changed in the Stripe Dashboard by moving a lookup key to a new price, with no code change.
// Monthly tier ids match the `tiers` ids in assets/js/config.js.
export const TIER_LOOKUP_KEYS = {
  stray: "everclose_monthly_3",
  bonded: "everclose_monthly_7",
  veluri: "everclose_monthly_20",
};
export const ONE_TIME_LOOKUP_KEY = "everclose_one_time";

// One-time limits in USD; keep in step with minCustom / maxCustom in assets/js/config.js.
export const ONE_TIME_MIN = 2;
export const ONE_TIME_MAX = 5000;

let priceCache = null;
/** Map of lookup_key -> Price, fetched once per warm function instance. */
export async function getPrices() {
  if (priceCache) return priceCache;
  const keys = [...Object.values(TIER_LOOKUP_KEYS), ONE_TIME_LOOKUP_KEY];
  const { data } = await stripe.prices.list({ lookup_keys: keys, active: true, limit: keys.length });
  priceCache = Object.fromEntries(data.map((p) => [p.lookup_key, p]));
  return priceCache;
}

/** Where to send fans back to after Checkout: the site they came from (production or a deploy preview),
 *  but only if it is one of ours; anything else falls back to the main site. */
const ALLOWED_HOSTS = [/^(www\.)?everclose\.tv$/, /(^|--)everclose01\.netlify\.app$/];
export function siteUrl(req) {
  try {
    const { protocol, host } = new URL(req.url);
    if (protocol === "https:" && ALLOWED_HOSTS.some((re) => re.test(host))) return `https://${host}`;
  } catch { /* fall through */ }
  return "https://everclose.tv";
}

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
