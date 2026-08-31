# Fundukuzama Backend

Signup, email verification, and wallet API — built to launch at **R0/month**.

## What costs money and what doesn't

| Service | Free tier | Notes |
|---|---|---|
| Supabase (DB + auth) | ✅ 500MB, unlimited auth users | Fine well past MVP stage |
| Resend (email) | ✅ 100/day, 3,000/month | Handles signup verification emails |
| Render (hosting) | ✅ free web service | Free tier sleeps when idle — first request after inactivity is slow. R120/mo (~$7) removes that if it bothers you |
| Twilio (SMS OTP) | ❌ pay-per-message | **Not required to launch** — see below |

**Phone verification is optional and off by default** (`PHONE_VERIFICATION_REQUIRED=false` in `.env`). Signup only requires email verification via Resend, which is free. The phone number field is still collected and stored — it's just not gated behind a paid SMS OTP. Flip it on later once revenue justifies the Twilio cost.

## Setup

1. **Supabase**: create a free project at supabase.com → SQL Editor → paste and run `schema.sql` → copy your Project URL and `service_role` key (Settings → API) into `.env`.
2. **Resend**: sign up at resend.com → API Keys → copy key into `.env`. Free tier's sender (`onboarding@resend.dev`) works immediately; verify your own domain later for a branded `@fundukuzama...` address.
3. Copy `.env.example` to `.env` and fill in the values above.
4. `npm install`
5. `npm run dev` — server runs on `http://localhost:4000`

## Endpoints

| Route | What it does |
|---|---|
| `POST /api/auth/signup` | Create account, send verification email |
| `GET /api/auth/verify-email?token=...` | Verify email, returns a session token |
| `POST /api/auth/resend-verification` | Resend the verification email |
| `POST /api/auth/login` | Sign in (blocked until email is verified) |
| `POST /api/auth/phone/send-otp` | No-ops until Twilio is configured |
| `POST /api/auth/phone/verify-otp` | No-ops until Twilio is configured |
| `GET /api/wallet` | Balance + transaction history (requires `Authorization: Bearer <token>`) |
| `POST /api/wallet/deposit` | Record a deposit |
| `POST /api/wallet/withdraw` | Record a withdrawal |

## Connecting the frontend

The signup and wallet forms in `fundukuzama-signup.html` and `fundukuzama_store.html` currently simulate everything in browser memory. To make it real:

- `submitOwner()` in the signup page → `POST /api/auth/signup`, then show the existing success screen
- `doDeposit()` / `doWithdraw()` in the store page → `POST /api/wallet/deposit` / `/withdraw`, store the returned JWT in memory (not localStorage — not supported in the Claude artifact preview, but fine in your real deployed site) and send it as the `Authorization` header

## Turning on phone verification later

1. Get a Twilio account, create a Verify Service, fill in the three `TWILIO_*` values in `.env`
2. Set `PHONE_VERIFICATION_REQUIRED=true`
3. Restart the server — `sendPhoneOtp` / `checkPhoneOtp` in `phoneService.js` will start actually calling Twilio instead of silently skipping

## Wiring in Stitch for real money movement

`wallet.js`'s deposit/withdraw routes currently credit/debit the balance instantly, for MVP demo purposes. Once you're ready to move real money:

- **Deposit**: call Stitch's Pay By Bank API to create a payment request, return the redirect URL to the frontend, and only credit `wallet_balance` after Stitch's webhook confirms the payment succeeded (don't credit on the API call itself)
- **Withdrawal**: call Stitch Payouts to send money to the business's linked bank account

Your frontend UI does not need to change for this — see the earlier conversation notes on how Stitch integrates.
