import { handleApiRequest } from '../server/api-handler.ts';
import {
  createWorkerStorageAdapter,
  type D1DatabaseLike,
  type KvNamespaceLike,
} from '../server/d1-storage.ts';

interface AssetsFetcherLike {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: AssetsFetcherLike;
  SUNMEDX_DB?: D1DatabaseLike;
  DB?: D1DatabaseLike;
  SUNMEDX_KV?: KvNamespaceLike;
  KV?: KvNamespaceLike;
  GEMINI_API_KEY?: string;
  BREVO_API_KEY?: string;
  BREVO_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  SENDER_EMAIL?: string;
  RESEND_API_KEY?: string;
  APP_URL?: string;
  APP_NAME?: string;
  ENVIRONMENT?: string;
  [key: string]: unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204 });
      }
      try {
        const { adapter, storageMode } = createWorkerStorageAdapter(env);
        return await handleApiRequest(request, adapter, env.GEMINI_API_KEY, {
          environment: env.ENVIRONMENT || 'production',
          appName: env.APP_NAME || 'Sunmedx · Funnel Autopilot',
          appUrl: env.APP_URL || url.origin,
          storage: storageMode,
          brevoApiKey: env.BREVO_API_KEY || env.BREVO_KEY,
          brevoSenderEmail: env.BREVO_SENDER_EMAIL || env.SENDER_EMAIL,
          brevoSenderName: env.BREVO_SENDER_NAME,
          resendApiKey: env.RESEND_API_KEY,
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: err instanceof Error ? err.message : 'Worker API error',
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          }
        );
      }
    }

    try {
      return await env.ASSETS.fetch(request);
    } catch {
      const indexUrl = new URL('/index.html', url.origin);
      return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    }
  },
};
