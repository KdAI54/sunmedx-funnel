import type {
  Activity,
  Approval,
  Automation,
  Campaign,
  Channel,
  ContentPiece,
  Experiment,
  Lead,
  OfferItem,
  WorkspaceSettings,
} from '../types/funnel';

export interface AppStateSnapshot {
  workspace: WorkspaceSettings;
  leads: Lead[];
  approvals: Approval[];
  activities: Activity[];
  automations: Automation[];
  channels: Channel[];
  campaigns: Campaign[];
  content: ContentPiece[];
  experiments: Experiment[];
}

export interface HealthStatus {
  ok: boolean;
  service: string;
  environment: string;
  storage: string;
  cloudflarePersistent?: boolean;
  aiConfigured: boolean;
  brevoConfigured?: boolean;
  resendConfigured?: boolean;
  emailConfigured?: boolean;
  emailProvider?: 'brevo' | 'resend' | 'none';
  senderEmailConfigured?: boolean;
  brevoSenderEmail?: string;
}

const MIRROR_KEY = 'sx-cloud-mirror-v1';

interface StoredMirror {
  state: AppStateSnapshot;
  workspaceEdited?: boolean;
  updatedAt: number;
}

function readMirror(): StoredMirror | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MIRROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredMirror;
    if (parsed && parsed.state && typeof parsed.state === 'object') {
      return parsed;
    }
  } catch {
    // ignore corrupt mirror
  }
  return null;
}

function writeMirror(state: AppStateSnapshot, workspaceEdited = false): void {
  if (typeof window === 'undefined') return;
  try {
    const prev = readMirror();
    const payload: StoredMirror = {
      state,
      workspaceEdited: workspaceEdited || Boolean(prev?.workspaceEdited),
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(MIRROR_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

function hasUserData(state: Partial<AppStateSnapshot> | null | undefined): boolean {
  if (!state) return false;
  const hasCollections =
    (state.leads?.length || 0) > 0 ||
    (state.campaigns?.length || 0) > 0 ||
    (state.content?.length || 0) > 0 ||
    (state.experiments?.length || 0) > 0 ||
    (state.approvals?.length || 0) > 0 ||
    (state.activities?.length || 0) > 0;
  const hasConfiguredChannel = (state.channels || []).some(
    (c) =>
      c.kind !== 'web' &&
      (c.connected ||
        c.wizard_completed ||
        Boolean(c.handle?.trim()) ||
        Boolean(c.account_id?.trim()) ||
        Boolean(c.sender_email?.trim()))
  );
  const hasAutoRuns = (state.automations || []).some((a) => (a.run_count || 0) > 0);
  return hasCollections || hasConfiguredChannel || hasAutoRuns;
}

export async function syncMirrorFromServer(workspaceEdited = false): Promise<void> {
  try {
    const res = await fetch('/api/state', {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return;
    const state = (await res.json()) as AppStateSnapshot;
    writeMirror(state, workspaceEdited);
  } catch {
    // ignore transient offline error
  }
}

let hydrationPromise: Promise<boolean> | null = null;

export function hydrateServerFromMirrorIfEmpty(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (hydrationPromise) return hydrationPromise;
  hydrationPromise = (async () => {
    try {
      const mirror = readMirror();
      const [healthRes, res] = await Promise.all([
        fetch('/api/health', { headers: { 'Content-Type': 'application/json' } }).catch(() => null),
        fetch('/api/state', { headers: { 'Content-Type': 'application/json' } }),
      ]);
      if (!res.ok) return false;
      const health = healthRes?.ok
        ? ((await healthRes.json().catch(() => null)) as HealthStatus | null)
        : null;
      const server = (await res.json()) as AppStateSnapshot;

      // When Cloudflare D1 or KV is bound, server persistence is authoritative across refreshes
      if (health?.cloudflarePersistent) {
        writeMirror(server, Boolean(mirror?.workspaceEdited));
        return false;
      }

      const serverHasData = hasUserData(server);
      const mirrorHasData =
        Boolean(mirror?.state) &&
        (hasUserData(mirror?.state) || Boolean(mirror?.workspaceEdited));

      if (!serverHasData && mirrorHasData && mirror) {
        const putRes = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mirror.state),
        });
        return putRes.ok;
      }

      if (serverHasData) {
        writeMirror(server, Boolean(mirror?.workspaceEdited));
      }
      return false;
    } catch {
      return false;
    }
  })();
  return hydrationPromise;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  const method = (init?.method || 'GET').toUpperCase();
  if (method !== 'GET' && url !== '/api/state') {
    const workspaceEdited =
      url === '/api/workspace' ||
      url === '/api/config' ||
      url.startsWith('/api/config/');
    void syncMirrorFromServer(workspaceEdited);
  }
  return data as T;
}

export const api = {
  health: () => request<HealthStatus>('/api/health'),

  state: {
    get: () => request<AppStateSnapshot>('/api/state'),
    restore: (snapshot: Partial<AppStateSnapshot>) =>
      request<{ ok: boolean; state: AppStateSnapshot }>('/api/state', {
        method: 'PUT',
        body: JSON.stringify(snapshot),
      }),
  },

  brand: () =>
    request<{
      brand: {
        brand: string;
        headline: string;
        subhead: string;
        greeting: string;
        offers: OfferItem[];
      };
    }>('/api/brand'),

  workspace: {
    get: () => request<WorkspaceSettings>('/api/workspace'),
    save: (body: Partial<WorkspaceSettings>) =>
      request<WorkspaceSettings>('/api/workspace', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
  },

  config: {
    getAll: () =>
      request<{
        workspace: WorkspaceSettings;
        channels: Channel[];
        custom: Record<string, unknown>;
        storage: string;
      }>('/api/config'),
    get: <T = unknown>(key: string) =>
      request<{ key: string; value: T }>(`/api/config/${encodeURIComponent(key)}`),
    save: (payload: {
      workspace?: Partial<WorkspaceSettings>;
      channels?: Partial<Channel>[];
      custom?: Record<string, unknown>;
    }) =>
      request<{
        ok: boolean;
        workspace: WorkspaceSettings;
        channels: Channel[];
        custom: Record<string, unknown>;
      }>('/api/config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    set: <T = unknown>(key: string, value: T) =>
      request<{ ok: boolean; key: string; value: T }>(
        `/api/config/${encodeURIComponent(key)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ value }),
        }
      ),
    remove: (key: string) =>
      request<{ ok: boolean; deleted: boolean; key: string }>(
        `/api/config/${encodeURIComponent(key)}`,
        { method: 'DELETE' }
      ),
  },

  leads: {
    list: (sort = '-created_date') =>
      request<{ items: Lead[] }>(`/api/leads?sort=${encodeURIComponent(sort)}`),
    get: (id: string) => request<Lead>(`/api/leads/${encodeURIComponent(id)}`),
    create: (body: Partial<Lead>) =>
      request<Lead>('/api/leads', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<Lead>) =>
      request<Lead>(`/api/leads/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  approvals: {
    list: (status?: string) =>
      request<{ items: Approval[] }>(
        `/api/approvals${status ? `?status=${encodeURIComponent(status)}` : ''}`
      ),
    update: (id: string, body: Partial<Approval>) =>
      request<Approval>(`/api/approvals/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    send: (id: string, body: { subject: string; body: string }) =>
      request<{
        ok: boolean;
        provider?: string;
        messageId?: string;
        senderEmail?: string;
        error?: string;
        approval?: Approval;
      }>(`/api/approvals/${encodeURIComponent(id)}/send`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  email: {
    test: (body: {
      toEmail: string;
      senderEmail?: string;
      subject?: string;
      body?: string;
    }) =>
      request<{
        ok: boolean;
        provider: string;
        messageId?: string;
        senderEmail?: string;
        error?: string;
      }>('/api/email/test', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },

  activities: {
    list: (opts?: { lead_id?: string; status?: string; type?: string; limit?: number }) => {
      const params = new URLSearchParams();
      if (opts?.lead_id) params.set('lead_id', opts.lead_id);
      if (opts?.status) params.set('status', opts.status);
      if (opts?.type && opts.type !== 'all') params.set('type', opts.type);
      if (opts?.limit) params.set('limit', String(opts.limit));
      const qs = params.toString();
      return request<{ items: Activity[] }>(`/api/activities${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) =>
      request<Activity>(`/api/activities/${encodeURIComponent(id)}`),
    create: (body: Partial<Activity>) =>
      request<Activity>('/api/activities', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<Activity>) =>
      request<Activity>(`/api/activities/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    remove: (id: string) =>
      request<{ ok: boolean; deleted: boolean; id: string }>(
        `/api/activities/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      ),
  },

  automations: {
    list: () => request<{ items: Automation[] }>('/api/automations'),
    update: (id: string, body: Partial<Automation>) =>
      request<Automation>(`/api/automations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  channels: {
    list: (enabledOnly = false) =>
      request<{ items: Channel[] }>(
        `/api/channels${enabledOnly ? '?enabled=true' : ''}`
      ),
    connections: () => request<Record<string, boolean>>('/api/channels/connections'),
    saveBulk: (channels: Partial<Channel>[]) =>
      request<{ items: Channel[] }>('/api/channels/bulk', {
        method: 'PUT',
        body: JSON.stringify({ channels }),
      }),
  },

  campaigns: {
    list: () => request<{ items: Campaign[] }>('/api/campaigns'),
    get: (id: string) =>
      request<Campaign>(`/api/campaigns/${encodeURIComponent(id)}`),
    update: (id: string, body: Partial<Campaign>) =>
      request<Campaign>(`/api/campaigns/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    activate: (id: string) =>
      request<Campaign>(`/api/campaigns/${encodeURIComponent(id)}/activate`, {
        method: 'POST',
      }),
  },

  content: {
    list: () => request<{ items: ContentPiece[] }>('/api/content'),
    bulkCreate: (pieces: Partial<ContentPiece>[]) =>
      request<{ items: ContentPiece[] }>('/api/content/bulk', {
        method: 'POST',
        body: JSON.stringify({ pieces }),
      }),
    update: (id: string, body: Partial<ContentPiece>) =>
      request<ContentPiece>(`/api/content/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  experiments: {
    list: () => request<{ items: Experiment[] }>('/api/experiments'),
    update: (id: string, body: Partial<Experiment>) =>
      request<Experiment>(`/api/experiments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
  },

  ai: {
    runAutopilot: () =>
      request<{ scored: number; proposals: number; retention: number }>(
        '/api/ai/autopilot',
        { method: 'POST' }
      ),
    scoreLead: (leadId: string) =>
      request<Lead>('/api/ai/score', {
        method: 'POST',
        body: JSON.stringify({ leadId }),
      }),
    draftApproval: (leadId: string, kind: 'proposal' | 'reply', context?: string) =>
      request<Approval>('/api/ai/draft', {
        method: 'POST',
        body: JSON.stringify({ leadId, kind, context }),
      }),
    generateCampaign: (body: {
      type: Campaign['type'];
      topic: string;
      audience?: string;
      channels: string[];
    }) =>
      request<Campaign>('/api/ai/campaign', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    generateContent: (body: { channel: string; topic: string }) =>
      request<ContentPiece>('/api/ai/content', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    designExperiment: (topic: string) =>
      request<Experiment>('/api/ai/experiments/design', {
        method: 'POST',
        body: JSON.stringify({ topic }),
      }),
    judgeExperiment: (id: string) =>
      request<Experiment>(`/api/ai/experiments/${encodeURIComponent(id)}/judge`, {
        method: 'POST',
      }),
    chat: (messages: Array<{ role: string; content: string }>) =>
      request<{ reply: string; capturedLeadId: string | null }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages }),
      }),
  },
};
