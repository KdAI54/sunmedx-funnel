-- Cloudflare D1 initial schema for Sunmedx Funnel Autopilot
-- Apply manually with `npx wrangler d1 migrations apply sunmedx-db --remote`
-- (Note: server/d1-storage.ts also auto-creates these tables if not yet present.)

CREATE TABLE IF NOT EXISTS sunmedx_state (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_config (
  config_key TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS funnel_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  lead_name TEXT,
  stage TEXT,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT,
  status TEXT NOT NULL,
  automated INTEGER NOT NULL DEFAULT 0,
  created_date TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funnel_activities_created
  ON funnel_activities (created_date DESC);

CREATE INDEX IF NOT EXISTS idx_funnel_activities_lead
  ON funnel_activities (lead_id);
