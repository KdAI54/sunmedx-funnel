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
  SUNMEDX_KV?: KvNamespaceLike;
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204 });
      }
      const { adapter, storageMode } = createWorkerStorageAdapter(env);
      return handleApiRequest(request, adapter, env.GEMINI_API_KEY, {
        environment: env.ENVIRONMENT || 'production',
        appName: env.APP_NAME || 'Sunmedx · Funnel Autopilot',
        appUrl: env.APP_URL || url.origin,
        storage: storageMode,
        brevoApiKey: env.BREVO_API_KEY || env.BREVO_KEY,
        brevoSenderEmail: env.BREVO_SENDER_EMAIL || env.SENDER_EMAIL,
        brevoSenderName: env.BREVO_SENDER_NAME,
        resendApiKey: env.RESEND_API_KEY,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
