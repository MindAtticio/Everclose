# EVERCLOSE website prototype (TEST MODE)

A single-page site for the EVERCLOSE pilot launch: hero + premiere countdown, pilot player,
the public **$20,000 community unlock** bar, story and characters, support tiers, a combined
**Support** checkout (card / Apple Pay / Google Pay **or** crypto), email signup, Discord link,
content note and footer.

> **Right now everything is simulated.** `MODE: "test"` in `assets/js/config.js`.
> No real money moves, no API keys exist anywhere in this folder, and the progress numbers
> are demo data stored in your own browser (localStorage). A striped TEST MODE ribbon and
> "demo data" label are shown on the page while in test mode.

## Look & brand

Velur Order palette: black, white and gold (Siera = black + gold, Anora = white + gold). All colours are CSS
variables at the top of `assets/css/style.css`:

| Role | Hex |
|---|---|
| Background / charcoal | `#0B0B0C` / `#111113` / `#151517` / `#1C1C1F` |
| Text off-white / muted / dim | `#F2EEE6` / `#B4AEA4` / `#8C877E` |
| Gold / highlight / dark (gradients) | `#C9A961` / `#D4B872` / `#8C7340` |
| Gold ink on off-white (Anora card) | `#7A6431` |
| Mind Attic warm silver | `#BDB6AA` |

The Mind Attic mark, wordmark and "Story first" script in `assets/img/mindattic-*.png` were keyed from the
studio logo photo (transparent PNG, tinted `#BDB6AA`). Festival laurels in `assets/img/laurels/` are the studio's real laurel files, recoloured to `#C9A961`; they run as a marquee in the footer (pauses on hover, static grid with reduced motion).

## Run it locally

Plain HTML/CSS/JS, no build step.

```bash
python3 -m http.server 8765    # from the repository root, then open http://localhost:8765
```

(Opening `index.html` directly also works, apart from clipboard copy.)

Try it: **Support → $25 → Continue → Card / Apple Pay / Google Pay → click the test card
`4242 4242 4242 4242` → Pay**. The thank-you screen appears and the bar and supporter count
animate up. `4000 0000 0000 0002` shows a decline. **Crypto** shows a simulated invoice with
BTC/ETH/USDC/SOL, a placeholder address and placeholder QR → "Simulate payment received".
"Reset demo numbers" under the bar returns to the starting demo values.

## Files

```
index.html                 page markup (all sections + the support modal)
assets/css/style.css       all styling (dark/ember theme, responsive)
assets/js/config.js        ← THE ONLY FILE YOU EDIT TO GO LIVE
assets/js/payments.js      payment/data adapters (test simulation + live hand-off)
assets/js/app.js           UI logic (countdown, bar, tiers, modal steps)
assets/img/                art cropped from the partner deck (poster, stills, logo)
assets/fonts/              self-hosted Cormorant Garamond + DM Sans (Google Fonts, OFL)
examples/netlify/functions example serverless code for Stripe, crypto and the progress total
screenshots/               QA screenshots (desktop 1440px + mobile 390px)
```

## Go-live checklist

1. **Stripe account (in your own name / Mind Attic's).** stripe.com → sign up → business
   details + bank account → identity verification. Describe the business honestly: "independent
   animated series, fan support and memberships; mature themes, no explicit content".
   Turn on Apple Pay and Google Pay in *Settings → Payment methods* (they appear automatically
   in Stripe Checkout; Apple Pay needs the domain verified, which Stripe does for hosted Checkout).
2. **Connect card payments – pick one:**
   - **A. Payment Links (no code, fastest).** In the Dashboard create Payment Links for $5, $10,
     $25, $50, one "customer chooses amount" link, and three *recurring* links for Stray $3,
     Bonded $7 and Veluri $15. Paste the URLs into `stripe.paymentLinks` in `config.js`.
     Set each link's confirmation page to redirect to `https://YOUR-DOMAIN/?thanks=1#unlock`.
   - **B. Checkout Sessions (any amount, cleaner).** Deploy
     `examples/netlify/functions/create-checkout.js`, set `STRIPE_SECRET_KEY` (+ `PRICE_*` IDs) as
     environment variables on the host (**never in the site files**), and set
     `stripe.checkoutEndpoint`.
3. **Crypto processor.** Open a NOWPayments (or Coinbase Commerce) account, connect a payout
   wallet you control, deploy `create-crypto-invoice.js` with the API key as an env var, set
   `crypto.invoiceEndpoint`. Crypto is one-time only on the page. Keep records for tax; convert
   to fiat promptly if price swings matter.
4. **Live progress bar.** The bar reads `unlock.progressEndpoint` (JSON `{raised, supporters}`).
   `examples/netlify/functions/progress.js` sums Stripe payments; add crypto totals from the
   provider webhook. Until that exists you can host a static `api/progress` JSON file and update
   it by hand (the same "manual bar" approach as Patreon).
5. **Newsletter.** Create a list in Buttondown / MailerLite / Kit / Mailchimp and paste the form
   action URL into `newsletter.action`.
6. **Content.** Set `premiere.youtubeVideoId` once the YouTube Premiere is scheduled (the player
   replaces the placeholder), `discordInvite`, `social` links, and add real Terms + Privacy pages
   (needed for Stripe). Update `unlock.nextEpisode` after each goal. Episode stills: see `assets/img/episodes/README.txt`.
7. **Flip the switch.** Set `MODE: "live"`. The TEST ribbon, demo chip and reset link disappear.
   Do one real $1 payment with your own card and refund it.
8. **Hosting (all have free tiers).** Netlify (publish directory = the repository root; connect
   this Git repo, or drag-and-drop the folder). When you go live, move
   `examples/netlify/functions` → `netlify/functions`. Vercel (move functions to `/api`),
   or Cloudflare Pages (functions → `/functions`). HTTPS is automatic.
9. **Domain.** Buy the domain (e.g. everclose.tv) and point it at the host: add the custom domain
   in the host's dashboard and set the DNS records it shows you (usually a CNAME for `www`
   and an A/ALIAS for the root). Interim option: `mindattic.io/everclose` or a subdomain such as
   `everclose.mindattic.io`.

## Placeholders still in the prototype

- YouTube player (no video ID yet), Discord invite, social links, Terms and Privacy pages.
- Starting numbers: $1,240 from 38 supporters (**demo data**, labelled on the page).
- Crypto address, QR and conversion rates are fake/demo.
- Tier names (Stray / Bonded / Veluri), prices and perks are suggestions. Edit them in `config.js`.
- Art is cropped from the partner deck slides (flattened 4K slide images), so the logo is a
  traced extraction. Swap in original art/logo files for the sharpest result.
