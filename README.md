# Sunmedx · Funnel Autopilot

Full-stack AI-driven funnel console and public landing page built with React, Vite, TypeScript, and Gemini (`@google/genai`).

Runs both on **Node / Express** (`npm run dev`, `npm start`) and **Cloudflare Workers with Static Assets** (`wrangler.jsonc` + `worker/index.ts`).

## Cloudflare Environment Variables & Secrets

Non-secret runtime variables are pre-configured in `wrangler.jsonc` (`vars`):
- `ENVIRONMENT` (`"production"`)
- `APP_NAME` (`"Sunmedx · Funnel Autopilot"`)
- `APP_URL` (`"https://sunmedx-funnel-autopilot.workers.dev"` — update to your custom domain or workers.dev URL if different)

Secrets & Bindings to set in Cloudflare Dashboard (**Workers & Pages → Settings**):
- **Variables and Secrets**: Add `GEMINI_API_KEY` (Secret) for live Gemini responses (deterministic fallbacks run if omitted).
- **Bindings (Optional)**: Bind a Workers KV namespace named `SUNMEDX_KV` for cross-request persistence across edge isolates.

For local Wrangler testing, copy `.dev.vars.example` to `.dev.vars` and fill in your key.

## Deploy to Cloudflare through GitHub

### Option A — Cloudflare Dashboard Git Integration (Recommended)
1. Push this repository to GitHub.
2. In the Cloudflare Dashboard, open **Workers & Pages → Create → Import a repository** and select your GitHub repo.
3. Cloudflare reads `wrangler.jsonc` automatically:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
4. Add `GEMINI_API_KEY` under **Settings → Variables and Secrets** and optionally bind `SUNMEDX_KV` under **Settings → Bindings**.

### Option B — GitHub Actions CI/CD
The included workflow `.github/workflows/deploy-cloudflare.yml` automatically typechecks, builds, and deploys on every push to `main`.
Add these secrets in your GitHub repository (**Settings → Secrets and variables → Actions**):
- `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit permission)
- `CLOUDFLARE_ACCOUNT_ID`
- `GEMINI_API_KEY` *(optional — automatically synced to the Worker if provided)*
