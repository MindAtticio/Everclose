/* EVERCLOSE · UI logic. Talks to payments via window.EC_Payments only. */
(function () {
  "use strict";
  const C = window.EVERCLOSE_CONFIG;
  const P = window.EC_Payments;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  // Whole dollars on the page, always rounded up ($1.92 shows as $2). The exact amount is kept for the
  // goal check. The tiny tolerance stops float noise (2.0000000001) from showing an extra dollar.
  const upDollars = (n) => Math.ceil(Number(n) - 1e-6);
  const fmt = (n, cents) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- static bits from config ---------- */
  $$("[data-premiere-label]").forEach((el) => (el.textContent = C.premiere.label));
  $$("[data-next-episode]").forEach((el) => (el.textContent = C.unlock.nextEpisode));
  $("#goal").textContent = fmt(C.unlock.goal);
  $("#bar").setAttribute("aria-valuemax", C.unlock.goal);
  if (!P.isTest) { $("#testRibbon").remove(); $("#demoChip").remove(); $("#resetDemo").remove(); document.body.classList.add("is-live"); }

  const discord = $("#discordLink");
  if (C.discordInvite) { discord.href = C.discordInvite; $("#discordNote").remove(); }
  else discord.addEventListener("click", (e) => { e.preventDefault(); toast("Discord invite link is a placeholder for now."); });
  $$("[data-placeholder]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); toast(a.textContent + " page placeholder."); }));

  /* ---------- countdown ---------- */
  const target = new Date(C.premiere.isoDate).getTime();
  try {
    $("#localTime").textContent = "Your time: " + new Date(target).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  } catch (e) {}
  function tick() {
    const diff = target - Date.now();
    const cd = $("#countdown");
    if (diff <= 0) {
      cd.classList.add("is-live");
      cd.innerHTML = '<p class="countdown__now"><span class="dot"></span> The pilot is live. Watch it free below.</p>';
      $("#playerStatus").textContent = C.premiere.youtubeVideoId ? "Now playing" : "The pilot is live on YouTube";
      return false;
    }
    const d = Math.floor(diff / 864e5), h = Math.floor(diff / 36e5) % 24, m = Math.floor(diff / 6e4) % 60, s = Math.floor(diff / 1e3) % 60;
    const pad = (n) => String(n).padStart(2, "0");
    $('[data-cd="d"]').textContent = pad(d); $('[data-cd="h"]').textContent = pad(h);
    $('[data-cd="m"]').textContent = pad(m); $('[data-cd="s"]').textContent = pad(s);
    return true;
  }
  if (tick()) { const iv = setInterval(() => { if (!tick()) clearInterval(iv); }, 1000); }

  /* ---------- YouTube embed ---------- */
  if (C.premiere.youtubeVideoId) {
    const id = encodeURIComponent(C.premiere.youtubeVideoId);
    $("#player").innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1" title="EVERCLOSE pilot" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>';
  } else {
    $("#playerPlaceholder").addEventListener("click", (e) => {
      if (e.target.closest("#remindLink")) return;
      toast("The pilot premieres " + C.premiere.label + ". The YouTube player appears here.");
    });
  }

  /* ---------- progress bar ---------- */
  let shown = { raised: 0, supporters: 0 };
  function animateTo(state, opts = {}) {
    const goal = C.unlock.goal;
    const from = { ...shown };
    const to = { raised: state.raised, supporters: state.supporters };
    const dur = prefersReduced || opts.instant ? 0 : opts.dur || 1400;
    const t0 = performance.now();
    const step = (now) => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      const r = from.raised + (to.raised - from.raised) * e;
      const sp = Math.round(from.supporters + (to.supporters - from.supporters) * e);
      const pct = Math.min(100, (r / goal) * 100);
      $("#raised").textContent = fmt(upDollars(r));
      $("#supporters").textContent = sp.toLocaleString("en-US");
      $("#pct").textContent = (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + "%";
      $("#barFill").style.width = Math.max(pct, 0.6) + "%";
      $("#sRaised").textContent = fmt(upDollars(r));
      $("#sSupporters").textContent = sp.toLocaleString("en-US");
      $("#sBar").style.width = Math.max(pct, 0.6) + "%";
      if (k < 1) requestAnimationFrame(step);
      else {
        shown = to;
        $("#bar").setAttribute("aria-valuenow", upDollars(to.raised));
        $("#meter").classList.toggle("is-complete", to.raised >= goal);
      }
    };
    requestAnimationFrame(step);
  }
  async function refreshProgress(opts) {
    try { animateTo(await P.getProgress(), opts); }
    catch (e) { console.warn("[EVERCLOSE] progress unavailable", e); }
  }
  // animate in when the meter scrolls into view
  const meterEl = $("#meter");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((ents) => { if (ents.some((x) => x.isIntersecting)) { refreshProgress(); io.disconnect(); } }, { threshold: 0.3 });
    io.observe(meterEl);
  } else refreshProgress();
  if (!P.isTest) setInterval(refreshProgress, (C.unlock.pollSeconds || 60) * 1000);
  $("#resetDemo") && $("#resetDemo").addEventListener("click", () => { P.resetDemo(); shown = { raised: 0, supporters: 0 }; refreshProgress(); toast("Demo numbers reset."); });

  /* ---------- episode stills (optional; placeholder stays if unset or missing) ---------- */
  (C.episodes || []).forEach((ep) => {
    if (!ep.image) return;
    const card = $('.ep[data-ep="' + ep.n + '"] .ep__art');
    if (!card) return;
    const src = ep.image + (ep.webp ? ".webp" : ".jpg");
    const img = new Image();
    img.alt = ""; img.decoding = "async"; img.className = "ep__img";
    if (ep.pos) img.style.objectPosition = ep.pos;
    img.onload = () => { card.prepend(img); card.classList.add("has-img"); };
    img.onerror = () => { if (ep.webp) { ep.webp = false; img.src = ep.image + ".jpg"; } };
    img.src = src;
  });

  /* ---------- tier cards on the page ---------- */
  let onceAmount = 10;
  const onceWrap = $("#onceAmounts");
  C.oneTimePresets.forEach((a) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "amt"; b.textContent = fmt(a); b.dataset.amount = a;
    b.setAttribute("aria-pressed", a === onceAmount);
    b.addEventListener("click", () => { onceAmount = a; $("#onceCustom").value = ""; syncOnce(); });
    onceWrap.appendChild(b);
  });
  $("#onceCustom").addEventListener("input", (e) => { const v = parseFloat(e.target.value); if (v > 0) onceAmount = v; syncOnce(); });
  function syncOnce() {
    $$(".amt", onceWrap).forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.amount) === onceAmount && !$("#onceCustom").value)));
    $("#onceLabel").textContent = fmt(onceAmount, onceAmount % 1 !== 0);
  }
  $("#onceGo").addEventListener("click", () => openModal({ frequency: "once", amount: onceAmount, custom: !!$("#onceCustom").value }));

  const mt = $("#monthlyTiers");
  C.tiers.forEach((t) => {
    const el = document.createElement("article");
    el.className = "card tier" + (t.featured ? " tier--featured" : "");
    el.innerHTML =
      '<p class="tier__kicker">' + (t.featured ? '<span class="chip">' + t.tagline + "</span>" : "Monthly · " + t.tagline) + "</p>" +
      "<h3>" + t.name + "</h3>" +
      '<p class="tier__price"><b>' + fmt(t.price) + '</b><span>/ month</span></p>' +
      '<ul class="perks">' + t.perks.map((p) => "<li>" + p + "</li>").join("") + "</ul>" +
      '<button class="btn ' + (t.featured ? "btn--gold" : "btn--ghost") + ' btn--block" data-tier="' + t.id + '">Join ' + t.name + "</button>";
    mt.appendChild(el);
  });
  $$("[data-tier]").forEach((b) => b.addEventListener("click", () => openModal({ frequency: "monthly", tierId: b.dataset.tier })));
  $$("[data-support]").forEach((b) => b.addEventListener("click", () => openModal()));

  /* ---------- modal ---------- */
  const modal = $("#modal");
  let lastFocus = null;
  const order = { frequency: "once", amount: 10, tierId: null, name: "", method: null };

  function showStep(name) {
    $$(".step", modal).forEach((s) => (s.hidden = s.dataset.step !== name));
    modal.dataset.current = name;
    const first = $('.step[data-step="' + name + '"] button:not([hidden]), .step[data-step="' + name + '"] input', modal);
    $(".modal__dialog", modal).scrollTop = 0;
    if (first && name !== "amount") setTimeout(() => first.focus({ preventScroll: true }), 30);
  }

  function renderAmounts() {
    const wrap = $("#mAmounts");
    wrap.innerHTML = "";
    $$(".seg__btn", modal).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.freq === order.frequency)));
    if (order.frequency === "once") {
      wrap.className = "m-amounts";
      C.oneTimePresets.forEach((a) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "amt amt--lg"; b.textContent = fmt(a);
        b.setAttribute("aria-pressed", String(order.amount === a && !$("#mCustom").value));
        b.addEventListener("click", () => { order.amount = a; $("#mCustom").value = ""; renderAmounts(); });
        wrap.appendChild(b);
      });
      $("#mCustomWrap").hidden = false;
    } else {
      wrap.className = "m-amounts m-amounts--tiers";
      if (!order.tierId) order.tierId = (C.tiers.find((t) => t.featured) || C.tiers[0]).id;
      C.tiers.forEach((t) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "mtier";
        b.setAttribute("aria-pressed", String(order.tierId === t.id));
        b.innerHTML = '<span class="mtier__name">' + t.name + '</span><span class="mtier__price">' + fmt(t.price) + '<small>/mo</small></span><span class="mtier__perk">' + t.perks[t.perks.length - 1] + "</span>";
        b.addEventListener("click", () => { order.tierId = t.id; renderAmounts(); });
        wrap.appendChild(b);
      });
      order.amount = C.tiers.find((t) => t.id === order.tierId).price;
      $("#mCustomWrap").hidden = true;
    }
    $("#mTotal").textContent = fmt(order.amount, order.amount % 1 !== 0) + (order.frequency === "monthly" ? " / month" : "");
    $("#amountErr").textContent = "";
  }
  $$(".seg__btn", modal).forEach((b) => b.addEventListener("click", () => { order.frequency = b.dataset.freq; if (order.frequency === "once" && !C.oneTimePresets.includes(order.amount) && !$("#mCustom").value) order.amount = 10; renderAmounts(); }));
  $("#mCustom").addEventListener("input", (e) => { const v = parseFloat(e.target.value); if (v > 0) order.amount = Math.round(v * 100) / 100; renderAmounts(); });

  function openModal(preset = {}) {
    lastFocus = document.activeElement;
    order.frequency = preset.frequency || "once";
    order.tierId = preset.tierId || null;
    order.amount = preset.amount || 10;
    order.method = null;
    $("#mCustom").value = preset.custom ? preset.amount : "";
    renderAmounts();
    modal.hidden = false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(() => modal.classList.add("is-open"));
    showStep("amount");
    setTimeout(() => $(".seg__btn[aria-selected=true]", modal).focus({ preventScroll: true }), 40);
  }
  function closeModal() {
    modal.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    stopCryptoTimer();
    setTimeout(() => { modal.hidden = true; resetCardForm(); }, 200);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  $$("[data-close]", modal).forEach((b) => b.addEventListener("click", closeModal));
  $$("[data-back]", modal).forEach((b) => b.addEventListener("click", () => { stopCryptoTimer(); showStep(b.dataset.back); }));
  document.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "Tab") { // focus trap
      const f = $$('button, [href], input, [tabindex]:not([tabindex="-1"])', modal).filter((x) => !x.closest("[hidden]") && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  function describe() {
    if (order.frequency === "monthly") { const t = C.tiers.find((x) => x.id === order.tierId); return t.name + " membership · " + fmt(t.price) + " / month"; }
    return "One-time support · " + fmt(order.amount, order.amount % 1 !== 0);
  }

  $("#toMethod").addEventListener("click", () => {
    const a = order.amount;
    if (order.frequency === "once" && (!(a >= C.minCustom) || a > C.maxCustom)) {
      $("#amountErr").textContent = "Please choose an amount between " + fmt(C.minCustom) + " and " + fmt(C.maxCustom) + ".";
      return;
    }
    order.name = $("#mName").value.trim();
    $("#methodSummary").textContent = describe();
    const cryptoBtn = $("#payCrypto");
    const blocked = C.crypto.oneTimeOnly && order.frequency === "monthly";
    cryptoBtn.disabled = blocked;
    $("#cryptoHint").textContent = blocked ? "One-time only. Switch to One-time to pay in crypto." : C.crypto.coins.join(" · ");
    showStep("method");
  });

  /* ----- card ----- */
  $("#payCard").addEventListener("click", async () => {
    order.method = "card";
    try { if (await P.startCardCheckout(order)) return; } catch (e) { toast(e.message); return; }
    const amt = fmt(order.amount, true);
    $("#coWhat").textContent = order.frequency === "monthly" ? C.tiers.find((t) => t.id === order.tierId).name + " membership" : "Support EVERCLOSE · one-time";
    $("#coAmount").textContent = amt;
    $("#coFreq").textContent = order.frequency === "monthly" ? "per month · cancel anytime" : "Counts toward the $20,000 Episode 2 unlock";
    $("#coPayAmt").textContent = amt + (order.frequency === "monthly" ? " / month" : "");
    showStep("card");
  });
  const card = $("#coCard"), exp = $("#coExp"), cvc = $("#coCvc");
  card.addEventListener("input", () => { card.value = card.value.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim(); });
  exp.addEventListener("input", () => { const d = exp.value.replace(/\D/g, "").slice(0, 4); exp.value = d.length > 2 ? d.slice(0, 2) + " / " + d.slice(2) : d; });
  cvc.addEventListener("input", () => { cvc.value = cvc.value.replace(/\D/g, "").slice(0, 4); });
  $("#fillTest").addEventListener("click", () => {
    $("#coEmail").value = $("#coEmail").value || "fan@example.com";
    card.value = "4242 4242 4242 4242"; exp.value = "12 / 30"; cvc.value = "123";
    $("#coName").value = $("#coName").value || order.name || "Test Supporter";
    $("#cardErr").textContent = "";
  });
  function resetCardForm() {
    $("#cardForm").reset(); $("#cardErr").textContent = "";
    const btn = $("#coPay"); btn.disabled = false; btn.classList.remove("is-loading");
  }
  function validCard() {
    const email = $("#coEmail").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email for the receipt.";
    if (card.value.replace(/\D/g, "").length !== 16) return "Your card number is incomplete.";
    const m = exp.value.match(/^(\d{2}) \/ (\d{2})$/);
    if (!m || +m[1] < 1 || +m[1] > 12) return "Your card's expiration date is incomplete.";
    const now = new Date(), yy = now.getFullYear() % 100, mm = now.getMonth() + 1;
    if (+m[2] < yy || (+m[2] === yy && +m[1] < mm)) return "Your card's expiration date is in the past.";
    if (cvc.value.length < 3) return "Your card's security code is incomplete.";
    return "";
  }
  async function charge(payload) {
    const btn = $("#coPay");
    btn.disabled = true; btn.classList.add("is-loading");
    $("#cardErr").textContent = "";
    try {
      await P.simulateCardCharge(payload);
      succeed();
    } catch (e) {
      $("#cardErr").textContent = e.message;
      btn.disabled = false; btn.classList.remove("is-loading");
    }
  }
  $("#cardForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = validCard();
    if (err) { $("#cardErr").textContent = err; return; }
    charge({ number: card.value });
  });
  $$("[data-wallet]").forEach((b) => b.addEventListener("click", () => { order.method = b.dataset.wallet; charge({ wallet: b.dataset.wallet }); }));

  /* ----- crypto ----- */
  let coin = C.crypto.coins[0], timerIv = null;
  const prov = { nowpayments: "NOWPayments", coinbase: "Coinbase Commerce" }[C.crypto.provider] || "crypto processor";
  function renderCoins() {
    const w = $("#coins"); w.innerHTML = "";
    C.crypto.coins.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "coin coin--" + c.toLowerCase(); b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(c === coin));
      b.innerHTML = '<span class="coin__sym">' + ({ BTC: "₿", ETH: "Ξ", USDC: "$", SOL: "◎" }[c] || c[0]) + "</span>" + c;
      b.addEventListener("click", () => { coin = c; renderCoins(); renderQuote(); });
      w.appendChild(b);
    });
  }
  function renderQuote() {
    const q = P.demoQuote(order.amount, coin);
    $("#cAmt").textContent = q.amount + " " + coin;
    $("#cUsd").textContent = "≈ " + fmt(order.amount, true) + " · demo rate, not a live price";
    $("#cNet").textContent = q.network;
    $("#cAddr").textContent = q.address;
    drawQR(q.address + "|" + q.amount);
  }
  function drawQR(seed) {
    // Deterministic decorative grid. NOT a scannable QR code (placeholder only).
    let h = 2166136261; for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
    const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
    const n = 25, cells = [];
    const finder = (x, y) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
    const finderOn = (x, y) => { for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) { const dx = x - fx, dy = y - fy; if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4); } return false; };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const on = finder(x, y) ? finderOn(x, y) : rnd() > 0.52;
      if (on) cells.push('<rect x="' + x + '" y="' + y + '" width="1" height="1"/>');
    }
    $("#qr").innerHTML = '<svg viewBox="-2 -2 ' + (n + 4) + " " + (n + 4) + '" shape-rendering="crispEdges"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#F2EEE6"/><g fill="#0B0B0C">' + cells.join("") + '</g></svg><span class="qr__tag">TEST · placeholder</span>';
  }
  function startCryptoTimer() {
    stopCryptoTimer(); let left = 15 * 60;
    const draw = () => { $("#cTimer").textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); };
    draw(); timerIv = setInterval(() => { left = Math.max(0, left - 1); draw(); if (!left) stopCryptoTimer(); }, 1000);
  }
  function stopCryptoTimer() { if (timerIv) clearInterval(timerIv); timerIv = null; }
  $("#payCrypto").addEventListener("click", async () => {
    order.method = "crypto";
    try { if (await P.startCryptoCheckout(order, coin)) return; } catch (e) { toast(e.message); return; }
    $("#cryptoProvider").textContent = describe() + " · invoice by " + prov + " (simulated)";
    $("#cStatus").textContent = "Waiting for payment…"; $("#cStatus").className = "crypto-status";
    $("#simCrypto").disabled = false;
    renderCoins(); renderQuote(); startCryptoTimer();
    showStep("crypto");
  });
  $("#copyAddr").addEventListener("click", () => copy($("#cAddr").textContent, "Placeholder address copied (test only)."));
  $("#simCrypto").addEventListener("click", async () => {
    $("#simCrypto").disabled = true; $("#cStatus").classList.add("is-busy");
    await P.simulateCryptoPayment((msg) => ($("#cStatus").textContent = msg));
    stopCryptoTimer(); order.method = "crypto:" + coin; succeed();
  });

  /* ----- success ----- */
  function succeed() {
    const state = P.recordDemoGift(order);
    $("#sName").textContent = order.name ? ", " + order.name : "";
    $("#sText").textContent = (order.frequency === "monthly"
      ? "Your " + C.tiers.find((t) => t.id === order.tierId).name + " membership (" + fmt(order.amount) + "/month) is active."
      : "Your " + fmt(order.amount, order.amount % 1 !== 0) + " gift is in.") +
      " It now counts toward unlocking " + C.unlock.nextEpisode + " for everyone.";
    showStep("success");
    resetCardForm();
    animateTo(state, { dur: 1600 });
  }
  $("#shareBtn").addEventListener("click", () => copy(location.href.split("#")[0] + "#unlock", "Link copied. Share it and help unlock Episode 2."));

  /* ---------- email signup ---------- */
  $("#signupForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#signupEmail"), msg = $("#signupMsg"), btn = $("#signupForm button");
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = "Please enter a valid email address."; msg.className = "form-msg form-msg--err"; input.focus(); return; }
    btn.disabled = true; btn.classList.add("is-loading");
    try {
      const r = await P.subscribe(email);
      msg.textContent = "You're on the list. We'll email you when the pilot goes live." + (r.simulated ? " (Simulated signup, test mode.)" : "");
      msg.className = "form-msg form-msg--ok"; input.value = "";
    } catch (err) { msg.textContent = "Something went wrong. Please try again."; msg.className = "form-msg form-msg--err"; }
    btn.disabled = false; btn.classList.remove("is-loading");
  });

  /* ---------- helpers ---------- */
  let toastT = null;
  function toast(text) {
    const t = $("#toast"); t.textContent = text; t.hidden = false;
    requestAnimationFrame(() => t.classList.add("is-on"));
    clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove("is-on"); setTimeout(() => (t.hidden = true), 250); }, 3200);
  }
  function copy(text, okMsg) {
    const done = () => toast(okMsg);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, done);
    else { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); done(); }
  }

  // returning from a live Stripe / crypto checkout (success_url = /?thanks=1#unlock)
  if (new URLSearchParams(location.search).get("thanks") === "1") {
    setTimeout(() => toast("Thank you! Your support counts toward unlocking " + C.unlock.nextEpisode + "."), 600);
    history.replaceState(null, "", location.pathname + location.hash);
  }

  // nav shadow on scroll
  const nav = $(".nav");
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 40);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
})();
