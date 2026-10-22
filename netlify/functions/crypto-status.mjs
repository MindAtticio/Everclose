// GET /api/crypto-status?key=STATUS_KEY  ->  crypto totals and the last 20 NOWPayments notices.
// Private. STATUS_KEY is a Netlify env var. Missing, wrong, or unset returns 404 with no body detail.
// No keys or personal data are stored in the entries (payment id, status, amounts and the outcome only).
import { createHash, timingSafeEqual } from "node:crypto";
import { cryptoStore } from "../lib/crypto.mjs";
import { json } from "../lib/stripe.mjs";

const notFound = () => json(404, { error: "Not found" }, { "Cache-Control": "no-store" });

/** SHA-256 then timingSafeEqual, so length differences do not skip the compare. */
function sameSecret(provided, expected) {
  const a = createHash("sha256").update(String(provided), "utf8").digest();
  const b = createHash("sha256").update(String(expected), "utf8").digest();
  return timingSafeEqual(a, b);
}

function keyOk(req) {
  const expected = typeof process.env.STATUS_KEY === "string" ? process.env.STATUS_KEY.trim() : "";
  if (!expected) return false;
  let provided = "";
  try { provided = new URL(req.url, "https://everclose.tv").searchParams.get("key") ?? ""; }
  catch { provided = ""; }
  return sameSecret(provided, expected);
}

export default async (req) => {
  if (!keyOk(req)) return notFound();
  try {
    const store = cryptoStore();
    const [totals, events] = await Promise.all([
      store.get("totals", { type: "json" }),
      store.get("events", { type: "json" }),
    ]);
    return json(200, {
      configured: { api_key: !!process.env.NOWPAYMENTS_API_KEY, ipn_secret: !!process.env.NOWPAYMENTS_IPN_SECRET, sandbox: String(process.env.NOWPAYMENTS_SANDBOX).toLowerCase() === "true" },
      totals: totals || { raised: 0, supporters: 0 },
      last_notices: events || [],
      note: (events || []).length ? undefined : "No notices received from NOWPayments yet.",
    }, { "Cache-Control": "no-store" });
  } catch (err) {
    return json(500, { error: "crypto storage unavailable", reason: String(err?.message || err).slice(0, 200) }, { "Cache-Control": "no-store" });
  }
};

export const config = { path: "/api/crypto-status" };
