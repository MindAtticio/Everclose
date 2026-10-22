// GET /api/crypto-status  ->  crypto totals and the last 20 NOWPayments notices the site received.
// For checking the crypto setup without opening Netlify's logs. No keys or personal data are stored
// in these entries (payment id, status, amounts and the outcome only).
import { cryptoStore } from "../lib/crypto.mjs";
import { json } from "../lib/stripe.mjs";

export default async () => {
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
