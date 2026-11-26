# Sunmedx · Funnel Autopilot

Full-stack AI-driven funnel console and public landing page built with React, Vite, TypeScript, and Gemini (`@google/genai`).

Runs both on **Node / Express** (`npm run dev`, `npm start`) and **Cloudflare Workers with Static Assets** (`wrangler.jsonc` + `worker/index.ts`).

## Cloudflare Environment Variables & Secrets

Non-secret runtime variables are pre-configured in `wrangler.jsonc` (`vars`):
- `ENVIRONMENT` (`"production"`)
- `APP_NAME` (`"Sunmedx · Funnel Autopilot"`)
- `APP_URL` (`"https://sunmedx-funnel-autopilot.workers.dev"` — update to your custom domain or workers.dev URL if different)

Secrets & Storage Bindings to set in Cloudflare Dashboard (**Workers & Pages → Settings**):
- **Variables and Secrets**: Add `GEMINI_API_KEY` (Secret) for live Gemini responses (deterministic fallbacks run if omitted). When activating live social/email publishing in the Setup Wizards, add the corresponding token secret shown inside the wizard (e.g. `PINTEREST_ACCESS_TOKEN`, `BREVO_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`, `MAILCHIMP_API_KEY`, `KLAVIYO_API_KEY`, `KIT_API_KEY`, `RESEND_API_KEY`).
- **Persistent Cloudflare Storage (choose KV or D1)**:
  - **Option 1 — Cloudflare KV (`SUNMEDX_KV`)**: Create a KV namespace (`npx wrangler kv namespace create SUNMEDX_KV`) and attach it under **Settings → Bindings** with variable name `SUNMEDX_KV` (or uncomment `kv_namespaces` in `wrangler.jsonc`).
  - **Option 2 — Cloudflare D1 SQLite (`SUNMEDX_DB`)**: Create a D1 database (`npx wrangler d1 create sunmedx-db`) and attach it under **Settings → Bindings** with variable name `SUNMEDX_DB` (or uncomment `d1_databases` in `wrangler.jsonc`). The Worker auto-creates the `sunmedx_state` table on first load.

For local Wrangler testing, copy `.dev.vars.example` to `.dev.vars` and fill in your key.

## Deploy to Cloudflare through GitHub

### Option A — Cloudflare Dashboard Git Integration (Recommended)
1. Push this repository to GitHub.
2. In the Cloudflare Dashboard, open **Workers & Pages → Create → Import a repository** and select your GitHub repo.
3. Cloudflare reads `wrangler.jsonc` automatically:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
4. Add `GEMINI_API_KEY` under **Settings → Variables and Secrets** and bind `SUNMEDX_KV` or `SUNMEDX_DB` under **Settings → Bindings**.

### Option B — GitHub Actions CI/CD
The included workflow `.github/workflows/deploy-cloudflare.yml` automatically typechecks, builds, and deploys on every push to `main`.
Add these secrets in your GitHub repository (**Settings → Secrets and variables → Actions**):
- `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit permission)
- `CLOUDFLARE_ACCOUNT_ID`
- `GEMINI_API_KEY` *(optional — automatically synced to the Worker if provided)*
