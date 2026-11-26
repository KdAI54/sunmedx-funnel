import { handleApiRequest, type DbAdapter } from '../server/api-handler.ts';
import {
  createInitialDb,
  ensureCatalogChannels,
  type SunmedxDatabase,
} from '../server/seed.ts';

interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
}

interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

interface AssetsFetcherLike {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsFetcherLike;
  SUNMEDX_DB?: D1DatabaseLike;
  SUNMEDX_KV?: KvNamespaceLike;
  GEMINI_API_KEY?: string;
  APP_URL?: string;
  APP_NAME?: string;
  ENVIRONMENT?: string;
}

const KV_KEY = 'sunmedx:db:v1';
const D1_ROW_ID = 'primary';
let memoryDb: SunmedxDatabase | null = null;
let d1Initialized = false;

async function ensureD1Table(d1: D1DatabaseLike): Promise<void> {
  if (d1Initialized) return;
  await d1
    .prepare(
      'CREATE TABLE IF NOT EXISTS sunmedx_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)'
    )
    .run();
  d1Initialized = true;
}

function normalizeDb(parsed: SunmedxDatabase): SunmedxDatabase {
  return {
    ...parsed,
    channels: ensureCatalogChannels(parsed.channels || []),
  };
}

function createWorkerStorage(env: Env): DbAdapter {
  return {
    async load() {
      if (env.SUNMEDX_DB) {
        try {
          await ensureD1Table(env.SUNMEDX_DB);
          const row = await env.SUNMEDX_DB.prepare(
            'SELECT payload FROM sunmedx_state WHERE id = ?'
          )
            .bind(D1_ROW_ID)
            .first<{ payload: string }>();
          if (row?.payload) {
            return normalizeDb(JSON.parse(row.payload) as SunmedxDatabase);
          }
          const seeded = createInitialDb();
          await env.SUNMEDX_DB.prepare(
            'INSERT OR REPLACE INTO sunmedx_state (id, payload, updated_at) VALUES (?, ?, ?)'
          )
            .bind(D1_ROW_ID, JSON.stringify(seeded), new Date().toISOString())
            .run();
          return seeded;
        } catch {
          // Fall through to KV or memoryDb on transient error
        }
      }
      if (env.SUNMEDX_KV) {
        try {
          const raw = await env.SUNMEDX_KV.get(KV_KEY);
          if (raw) {
            return normalizeDb(JSON.parse(raw) as SunmedxDatabase);
          }
          const seeded = createInitialDb();
          await env.SUNMEDX_KV.put(KV_KEY, JSON.stringify(seeded));
          return seeded;
        } catch {
          // Fall through to memoryDb if KV transiently errors
        }
      }
      if (!memoryDb) {
        memoryDb = createInitialDb();
      }
      return memoryDb;
    },
    async save(db) {
      const normalized = normalizeDb(db);
      memoryDb = normalized;
      if (env.SUNMEDX_DB) {
        try {
          await ensureD1Table(env.SUNMEDX_DB);
          await env.SUNMEDX_DB.prepare(
            'INSERT OR REPLACE INTO sunmedx_state (id, payload, updated_at) VALUES (?, ?, ?)'
          )
            .bind(D1_ROW_ID, JSON.stringify(normalized), new Date().toISOString())
            .run();
        } catch {
          // keep memory copy
        }
      }
      if (env.SUNMEDX_KV) {
        await env.SUNMEDX_KV.put(KV_KEY, JSON.stringify(normalized));
      }
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204 });
      }
      const storage = createWorkerStorage(env);
      const storageMode = env.SUNMEDX_DB
        ? 'cloudflare-d1'
        : env.SUNMEDX_KV
          ? 'cloudflare-kv'
          : 'memory';
      return handleApiRequest(request, storage, env.GEMINI_API_KEY, {
        environment: env.ENVIRONMENT || 'production',
        appName: env.APP_NAME || 'Sunmedx · Funnel Autopilot',
        appUrl: env.APP_URL || url.origin,
        storage: storageMode,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
