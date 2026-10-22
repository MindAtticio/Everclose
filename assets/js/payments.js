/* ==========================================================================
   EVERCLOSE · PAYMENT + DATA ADAPTERS
   --------------------------------------------------------------------------
   The UI (app.js) only talks to window.EC_Payments. In TEST mode everything
   here is simulated locally. In LIVE mode the same functions hand off to
   Stripe (Payment Links or a Checkout Session endpoint), a crypto processor
   (hosted invoice endpoint), your newsletter tool and a progress endpoint.
   ========================================================================== */
(function () {
  const C = window.EVERCLOSE_CONFIG;
  const isTest = C.MODE !== "live";
  const STORE_KEY = "everclose_demo_progress_v1";
  const SIGNUP_KEY = "everclose_demo_signups_v1";

  /* ---------- progress (the $20k bar) ---------- */
  function readDemo() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (raw && typeof raw.raised === "number" && typeof raw.supporters === "number") return raw;
    } catch (e) { /* ignore */ }
    return { raised: C.unlock.demoStart.raised, supporters: C.unlock.demoStart.supporters, gifts: [] };
  }
  function writeDemo(state) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  async function getProgress() {
    if (isTest) { const s = readDemo(); return { raised: s.raised, supporters: s.supporters, demo: true }; }
    const res = await fetch(C.unlock.progressEndpoint, { cache: "no-store" });
    if (!res.ok) throw new Error("progress endpoint " + res.status);
    const j = await res.json();
    return { raised: Number(j.raised) || 0, supporters: Number(j.supporters) || 0, demo: false };
  }

  function recordDemoGift(order) {
    const s = readDemo();
    s.raised = Math.round((s.raised + order.amount) * 100) / 100;
    s.supporters += 1;
    s.gifts = (s.gifts || []).slice(-49);
    s.gifts.push({ a: order.amount, f: order.frequency, m: order.method, n: order.name || "", t: Date.now() });
    writeDemo(s);
    return { raised: s.raised, supporters: s.supporters, demo: true };
  }

  function resetDemo() { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }

  /* ---------- card (Stripe) ---------- */
  // order = { frequency: "once"|"monthly", amount: Number, tierId?: String, name?: String }
  function paymentLinkKey(order) {
    if (order.frequency === "monthly") return "monthly_" + order.tierId;
    return C.oneTimePresets.includes(order.amount) ? "once_" + order.amount : "once_custom";
  }

  /** LIVE: redirect to Stripe. Returns true if a redirect was started. */
  async function startCardCheckout(order) {
    if (isTest) return false; // UI shows the simulated checkout instead
    const link = C.stripe.paymentLinks[paymentLinkKey(order)];
    if (link) {
      const u = new URL(link);
      if (order.name) u.searchParams.set("client_reference_id", order.name.replace(/[^\w-]/g, "_").slice(0, 40));
      window.location.href = u.toString();
      return true;
    }
    if (C.stripe.checkoutEndpoint) {
      const res = await fetch(C.stripe.checkoutEndpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order)
      });
      const j = await res.json();
      if (!j.url) throw new Error("No checkout URL returned");
      window.location.href = j.url;
      return true;
    }
    throw new Error("Stripe is not configured (add Payment Links or a checkoutEndpoint in config.js)");
  }

  /** TEST: simulated Stripe card charge. Mirrors Stripe's test cards. */
  function simulateCardCharge(card) {
    const digits = (card.number || "").replace(/\D/g, "");
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (digits === "4000000000000002") return reject(new Error("Your card was declined. (Simulated decline: test card 4000 0000 0000 0002)"));
        if (digits === "4242424242424242" || card.wallet) return resolve({ id: "pi_test_" + Math.random().toString(36).slice(2, 12) });
        reject(new Error("In test mode use 4242 4242 4242 4242."));
      }, 1100);
    });
  }

  /* ---------- crypto ---------- */
  async function startCryptoCheckout(order, coin) {
    if (isTest) return false;
    if (!C.crypto.invoiceEndpoint) throw new Error("Crypto is not configured (add invoiceEndpoint in config.js)");
    const res = await fetch(C.crypto.invoiceEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...order, coin })
    });
    const j = await res.json();
    if (!j.url) throw new Error("No invoice URL returned");
    window.location.href = j.url;
    return true;
  }

  function demoQuote(amountUSD, coin) {
    const rate = C.crypto.demoRatesUSD[coin] || 1;
    const dec = coin === "USDC" ? 2 : coin === "BTC" ? 6 : 4;
    const fake = {
      BTC: { net: "Bitcoin", addr: "bc1q-TEST-0000-everclose-demo-not-a-wallet" },
      ETH: { net: "Ethereum (ERC-20)", addr: "0xTEST0000000000000000EVERCLOSE0000DEMO" },
      USDC: { net: "USDC on Ethereum / Base / Solana", addr: "0xTEST0000000000000000EVERCLOSE0000USDC" },
      SOL: { net: "Solana", addr: "TESTso1EverCLoseDemo11111111111111NotReal" }
    }[coin];
    return { coin, amount: (amountUSD / rate).toFixed(dec), network: fake.net, address: fake.addr };
  }

  function simulateCryptoPayment(onStatus) {
    return new Promise((resolve) => {
      const seq = [
        [500, "Payment detected on-chain (simulated)…"],
        [1200, "Confirming 1 of 2…"],
        [1900, "Confirming 2 of 2…"],
        [2500, "Confirmed."]
      ];
      seq.forEach(([t, msg]) => setTimeout(() => onStatus(msg), t));
      setTimeout(() => resolve({ id: "crypto_test_" + Math.random().toString(36).slice(2, 10) }), 2700);
    });
  }

  /* ---------- newsletter ---------- */
  async function subscribe(email) {
    if (isTest || !C.newsletter.action) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const list = JSON.parse(localStorage.getItem(SIGNUP_KEY) || "[]");
        if (!list.includes(email)) list.push(email);
        localStorage.setItem(SIGNUP_KEY, JSON.stringify(list));
      } catch (e) {}
      return { ok: true, simulated: true };
    }
    const body = new FormData();
    body.append(C.newsletter.emailField || "email", email);
    await fetch(C.newsletter.action, { method: "POST", body, mode: "no-cors" });
    return { ok: true, simulated: false };
  }

  window.EC_Payments = {
    isTest, getProgress, recordDemoGift, resetDemo,
    startCardCheckout, simulateCardCharge,
    startCryptoCheckout, demoQuote, simulateCryptoPayment,
    subscribe
  };
})();
