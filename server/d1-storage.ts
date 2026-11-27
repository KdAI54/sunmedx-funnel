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
}

export interface DbAdapter {
  load(): Promise<SunmedxDatabase> | SunmedxDatabase;
  save(db: SunmedxDatabase): Promise<void> | void;
  getConfigValue?(key: string): Promise<unknown | null>;
  setConfigValue?(key: string, value: unknown): Promise<void>;
  deleteConfigValue?(key: string): Promise<boolean>;
  listAllCustomConfig?(): Promise<Record<string, unknown>>;
}

const SNAPSHOT_ID = 'primary';
const KV_KEY = 'sunmedx:db:v1';

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

/**
 * Persistent storage service backed by Cloudflare D1 SQLite.
 * Maintains both the relational tables (`user_config`, `funnel_activities`)
 * and the full workspace state snapshot (`sunmedx_state`) so every CRUD
 * operation persists across Worker restarts and browser refreshes.
 */
export class D1StorageService implements DbAdapter {
  private schemaReady = false;

  constructor(private readonly d1: D1DatabaseLike) {}

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    const statements = [
      this.d1.prepare(
        'CREATE TABLE IF NOT EXISTS sunmedx_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)'
      ),
      this.d1.prepare(
        'CREATE TABLE IF NOT EXISTS user_config (config_key TEXT PRIMARY KEY, config_json TEXT NOT NULL, updated_at TEXT NOT NULL)'
      ),
      this.d1.prepare(
        'CREATE TABLE IF NOT EXISTS funnel_activities (id TEXT PRIMARY KEY, lead_id TEXT, lead_name TEXT, stage TEXT, type TEXT NOT NULL, summary TEXT NOT NULL, detail TEXT, status TEXT NOT NULL, automated INTEGER NOT NULL DEFAULT 0, created_date TEXT NOT NULL)'
      ),
      this.d1.prepare(
        'CREATE INDEX IF NOT EXISTS idx_funnel_activities_created ON funnel_activities (created_date DESC)'
      ),
      this.d1.prepare(
        'CREATE INDEX IF NOT EXISTS idx_funnel_activities_lead ON funnel_activities (lead_id)'
      ),
    ];

    if (typeof this.d1.batch === 'function') {
      await this.d1.batch(statements);
    } else {
      for (const stmt of statements) {
        await stmt.run();
      }
    }
    this.schemaReady = true;
  }

  async load(): Promise<SunmedxDatabase> {
    await this.ensureSchema();

    const row = await this.d1
      .prepare('SELECT payload FROM sunmedx_state WHERE id = ?')
      .bind(SNAPSHOT_ID)
      .first<{ payload: string }>();

    if (row?.payload) {
      const db = normalizeDb(JSON.parse(row.payload) as SunmedxDatabase);

      // Hydrate latest workspace & channels from user_config if present
      const wsRow = await this.d1
        .prepare('SELECT config_json FROM user_config WHERE config_key = ?')
        .bind('workspace')
        .first<{ config_json: string }>();
      if (wsRow?.config_json) {
        try {
          const parsedWs = JSON.parse(wsRow.config_json) as Partial<WorkspaceSettings>;
          db.workspace = { ...db.workspace, ...parsedWs, id: db.workspace.id };
        } catch {
          // keep snapshot workspace
        }
      }

      const chRow = await this.d1
        .prepare('SELECT config_json FROM user_config WHERE config_key = ?')
        .bind('channels')
        .first<{ config_json: string }>();
      if (chRow?.config_json) {
        try {
          const parsedCh = JSON.parse(chRow.config_json) as Channel[];
          if (Array.isArray(parsedCh)) {
            db.channels = ensureCatalogChannels(parsedCh);
          }
        } catch {
          // keep snapshot channels
        }
      }

      const actResult = await this.d1
        .prepare(
          'SELECT id, lead_id, lead_name, stage, type, summary, detail, status, automated, created_date FROM funnel_activities ORDER BY created_date DESC LIMIT 300'
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

  async save(db: SunmedxDatabase): Promise<void> {
    await this.ensureSchema();
    const normalized = normalizeDb(db);
    const now = new Date().toISOString();

    const statements: D1PreparedStatementLike[] = [
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

    for (const act of normalized.activities.slice(0, 300)) {
      statements.push(
        this.d1
          .prepare(
            'INSERT INTO funnel_activities (id, lead_id, lead_name, stage, type, summary, detail, status, automated, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .bind(
            act.id,
            act.lead_id || null,
            act.lead_name || null,
            act.stage || null,
            act.type || 'note',
            act.summary || 'Activity recorded',
            act.detail || '',
            act.status || 'done',
            act.automated ? 1 : 0,
            act.created_date || now
          )
      );
    }

    if (typeof this.d1.batch === 'function') {
      await this.d1.batch(statements);
    } else {
      for (const stmt of statements) {
        await stmt.run();
      }
    }
  }

  async getConfigValue(key: string): Promise<unknown | null> {
    await this.ensureSchema();
    const row = await this.d1
      .prepare('SELECT config_json FROM user_config WHERE config_key = ?')
      .bind(key)
      .first<{ config_json: string }>();
    if (!row?.config_json) return null;
    try {
      return JSON.parse(row.config_json);
    } catch {
      return null;
    }
  }

  async setConfigValue(key: string, value: unknown): Promise<void> {
    await this.ensureSchema();
    const now = new Date().toISOString();
    await this.d1
      .prepare(
        'INSERT OR REPLACE INTO user_config (config_key, config_json, updated_at) VALUES (?, ?, ?)'
      )
      .bind(key, JSON.stringify(value), now)
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
      try {
        out[row.config_key] = JSON.parse(row.config_json);
      } catch {
        // skip corrupt value
      }
    }
    return out;
  }
}

export function createWorkerStorageAdapter(env: {
  SUNMEDX_DB?: D1DatabaseLike;
  SUNMEDX_KV?: KvNamespaceLike;
}): { adapter: DbAdapter; storageMode: 'cloudflare-d1' | 'cloudflare-kv' | 'memory' } {
  if (env.SUNMEDX_DB) {
    return {
      adapter: new D1StorageService(env.SUNMEDX_DB),
      storageMode: 'cloudflare-d1',
    };
  }

  if (env.SUNMEDX_KV) {
    const kv = env.SUNMEDX_KV;
    const kvAdapter: DbAdapter = {
      async load() {
        const raw = await kv.get(KV_KEY);
        if (raw) {
          return normalizeDb(JSON.parse(raw) as SunmedxDatabase);
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
        return raw ? JSON.parse(raw) : null;
      },
      async setConfigValue(key, value) {
        await kv.put(`sunmedx:cfg:${key}`, JSON.stringify(value));
      },
      async deleteConfigValue(key) {
        const raw = await kv.get(`sunmedx:cfg:${key}`);
        if (!raw) return false;
        await kv.put(`sunmedx:cfg:${key}`, '');
        return true;
      },
    };
    return { adapter: kvAdapter, storageMode: 'cloudflare-kv' };
  }

  const memAdapter: DbAdapter = {
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
