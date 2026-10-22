/* ==========================================================================
   EVERCLOSE · SITE CONFIG
   --------------------------------------------------------------------------
   This is the ONLY file you need to edit to go live. See README.md.
   While MODE is "test", every payment and signup is SIMULATED in the
   browser. No money moves and no real keys are used anywhere.
   ========================================================================== */
window.EVERCLOSE_CONFIG = {
  /* "test" = simulated checkout screens + localStorage demo progress.
     "live" = real Stripe / crypto / newsletter / progress endpoints below. */
  MODE: "live",

  /* ---- Premiere -------------------------------------------------------- */
  premiere: {
    // Thu 29 Oct 2026, 19:00 CET (= 18:00 UTC = 14:00 ET). EU clocks change on Oct 25, so CET is +01:00.
    isoDate: "2026-10-29T19:00:00+01:00",
    label: "Thu, Oct 29 · 19:00 CET / 14:00 ET",
    // Paste the YouTube video ID of the pilot (the part after watch?v=) once the Premiere is scheduled.
    // Empty string = show the placeholder frame.
    youtubeVideoId: "",
    youtubeChannelUrl: "https://www.youtube.com/@PLACEHOLDER"
  },

  /* ---- Community unlock ------------------------------------------------ */
  unlock: {
    goal: 20000,              // USD needed to release Episode 2 free for everyone
    currency: "USD",
    nextEpisode: "Episode 2 · Echo Room",
    // Demo starting values used ONLY in test mode (clearly labelled "demo data" on the page).
    demoStart: { raised: 1240, supporters: 38 },
    // LIVE: URL returning JSON {"raised": 1234.56, "supporters": 42}. Fed by your Stripe + crypto webhooks.
    progressEndpoint: "/api/progress",
    pollSeconds: 60
  },

  /* ---- Episodes (Season 1) -------------------------------------------
     image: "" shows the black/gold placeholder. To use a real still, upload
     assets/img/episodes/epN.jpg (and optionally .webp) and set
     image: "assets/img/episodes/epN" (no extension), webp: true if you added a .webp.
     If a configured file is missing, the card falls back to the placeholder.
     pos (optional) = CSS object-position focal point, e.g. "50% 40%". */
  episodes: [
    { n: 1, title: "Dust",       status: "free",   image: "assets/img/episodes/ep1", webp: true, pos: "50% 45%" },
    { n: 2, title: "Echo Room",  status: "next",   image: "assets/img/episodes/ep2", webp: true, pos: "55% 35%" },
    { n: 3, title: "The Vent",   status: "locked", image: "assets/img/episodes/ep3", webp: true, pos: "35% 55%" },
    { n: 4, title: "Routine",    status: "locked", image: "assets/img/episodes/ep4", webp: true, pos: "55% 45%" },
    { n: 5, title: "The Codex",  status: "locked", image: "assets/img/episodes/ep5", webp: true, pos: "40% 30%" },
    { n: 6, title: "The Shadow", status: "locked", image: "assets/img/episodes/ep6", webp: true, pos: "45% 40%" }
  ],

  /* ---- Support options ------------------------------------------------- */
  oneTimePresets: [5, 10, 25, 50],
  minCustom: 2,
  maxCustom: 5000,
  tiers: [
    { id: "stray",  name: "Stray",  price: 3,  tagline: "Join the bond",
      perks: ["Your name in the supporter credits", "Monthly studio update", "Supporter role on Discord"] },
    { id: "bonded", name: "Bonded", price: 7,  tagline: "Most popular", featured: true,
      perks: ["Everything in Stray", "Behind-the-scenes: storyboards, fight choreography, music sketches", "Vote on the next goal reward"] },
    { id: "veluri", name: "Veluri", price: 15, tagline: "Inner circle",
      perks: ["Everything in Bonded", "Early access to each episode, 48 hours before public release", "Special thanks in the end credits"] }
  ],

  /* ---- Card payments: Stripe ------------------------------------------- */
  stripe: {
    // OPTION A (no code, fastest): Stripe Payment Links. Create one per amount in the Stripe Dashboard
    // and paste the URLs here. "custom" = a Payment Link with "Let customers choose what to pay".
    paymentLinks: {
      once_5: "", once_10: "", once_25: "", once_50: "", once_custom: "",
      monthly_stray: "", monthly_bonded: "", monthly_veluri: ""
    },
    // OPTION B (in use): netlify/functions/create-checkout.mjs creates a Stripe Checkout Session
    // and returns {"url": "..."}. Monthly tier prices are set in Stripe (lookup keys
    // everclose_monthly_3 / _7 / _15); keep the tier prices above in step with them.
    checkoutEndpoint: "/api/checkout"
  },

  /* ---- Crypto payments ------------------------------------------------- */
  crypto: {
    provider: "nowpayments",  // "nowpayments" | "coinbase" (label only in test mode)
    // LIVE: serverless function that creates a hosted invoice and returns {"url": "..."}.
    // Example in examples/netlify/functions/create-crypto-invoice.js
    invoiceEndpoint: "",
    coins: ["BTC", "ETH", "USDC", "SOL"],
    // Demo-only conversion rates used to show an amount on the simulated screen.
    demoRatesUSD: { BTC: 68000, ETH: 2600, USDC: 1, SOL: 150 },
    oneTimeOnly: true         // crypto is offered for one-time support; monthly uses card
  },

  /* ---- Newsletter / community ----------------------------------------- */
  newsletter: {
    // LIVE: the form "action" URL from your email tool (Buttondown, MailerLite, Kit, Mailchimp...).
    action: "",
    emailField: "email"
  },
  discordInvite: "",          // e.g. "https://discord.gg/XXXX" (placeholder until the server exists)

  /* ---- Contact / social ------------------------------------------------ */
  contactEmail: "andrej@mindattic.io",
  studioUrl: "https://www.mindattic.io",
  social: { youtube: "", tiktok: "", instagram: "", x: "", bluesky: "" }
};
