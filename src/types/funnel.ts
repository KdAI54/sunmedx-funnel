export type StageKey =
  | 'awareness'
  | 'interest'
  | 'nurture'
  | 'proposal'
  | 'conversion'
  | 'retention';

export type Temperature = 'hot' | 'warm' | 'cold';

export type BadgeTone = 'gray' | 'purple' | 'teal' | 'green' | 'warm' | 'red' | 'blue';

export interface Lead {
  id: string;
  full_name: string;
  email: string;
  interest: string;
  source: string;
  stage: StageKey;
  temperature: Temperature;
  score: number;
  score_reason?: string;
  need_signal?: string;
  budget_signal?: string;
  timeline_signal?: string;
  notes?: string;
  next_action?: string;
  deal_value?: number;
  last_touch?: string;
  won_at?: string;
  created_date: string;
  updated_date: string;
}

export interface Approval {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_email: string;
  kind: 'proposal' | 'reply';
  status: 'pending' | 'sent' | 'rejected' | 'failed';
  subject: string;
  body: string;
  offer?: string;
  price?: number;
  confidence?: number;
  send_error?: string;
  created_date: string;
  updated_date: string;
}

export type ActivityType =
  | 'chat'
  | 'score'
  | 'email'
  | 'proposal'
  | 'reply'
  | 'payment'
  | 'retention'
  | 'content'
  | 'note';

export interface Activity {
  id: string;
  lead_id?: string;
  lead_name?: string;
  stage?: StageKey;
  type: ActivityType;
  summary: string;
  detail?: string;
  status: 'done' | 'queued';
  automated: boolean;
  created_date: string;
}

export interface Automation {
  id: string;
  key: string;
  name: string;
  vertical: 'stage' | 'activity' | 'automation';
  description: string;
  trigger: string;
  delay_days: number;
  enabled: boolean;
  run_count: number;
  last_run?: string;
}

export interface Channel {
  id: string;
  key: string;
  name: string;
  kind: 'social' | 'email' | 'web';
  integration: string;
  handle: string;
  account_id?: string;
  sender_email?: string;
  secret_env_key?: string;
  wizard_completed?: boolean;
  automation_key: string;
  delay_days: number;
  cadence: string;
  enabled: boolean;
  connected?: boolean;
}

export interface CampaignEmail {
  day: number;
  subject: string;
  body: string;
}

export interface CampaignSocial {
  channel: string;
  hook: string;
  body: string;
  cta: string;
}

export interface Campaign {
  id: string;
  name: string;
  type:
    | 'full_campaign'
    | 'lead_magnet'
    | 'email_sequence'
    | 'social_pack'
    | 'webinar'
    | 'landing_page';
  topic: string;
  promise?: string;
  audience?: string;
  channels: string[];
  status: 'draft' | 'active' | 'archived';
  pieces_sent?: number;
  activated_at?: string;
  magnet_title?: string;
  magnet_body?: string;
  landing_headline?: string;
  landing_subhead?: string;
  landing_proof?: string;
  landing_cta?: string;
  webinar_title?: string;
  webinar_description?: string;
  webinar_outline?: string;
  emails?: CampaignEmail[];
  social?: CampaignSocial[];
  created_date: string;
}

export interface ContentPiece {
  id: string;
  title: string;
  channel: string;
  hook?: string;
  body?: string;
  cta?: string;
  status: 'draft' | 'scheduled' | 'published';
  scheduled_for?: string;
  created_date: string;
}

export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  metric: string;
  variant_a: string;
  variant_b: string;
  a_visits: number;
  a_conversions: number;
  b_visits: number;
  b_conversions: number;
  winner: 'undecided' | 'A' | 'B';
  insight?: string;
  created_date: string;
}

export interface OfferItem {
  name: string;
  kind: 'digital' | 'service' | 'physical';
  price: number;
  promise: string;
}

export interface WorkspaceSettings {
  id: string;
  brand: string;
  positioning: string;
  audience: string;
  pain: string;
  tone: string;
  landing_headline: string;
  landing_subhead: string;
  chat_greeting: string;
  offers: OfferItem[];
}
