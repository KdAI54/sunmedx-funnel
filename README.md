# Sunmedx · Funnel Autopilot

Full-stack AI-driven funnel console and public landing page built with React, Vite, TypeScript, and Gemini (`@google/genai`).

Runs both on **Node / Express** (`npm run dev`, `npm start`) and **Cloudflare Workers with Static Assets** (`wrangler.jsonc` + `worker/index.ts`).

## Cloudflare Environment Variables & Secrets

Non-secret runtime variables are pre-configured in `wrangler.jsonc` (`vars`):
- `ENVIRONMENT` (`"production"`)
- `APP_NAME` (`"Sunmedx · Funnel Autopilot"`)
- `APP_URL` (`"https://sunmedx-funnel-autopilot.workers.dev"` — update to your custom domain or workers.dev URL if different)

Secrets & Storage Bindings to set in Cloudflare Dashboard (**Workers & Pages → Settings**):
- **Variables and Secrets (Runtime — NOT Build variables)**:
  - `BREVO_API_KEY` (Secret) — required for live transactional emails (welcome/blueprint emails from the Lead Magnet form, approved offers/replies in **Approvals**, and **Send test email**).
  - `BREVO_SENDER_EMAIL` *(recommended)* — must be an active **Verified Sender** (or verified domain email) in your Brevo account under **Senders, Domains & Dedicated IPs**. If omitted, Sunmedx checks your Brevo Channel Wizard `sender_email` or auto-queries your verified Brevo senders list.
  - `BREVO_SENDER_NAME` *(optional)* — defaults to your workspace brand (`Sunmedx`).
  - `RESEND_API_KEY` *(optional fallback if Brevo is omitted)*.
  - `GEMINI_API_KEY` (Secret) for live Gemini responses (deterministic fallbacks run if omitted).
  - Additional social/email platform tokens shown in each Setup Wizard (e.g. `PINTEREST_ACCESS_TOKEN`, `INSTAGRAM_ACCESS_TOKEN`, `MAILCHIMP_API_KEY`, `KLAVIYO_API_KEY`, `KIT_API_KEY`).
- **Persistent Cloudflare Storage (choose KV or D1)**:
  - **Option 1 — Cloudflare KV (`SUNMEDX_KV`)**: Create a KV namespace (`npx wrangler kv namespace create SUNMEDX_KV`) and attach it under **Settings → Bindings** with variable name `SUNMEDX_KV` (or uncomment `kv_namespaces` in `wrangler.jsonc`).
  - **Option 2 — Cloudflare D1 SQLite (`SUNMEDX_DB`)**: Create a D1 database (`npx wrangler d1 create sunmedx-db`) and attach it under **Settings → Bindings** with variable name `SUNMEDX_DB` (or uncomment `d1_databases` in `wrangler.jsonc`). The Worker auto-creates the `sunmedx_state` table on first load.

For local Wrangler testing, copy `.dev.vars.example` to `.dev.vars` and fill in your keys.

### Why emails might not send yet after adding a Brevo variable in Cloudflare
1. **Added under Build Variables instead of Runtime Variables & Secrets**: Ensure `BREVO_API_KEY` is added in **Workers & Pages → your worker → Settings → Variables and Secrets** (under Runtime), then click **Deploy / Redeploy** so the live Worker loads it. Verify live detection inside the app under **Approvals** or **Channels** (`Brevo API active` badge).
2. **Sender email not verified in Brevo**: Brevo rejects `/v3/smtp/email` sends unless `sender.email` matches a verified sender or authenticated domain in Brevo. Set that verified email in the **Brevo Setup Wizard** or as `BREVO_SENDER_EMAIL`.

## Deploy to Cloudflare through GitHub

### Option A — Cloudflare Dashboard Git Integration (Recommended)
1. Push this repository to GitHub.
2. In the Cloudflare Dashboard, open **Workers & Pages → Create → Import a repository** and select your GitHub repo.
3. Cloudflare reads `wrangler.jsonc` automatically:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
4. Add `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `GEMINI_API_KEY` under **Settings → Variables and Secrets** and bind `SUNMEDX_KV` or `SUNMEDX_DB` under **Settings → Bindings**.

### Option B — GitHub Actions CI/CD
The included workflow `.github/workflows/deploy-cloudflare.yml` automatically typechecks, builds, and deploys on every push to `main`.
Add these secrets in your GitHub repository (**Settings → Secrets and variables → Actions**):
- `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit permission)
- `CLOUDFLARE_ACCOUNT_ID`
- `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `RESEND_API_KEY`, `GEMINI_API_KEY` *(optional — automatically synced to the Worker if provided)*

