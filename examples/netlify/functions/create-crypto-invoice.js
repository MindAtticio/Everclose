// EXAMPLE ONLY. Netlify Function: creates a NOWPayments hosted invoice (one-time crypto support).
// Set env var NOWPAYMENTS_API_KEY. Then CONFIG.crypto.invoiceEndpoint = "/.netlify/functions/create-crypto-invoice".
// Coinbase Commerce works the same way: POST https://api.commerce.coinbase.com/charges and return hosted_url.
const SITE = process.env.SITE_URL || "https://everclose.tv";
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const { amount, coin } = JSON.parse(event.body || "{}");
  const usd = Number(amount);
  if (!(usd >= 2 && usd <= 5000)) return { statusCode: 400, body: JSON.stringify({ error: "amount out of range" }) };
  const res = await fetch("https://api.nowpayments.io/v1/invoice", {
    method: "POST",
    headers: { "x-api-key": process.env.NOWPAYMENTS_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      price_amount: usd, price_currency: "usd",
      pay_currency: coin ? String(coin).toLowerCase() : undefined,
      order_description: "Support EVERCLOSE (Chapter 2 unlock)",
      ipn_callback_url: SITE + "/.netlify/functions/payment-webhook",
      success_url: SITE + "/?thanks=1#unlock", cancel_url: SITE + "/#support"
    })
  });
  const j = await res.json();
  if (!j.invoice_url) return { statusCode: 502, body: JSON.stringify({ error: "provider error" }) };
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: j.invoice_url }) };
};
