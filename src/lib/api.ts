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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
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
      request<{ ok: boolean; error?: string; approval?: Approval }>(
        `/api/approvals/${encodeURIComponent(id)}/send`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      ),
  },

  activities: {
    list: (opts?: { lead_id?: string; status?: string; limit?: number }) => {
      const params = new URLSearchParams();
      if (opts?.lead_id) params.set('lead_id', opts.lead_id);
      if (opts?.status) params.set('status', opts.status);
      if (opts?.limit) params.set('limit', String(opts.limit));
      const qs = params.toString();
      return request<{ items: Activity[] }>(`/api/activities${qs ? `?${qs}` : ''}`);
    },
    create: (body: Partial<Activity>) =>
      request<Activity>('/api/activities', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
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
