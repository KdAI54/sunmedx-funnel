import type { BadgeTone, StageKey } from '../types/funnel';

export interface StageDefinition {
  key: StageKey;
  name: string;
  goal: string;
  activity: string;
  activity_channel: string;
  automation: string;
  target_metric: string;
  tone: 'gray' | 'activity' | 'conversion';
}

export const STAGES: StageDefinition[] = [
  {
    key: 'awareness',
    name: 'Awareness',
    goal: 'A stranger sees a Sunmedx post, ad or search result.',
    activity: 'AI greets them in the chat and captures a signal',
    activity_channel: 'Chat widget',
    automation: 'Chat transcript → lead created instantly',
    target_metric: 'Leads captured per week',
    tone: 'gray',
  },
  {
    key: 'interest',
    name: 'Interest',
    goal: 'They explore the three offers and their own problem.',
    activity: 'AI scores budget, need and timeline',
    activity_channel: 'Scoring',
    automation: 'Hot escalates, cold enters nurture',
    target_metric: 'Qualified leads',
    tone: 'gray',
  },
  {
    key: 'nurture',
    name: 'Nurture',
    goal: 'Cold and warm leads get proof, not pressure.',
    activity: 'AI writes the case study and tip sequence',
    activity_channel: 'Email',
    automation: 'Day 1 · 3 · 7 sends, opens logged',
    target_metric: 'Open and reply rate',
    tone: 'activity',
  },
  {
    key: 'proposal',
    name: 'Proposal',
    goal: 'A hot lead receives one offer, at one price.',
    activity: 'AI drafts the pitch and the price',
    activity_channel: 'Offer',
    automation: 'Queued in Approvals, sends on approve',
    target_metric: 'Approved offers sent',
    tone: 'activity',
  },
  {
    key: 'conversion',
    name: 'Conversion',
    goal: 'They pay for a digital protocol, a service or the stack.',
    activity: 'AI answers objections with proof',
    activity_channel: 'Reply',
    automation: 'Payment marks won, onboarding email fires',
    target_metric: 'Revenue won',
    tone: 'conversion',
  },
  {
    key: 'retention',
    name: 'Retention',
    goal: 'Thirty days later, they buy again or renew.',
    activity: 'AI writes the check-in and next offer',
    activity_channel: 'Email',
    automation: '30-day CRM trigger',
    target_metric: 'Repeat purchases',
    tone: 'conversion',
  },
];

export function getStage(key: string): StageDefinition {
  return (
    STAGES.find((s) => s.key === key) || {
      key: key as StageKey,
      name: key,
      goal: '',
      activity: '',
      activity_channel: '',
      automation: '',
      target_metric: '',
      tone: 'gray',
    }
  );
}

export function tempTone(temp?: string): BadgeTone {
  if (temp === 'hot') return 'red';
  if (temp === 'warm') return 'warm';
  if (temp === 'cold') return 'blue';
  return 'gray';
}

export function stageTone(stage?: string): BadgeTone {
  switch (stage) {
    case 'nurture':
    case 'proposal':
      return 'purple';
    case 'conversion':
    case 'retention':
      return 'green';
    default:
      return 'gray';
  }
}

export const AUTOMATION_DEFAULTS = [
  {
    key: 'lead_scoring',
    name: 'Lead scoring',
    vertical: 'activity' as const,
    description:
      'Scores budget, need and timeline on every new lead and picks the next action.',
    trigger: 'New lead captured',
    delay_days: 0,
  },
  {
    key: 'offer_gate',
    name: 'Offer with approval gate',
    vertical: 'automation' as const,
    description:
      'Drafts a personalised pitch and price for hot leads, then waits for you.',
    trigger: 'Score reaches 70',
    delay_days: 0,
  },
  {
    key: 'nurture_sequence',
    name: 'Nurture sequence',
    vertical: 'activity' as const,
    description:
      'Case studies, demos and tips on a timed drip for cold and warm leads.',
    trigger: 'Temperature is cold or warm',
    delay_days: 1,
  },
  {
    key: 'objection_handling',
    name: 'Objection handling',
    vertical: 'activity' as const,
    description:
      'Routine buyer questions get an answer with proof; unusual ones escalate to you.',
    trigger: 'Buyer raises a concern',
    delay_days: 0,
  },
  {
    key: 'conversion_welcome',
    name: 'Conversion & welcome',
    vertical: 'stage' as const,
    description:
      'Marks the lead won and fires the onboarding email the moment they pay.',
    trigger: 'Payment received',
    delay_days: 0,
  },
  {
    key: 'retention_30',
    name: '30-day retention trigger',
    vertical: 'automation' as const,
    description:
      'A check-in with the next best offer, thirty days after the sale.',
    trigger: '30 days after won',
    delay_days: 30,
  },
];

export interface ChannelCatalogItem {
  key: string;
  name: string;
  kind: 'social' | 'email' | 'web';
  integration: string;
  cadence: string;
  automation_key: string;
}

export const CHANNEL_CATALOG: ChannelCatalogItem[] = [
  {
    key: 'instagram',
    name: 'Instagram',
    kind: 'social',
    integration: 'instagram',
    cadence: '3 posts a week',
    automation_key: 'nurture_sequence',
  },
  {
    key: 'facebook',
    name: 'Facebook page',
    kind: 'social',
    integration: 'facebook_pages',
    cadence: '3 posts a week',
    automation_key: 'nurture_sequence',
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    kind: 'social',
    integration: 'linkedin',
    cadence: '2 posts a week',
    automation_key: 'offer_gate',
  },
  {
    key: 'x',
    name: 'X',
    kind: 'social',
    integration: 'x',
    cadence: '5 posts a week',
    automation_key: 'lead_scoring',
  },
  {
    key: 'tiktok',
    name: 'TikTok',
    kind: 'social',
    integration: 'tiktok',
    cadence: '3 short videos a week',
    automation_key: 'lead_scoring',
  },
  {
    key: 'youtube',
    name: 'YouTube',
    kind: 'social',
    integration: 'youtube',
    cadence: '1 webinar replay a month',
    automation_key: 'nurture_sequence',
  },
  {
    key: 'mailchimp',
    name: 'Mailchimp',
    kind: 'email',
    integration: 'mailchimp',
    cadence: '2 emails a week',
    automation_key: 'nurture_sequence',
  },
  {
    key: 'klaviyo',
    name: 'Klaviyo',
    kind: 'email',
    integration: 'klaviyo',
    cadence: '2 emails a week',
    automation_key: 'nurture_sequence',
  },
  {
    key: 'gmail',
    name: 'Gmail — 1:1 follow-up',
    kind: 'email',
    integration: 'gmail',
    cadence: 'On every reply',
    automation_key: 'objection_handling',
  },
  {
    key: 'web',
    name: 'Website & landing page',
    kind: 'web',
    integration: '',
    cadence: 'Always on',
    automation_key: 'lead_scoring',
  },
];

export const GENERATOR_CHANNELS = [
  'Instagram',
  'LinkedIn',
  'X',
  'Facebook',
  'TikTok',
  'YouTube',
  'Email',
];

export const DEFAULT_WORKSPACE = {
  id: 'ws-sunmedx',
  brand: 'Sunmedx',
  positioning: 'Precision wellness protocols for energy, recovery and sleep.',
  audience: 'Busy professionals 28-45 who are tired, wired and sleeping badly.',
  pain: 'They have tried supplements that did nothing and want a protocol that actually works.',
  tone: 'Calm, precise, evidence-led. No hype, no exclamation marks.',
  landing_headline: 'Energy you can plan around.',
  landing_subhead:
    'A protocol built from your own signals — sleep, stress and stamina — not another bottle of pills.',
  chat_greeting:
    "Hi — I'm the Sunmedx assistant. What's the one thing about your energy you'd most like to fix?",
  offers: [
    {
      name: '30-Day Energy Reset Protocol',
      kind: 'digital' as const,
      price: 29,
      promise: 'The exact daily sequence, in one guide.',
    },
    {
      name: '1:1 Wellness Audit',
      kind: 'service' as const,
      price: 180,
      promise: '60 minutes, a plan of your own, follow-up notes.',
    },
    {
      name: 'The Sunmedx Daily Stack',
      kind: 'physical' as const,
      price: 59,
      promise: 'What to take, when, and why it works.',
    },
  ],
};
