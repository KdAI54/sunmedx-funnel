import {
  createInitialDb,
  ensureCatalogChannels,
  type SunmedxDatabase,
} from './seed.ts';
import type { Activity, Channel, WorkspaceSettings } from '../src/types/funnel.ts';

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success: boolean }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch?<T = unknown>(statements: D1PreparedStatementLike[]): Promise<T[]>;
}

export interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface DbPingResult {
  ok: boolean;
  error?: string;
}

export interface DbAdapter {
  load(): Promise<SunmedxDatabase> | SunmedxDatabase;
  save(db: SunmedxDatabase): Promise<void> | void;
  ping?(): Promise<DbPingResult>;
  getConfigValue?(key: string): Promise<unknown | null>;
  setConfigValue?(key: string, value: unknown): Promise<void>;
  deleteConfigValue?(key: string): Promise<boolean>;
  listAllCustomConfig?(): Promise<Record<string, unknown>>;
}

const SNAPSHOT_ID = 'primary';
const KV_KEY = 'sunmedx:db:v1';

// Deduplicate schema bootstrap across concurrent Worker requests in the same isolate
const schemaInitializedDbs = new WeakSet<object>();
const schemaInFlight = new WeakMap<object, Promise<void>>();

// Process-level memory fallback only when neither D1 nor KV is bound
let ephemeralMemoryDb: SunmedxDatabase | null = null;
const ephemeralConfigMap = new Map<string, unknown>();

function normalizeDb(parsed: Partial<SunmedxDatabase> | null | undefined): SunmedxDatabase {
  const base = createInitialDb();
  if (!parsed || typeof parsed !== 'object') return base;
  return {
    workspace: parsed.workspace
      ? { ...base.workspace, ...parsed.workspace, id: base.workspace.id }
      : base.workspace,
    leads: Array.isArray(parsed.leads) ? parsed.leads : [],
    approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [],
    activities: Array.isArray(parsed.activities) ? parsed.activities : [],
    automations:
      Array.isArray(parsed.automations) && parsed.automations.length > 0
        ? parsed.automations
        : base.automations,
    channels: ensureCatalogChannels(Array.isArray(parsed.channels) ? parsed.channels : []),
    campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
    content: Array.isArray(parsed.content) ? parsed.content : [],
    experiments: Array.isArray(parsed.experiments) ? parsed.experiments : [],
  };
}

function safeJsonParse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Persistent storage service backed by Cloudflare D1 SQLite.
 * Maintains both the relational tables (`user_config`, `funnel_activities`)
 * and the full workspace state snapshot (`sunmedx_state`) so every CRUD
 * operation persists across Worker restarts and browser refreshes.
 */
export class D1StorageService implements DbAdapter {
  constructor(private readonly d1: D1DatabaseLike) {}

  async ensureSchema(): Promise<void> {
    if (schemaInitializedDbs.has(this.d1)) return;

    const existing = schemaInFlight.get(this.d1);
    if (existing) {
      await existing;
      return;
    }

    const job = (async () => {
      const ddlQueries = [
        'CREATE TABLE IF NOT EXISTS sunmedx_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)',
        'CREATE TABLE IF NOT EXISTS user_config (config_key TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL)',
        'CREATE TABLE IF NOT EXISTS funnel_activities (id TEXT PRIMARY KEY, lead_id TEXT, lead_name TEXT, stage TEXT, type TEXT NOT NULL, summary TEXT NOT NULL, detail TEXT, status TEXT NOT NULL, automated INTEGER NOT NULL DEFAULT 0, created_date TEXT NOT NULL)',
        'CREATE INDEX IF NOT EXISTS idx_funnel_activities_created ON funnel_activities (created_date DESC)',
        'CREATE INDEX IF NOT EXISTS idx_funnel_activities_lead ON funnel_activities (lead_id)',
      ];

      if (typeof this.d1.batch === 'function') {
        try {
          await this.d1.batch(ddlQueries.map((q) => this.d1.prepare(q)));
        } catch {
          // Fallback to sequential DDL if batch DDL is rejected by an older/custom runtime
          for (const q of ddlQueries) {
            await this.d1.prepare(q).run();
          }
        }
      } else {
        for (const q of ddlQueries) {
          await this.d1.prepare(q).run();
        }
      }
      schemaInitializedDbs.add(this.d1);
    })();

    schemaInFlight.set(this.d1, job);
    try {
      await job;
    } finally {
      schemaInFlight.delete(this.d1);
    }
  }

  async ping(): Promise<DbPingResult> {
    try {
      await this.ensureSchema();
      await this.d1.prepare('SELECT 1 AS ok').first<{ ok: number }>();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'D1 query failed',
      };
    }
  }

  async load(): Promise<SunmedxDatabase> {
    await this.ensureSchema();

    const row = await this.d1
      .prepare('SELECT payload FROM sunmedx_state WHERE id = ?')
      .bind(SNAPSHOT_ID)
      .first<{ payload: string }>();

    if (row?.payload) {
      const parsedSnapshot = safeJsonParse<Partial<SunmedxDatabase>>(row.payload);
      const db = normalizeDb(parsedSnapshot);

      // Hydrate latest workspace & channels from user_config if present
      const wsRow = await this.d1
        .prepare('SELECT config_json FROM user_config WHERE config_key = ?')
        .bind('workspace')
        .first<{ config_json: string }>();
      const parsedWs = safeJsonParse<Partial<WorkspaceSettings>>(wsRow?.config_json);
      if (parsedWs && typeof parsedWs === 'object') {
        db.workspace = { ...db.workspace, ...parsedWs, id: db.workspace.id };
      }

      const chRow = await this.d1
        .prepare('SELECT config_json FROM user_config WHERE config_key = ?')
        .bind('channels')
        .first<{ config_json: string }>();
      const parsedCh = safeJsonParse<Channel[]>(chRow?.config_json);
      if (Array.isArray(parsedCh)) {
        db.channels = ensureCatalogChannels(parsedCh);
      }

      const actResult = await this.d1
        .prepare(
          'SELECT id, lead_id, lead_name, stage, type, summary, detail, status, automated, created_date FROM funnel_activities ORDER BY created_date DESC LIMIT 120'
        )
        .all<{
          id: string;
          lead_id: string | null;
          lead_name: string | null;
          stage: string | null;
          type: string;
          summary: string;
          detail: string | null;
          status: string;
          automated: number;
          created_date: string;
        }>();

      if (Array.isArray(actResult?.results) && actResult.results.length > 0) {
        db.activities = actResult.results.map((r) => ({
          id: r.id,
          lead_id: r.lead_id || undefined,
          lead_name: r.lead_name || undefined,
          stage: (r.stage as Activity['stage']) || undefined,
          type: (r.type as Activity['type']) || 'note',
          summary: r.summary,
          detail: r.detail || '',
          status: r.status === 'queued' ? 'queued' : 'done',
          automated: Boolean(r.automated),
          created_date: r.created_date,
        }));
      }

      return db;
    }

    const seeded = createInitialDb();
    await this.save(seeded);
    return seeded;
  }

  private async runStatements(statements: D1PreparedStatementLike[]): Promise<void> {
    if (statements.length === 0) return;
    if (typeof this.d1.batch === 'function') {
      // Chunk batches to stay well within Cloudflare D1 statement limits per batch
      const CHUNK = 40;
      for (let i = 0; i < statements.length; i += CHUNK) {
        await this.d1.batch(statements.slice(i, i + CHUNK));
      }
    } else {
      for (const stmt of statements) {
        await stmt.run();
      }
    }
  }

  async save(db: SunmedxDatabase): Promise<void> {
    await this.ensureSchema();
    const normalized = normalizeDb(db);
    const now = new Date().toISOString();

    const coreStatements: D1PreparedStatementLike[] = [
      this.d1
        .prepare(
          'INSERT OR REPLACE INTO sunmedx_state (id, payload, updated_at) VALUES (?, ?, ?)'
        )
        .bind(SNAPSHOT_ID, JSON.stringify(normalized), now),
      this.d1
        .prepare(
          'INSERT OR REPLACE INTO user_config (config_key, config_json, updated_at) VALUES (?, ?, ?)'
        )
        .bind('workspace', JSON.stringify(normalized.workspace), now),
      this.d1
        .prepare(
          'INSERT OR REPLACE INTO user_config (config_key, config_json, updated_at) VALUES (?, ?, ?)'
        )
        .bind('channels', JSON.stringify(normalized.channels), now),
      this.d1.prepare('DELETE FROM funnel_activities'),
    ];

    const activityStatements: D1PreparedStatementLike[] = [];
    for (const act of normalized.activities.slice(0, 120)) {
      activityStatements.push(
        this.d1
          .prepare(
            'INSERT OR REPLACE INTO funnel_activities (id, lead_id, lead_name, stage, type, summary, detail, status, automated, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            String(act.id),
            act.lead_id ? String(act.lead_id) : null,
            act.lead_name ? String(act.lead_name) : null,
            act.stage ? String(act.stage) : null,
            String(act.type || 'note'),
            String(act.summary || 'Activity recorded'),
            String(act.detail || ''),
            String(act.status || 'done'),
            act.automated ? 1 : 0,
            String(act.created_date || now)
          )
      );
    }

    await this.runStatements([...coreStatements, ...activityStatements]);
  }

  async getConfigValue(key: string): Promise<unknown | null> {
    await this.ensureSchema();
    const row = await this.d1
      .prepare('SELECT config_json FROM user_config WHERE config_key = ?')
      .bind(key)
      .first<{ config_json: string }>();
    if (!row?.config_json) return null;
    return safeJsonParse<unknown>(row.config_json);
  }

  async setConfigValue(key: string, value: unknown): Promise<void> {
    await this.ensureSchema();
    const now = new Date().toISOString();
    const serialized = JSON.stringify(value === undefined ? null : value);
    await this.d1
      .prepare(
        'INSERT OR REPLACE INTO user_config (config_key, config_json, updated_at) VALUES (?, ?, ?)'
      )
      .bind(key, serialized, now)
      .run();
  }

  async deleteConfigValue(key: string): Promise<boolean> {
    await this.ensureSchema();
    const existing = await this.getConfigValue(key);
    if (existing === null) return false;
    await this.d1
      .prepare('DELETE FROM user_config WHERE config_key = ?')
      .bind(key)
      .run();
    return true;
  }

  async listAllCustomConfig(): Promise<Record<string, unknown>> {
    await this.ensureSchema();
    const res = await this.d1
      .prepare('SELECT config_key, config_json FROM user_config')
      .all<{ config_key: string; config_json: string }>();
    const out: Record<string, unknown> = {};
    for (const row of res?.results || []) {
      if (row.config_key === 'workspace' || row.config_key === 'channels') continue;
      const parsed = safeJsonParse<unknown>(row.config_json);
      if (parsed !== null) {
        out[row.config_key] = parsed;
      }
    }
    return out;
  }
}

function isD1Like(val: unknown): val is D1DatabaseLike {
  return Boolean(
    val &&
      typeof val === 'object' &&
      typeof (val as D1DatabaseLike).prepare === 'function'
  );
}

function isKvLike(val: unknown): val is KvNamespaceLike {
  return Boolean(
    val &&
      typeof val === 'object' &&
      typeof (val as KvNamespaceLike).get === 'function' &&
      typeof (val as KvNamespaceLike).put === 'function'
  );
}

function findD1Binding(env: Record<string, unknown>): D1DatabaseLike | null {
  if (isD1Like(env.SUNMEDX_DB)) return env.SUNMEDX_DB;
  if (isD1Like(env.DB)) return env.DB;
  for (const [key, val] of Object.entries(env)) {
    if (key === 'ASSETS') continue;
    if (isD1Like(val)) return val;
  }
  return null;
}

function findKvBinding(env: Record<string, unknown>): KvNamespaceLike | null {
  if (isKvLike(env.SUNMEDX_KV)) return env.SUNMEDX_KV;
  if (isKvLike(env.KV)) return env.KV;
  for (const [key, val] of Object.entries(env)) {
    if (key === 'ASSETS') continue;
    if (isKvLike(val)) return val;
  }
  return null;
}

export function createWorkerStorageAdapter(env: {
  SUNMEDX_DB?: D1DatabaseLike;
  DB?: D1DatabaseLike;
  SUNMEDX_KV?: KvNamespaceLike;
  KV?: KvNamespaceLike;
  [key: string]: unknown;
}): { adapter: DbAdapter; storageMode: 'cloudflare-d1' | 'cloudflare-kv' | 'memory' } {
  const d1 = findD1Binding(env);
  if (d1) {
    return {
      adapter: new D1StorageService(d1),
      storageMode: 'cloudflare-d1',
    };
  }

  const kv = findKvBinding(env);
  if (kv) {
    const kvAdapter: DbAdapter = {
      async ping() {
        try {
          await kv.get(KV_KEY);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'KV read failed',
          };
        }
      },
      async load() {
        const raw = await kv.get(KV_KEY);
        if (raw) {
          return normalizeDb(safeJsonParse<Partial<SunmedxDatabase>>(raw));
        }
        const seeded = createInitialDb();
        await kv.put(KV_KEY, JSON.stringify(seeded));
        return seeded;
      },
      async save(db) {
        await kv.put(KV_KEY, JSON.stringify(normalizeDb(db)));
      },
      async getConfigValue(key) {
        const raw = await kv.get(`sunmedx:cfg:${key}`);
        return safeJsonParse<unknown>(raw);
      },
      async setConfigValue(key, value) {
        await kv.put(
          `sunmedx:cfg:${key}`,
          JSON.stringify(value === undefined ? null : value)
        );
      },
      async deleteConfigValue(key) {
        const raw = await kv.get(`sunmedx:cfg:${key}`);
        if (!raw) return false;
        if (typeof kv.delete === 'function') {
          await kv.delete(`sunmedx:cfg:${key}`);
        } else {
          await kv.put(`sunmedx:cfg:${key}`, '');
        }
        return true;
      },
    };
    return { adapter: kvAdapter, storageMode: 'cloudflare-kv' };
  }

  const memAdapter: DbAdapter = {
    async ping() {
      return { ok: true };
    },
    load() {
      if (!ephemeralMemoryDb) {
        ephemeralMemoryDb = createInitialDb();
      }
      return ephemeralMemoryDb;
    },
    save(db) {
      ephemeralMemoryDb = normalizeDb(db);
    },
    async getConfigValue(key) {
      return ephemeralConfigMap.has(key) ? ephemeralConfigMap.get(key)! : null;
    },
    async setConfigValue(key, value) {
      ephemeralConfigMap.set(key, value);
    },
    async deleteConfigValue(key) {
      return ephemeralConfigMap.delete(key);
    },
    async listAllCustomConfig() {
      return Object.fromEntries(ephemeralConfigMap.entries());
    },
  };

  return { adapter: memAdapter, storageMode: 'memory' };
}
