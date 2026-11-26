# Sunmedx · Funnel Autopilot

Full-stack AI-driven funnel console and public landing page built with React, Vite, TypeScript, and Gemini (`@google/genai`).

Runs both on **Node / Express** (`npm run dev`, `npm start`) and **Cloudflare Workers with Static Assets** (`wrangler.jsonc` + `worker/index.ts`).

## Deploy to Cloudflare through GitHub

### Option A — Cloudflare Dashboard Git Integration (Recommended)
1. Push this repository to GitHub.
2. In the Cloudflare Dashboard, open **Workers & Pages → Create → Import a repository** and select your GitHub repo.
3. Cloudflare reads `wrangler.jsonc` automatically:
   - **Build command**: `npm run build`
   - **Deploy command**: `npx wrangler deploy`
4. *(Optional)* Add `GEMINI_API_KEY` under **Settings → Variables and Secrets** for live Gemini responses (the app includes deterministic fallbacks if omitted).
5. *(Optional)* Bind a Workers KV namespace named `SUNMEDX_KV` under **Settings → Bindings** for cross-request persistence across edge isolates (defaults to in-memory seed state when unbound).

### Option B — GitHub Actions CI/CD
The included workflow `.github/workflows/deploy-cloudflare.yml` automatically typechecks, builds, and deploys on every push to `main`.
Add these two secrets in your GitHub repository (**Settings → Secrets and variables → Actions**):
- `CLOUDFLARE_API_TOKEN` (Workers Scripts Edit permission)
- `CLOUDFLARE_ACCOUNT_ID`
