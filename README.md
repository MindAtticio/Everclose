# EVERCLOSE website prototype (TEST MODE)

A single-page site for the EVERCLOSE pilot launch: hero + premiere countdown, pilot player,
the public **$20,000 community unlock** bar, story and characters, support tiers, a combined
**Support** checkout (card / Apple Pay / Google Pay **or** crypto), email signup, Discord link,
content note and footer.

> `MODE: "live"` in `assets/js/config.js` sends card payments to Stripe. With a sandbox key that is
> still test money. Set `MODE: "test"` to go back to the fully simulated prototype below.
>
> **In test mode everything is simulated.**
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

### Stripe (built, on Netlify Functions)

Stripe account: **EVERCLOSE** (in the MIND ATTIC organisation). Fans pay on Stripe-hosted Checkout;
card, Apple Pay, Google Pay and Link appear automatically.

| File | Route | Does |
|---|---|---|
| `netlify/functions/create-checkout.mjs` | `POST /api/checkout` | Creates a Checkout Session: one-time gift (any amount $2–$5,000) or monthly membership |
| `netlify/functions/progress.mjs` | `GET /api/progress` | Public unlock total, summed from Stripe payments minus refunds, cached 60 s |
| `netlify/lib/stripe.mjs` | – | Stripe client, price lookup keys, limits |

Prices live in Stripe and are found by lookup key: `everclose_monthly_3` (Stray), `everclose_monthly_7`
(Bonded), `everclose_monthly_20` (Veluri), `everclose_one_time` (one-time product). If you change a
tier price, move its lookup key to the new price in Stripe **and** update `tiers` in `config.js`.

**Netlify environment variables** (Site configuration → Environment variables, never in the files):

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | A restricted key from the EVERCLOSE account (sandbox key for previews, live key for production). Permissions: Checkout Sessions **write**, Prices **read**, Products **read**, Charges **read** |
| `CAMPAIGN_START` | optional, default `2026-10-20T00:00:00Z`: payments from this date count toward the bar |
| `CRYPTO_RAISED` / `CRYPTO_SUPPORTERS` | optional: crypto totals (USD / count) to add to the bar by hand |

**Stripe Dashboard, no code:** turn on the Customer portal (Settings → Billing → Customer portal) and
its login link, and in Settings → Billing → Subscriptions and emails turn on Smart Retries, failed-payment
emails and the "manage subscription" link in emails, so members can cancel or change cards themselves.
Supporter-credit names are saved on each payment as metadata `credit_name`.

1. **Account activation.** Complete the EVERCLOSE account's business details and bank account. Describe
   the business honestly: "independent animated series, fan support and memberships; mature themes,
   no explicit content". Add real Terms and Privacy pages (Stripe needs them).
2. **Recreate the products in live mode** with the same lookup keys, then set the live
   `STRIPE_SECRET_KEY` for the production context only. Do one real $1 payment and refund it.
3. **Crypto (NOWPayments, built).** One-time gifts in crypto go to a NOWPayments hosted invoice
   (`POST /api/crypto-invoice`, `netlify/functions/create-crypto-invoice.mjs`). NOWPayments calls
   `POST /api/crypto-ipn` when a payment changes; the function checks the signature and records each
   **finished** or **partially paid** payment once in Netlify Blobs (97% or more of the quote counts as the full gift, less counts what arrived), and `/api/progress` adds those to the bar. Netlify env vars:
   `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET`, and `NOWPAYMENTS_SANDBOX=true` while testing with a
   sandbox account (remove it for live). In NOWPayments, set the payout wallet(s) you control and choose
   which coins to accept. Expired or failed payments are not counted. Keep records for tax.
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
