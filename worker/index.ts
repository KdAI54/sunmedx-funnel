import { handleApiRequest, type DbAdapter } from '../server/api-handler.ts';
import { createInitialDb, type SunmedxDatabase } from '../server/seed.ts';

interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface AssetsFetcherLike {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsFetcherLike;
  SUNMEDX_KV?: KvNamespaceLike;
  GEMINI_API_KEY?: string;
}

const KV_KEY = 'sunmedx:db:v1';
let memoryDb: SunmedxDatabase | null = null;

function createWorkerStorage(env: Env): DbAdapter {
  return {
    async load() {
      if (env.SUNMEDX_KV) {
        try {
          const raw = await env.SUNMEDX_KV.get(KV_KEY);
          if (raw) {
            return JSON.parse(raw) as SunmedxDatabase;
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
      memoryDb = db;
      if (env.SUNMEDX_KV) {
        await env.SUNMEDX_KV.put(KV_KEY, JSON.stringify(db));
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
      return handleApiRequest(request, storage, env.GEMINI_API_KEY);
    }

    return env.ASSETS.fetch(request);
  },
};
