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
  secret_env_key: string;
  handle_label: string;
  handle_placeholder: string;
  account_id_label?: string;
  account_id_placeholder?: string;
  needs_sender_email?: boolean;
  portal_label: string;
  portal_url: string;
  setup_steps: string[];
}

export const CHANNEL_CATALOG: ChannelCatalogItem[] = [
  {
    key: 'pinterest',
    name: 'Pinterest',
    kind: 'social',
    integration: 'pinterest',
    cadence: '5 pins a week',
    automation_key: 'nurture_sequence',
    secret_env_key: 'PINTEREST_ACCESS_TOKEN',
    handle_label: 'Pinterest profile handle',
    handle_placeholder: '@sunmedxwellness',
    account_id_label: 'Target Board ID',
    account_id_placeholder: 'e.g. 9482716450192',
    portal_label: 'Pinterest Developers',
    portal_url: 'https://developers.pinterest.com/apps/',
    setup_steps: [
      'Switch your Pinterest account to a free Pinterest Business profile.',
      'Create an app in Pinterest Developers and generate an OAuth Access Token with pins:write and boards:read scopes.',
      'Add PINTEREST_ACCESS_TOKEN as a Secret in Cloudflare Workers -> Settings -> Variables and Secrets.',
      'Enter your handle and primary Board ID in step 2 so generated pins route straight to your funnel.',
    ],
  },
  {
    key: 'instagram',
    name: 'Instagram',
    kind: 'social',
    integration: 'instagram',
    cadence: '3 posts a week',
    automation_key: 'nurture_sequence',
    secret_env_key: 'INSTAGRAM_ACCESS_TOKEN',
    handle_label: 'Instagram handle',
    handle_placeholder: '@sunmedx',
    account_id_label: 'IG Business Account ID',
    account_id_placeholder: 'e.g. 178414057931',
    portal_label: 'Meta for Developers',
    portal_url: 'https://developers.facebook.com/apps/',
    setup_steps: [
      'Ensure your Instagram profile is switched to Professional / Business and linked to your Facebook Page.',
      'In Meta for Developers, enable Instagram Graph API and generate a long-lived user/page token.',
      'Save INSTAGRAM_ACCESS_TOKEN in Cloudflare Workers -> Settings -> Variables and Secrets.',
    ],
  },
  {
    key: 'facebook',
    name: 'Facebook page',
    kind: 'social',
    integration: 'facebook_pages',
    cadence: '3 posts a week',
    automation_key: 'nurture_sequence',
    secret_env_key: 'FACEBOOK_PAGE_TOKEN',
    handle_label: 'Page slug or URL',
    handle_placeholder: 'fb.com/sunmedx',
    account_id_label: 'Facebook Page ID',
    account_id_placeholder: 'e.g. 102938475610',
    portal_label: 'Meta Graph Explorer',
    portal_url: 'https://developers.facebook.com/tools/explorer/',
    setup_steps: [
      'Open your Facebook Business Page -> About -> Page transparency to copy your numeric Page ID.',
      'Generate a non-expiring Page Access Token with pages_manage_posts and pages_read_engagement permissions.',
      'Store FACEBOOK_PAGE_TOKEN in Cloudflare Workers -> Settings -> Variables and Secrets.',
    ],
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    kind: 'social',
    integration: 'linkedin',
    cadence: '2 posts a week',
    automation_key: 'offer_gate',
    secret_env_key: 'LINKEDIN_ACCESS_TOKEN',
    handle_label: 'LinkedIn handle / slug',
    handle_placeholder: 'company/sunmedx',
    account_id_label: 'Organization URN / ID',
    account_id_placeholder: 'e.g. urn:li:organization:123456',
    portal_label: 'LinkedIn Developers',
    portal_url: 'https://www.linkedin.com/developers/apps',
    setup_steps: [
      'Create a LinkedIn Developer App and request the Share on LinkedIn & Community Management API products.',
      'Authorize your company page via OAuth 2.0 (w_organization_social scope).',
      'Save LINKEDIN_ACCESS_TOKEN as a Cloudflare Worker secret and enter your Organization URN below.',
    ],
  },
  {
    key: 'x',
    name: 'X',
    kind: 'social',
    integration: 'x',
    cadence: '5 posts a week',
    automation_key: 'lead_scoring',
    secret_env_key: 'X_BEARER_TOKEN',
    handle_label: 'X handle',
    handle_placeholder: '@sunmedx',
    account_id_label: 'X User ID (optional)',
    account_id_placeholder: 'e.g. 1548291042',
    portal_label: 'X Developer Portal',
    portal_url: 'https://developer.x.com/en/portal/dashboard',
    setup_steps: [
      'Open the X Developer Portal and create a Project & App with Read and Write permissions.',
      'Generate OAuth 2.0 User Context or Bearer credentials.',
      'Add X_BEARER_TOKEN as a Secret inside Cloudflare Workers -> Variables and Secrets.',
    ],
  },
  {
    key: 'tiktok',
    name: 'TikTok',
    kind: 'social',
    integration: 'tiktok',
    cadence: '3 short videos a week',
    automation_key: 'lead_scoring',
    secret_env_key: 'TIKTOK_ACCESS_TOKEN',
    handle_label: 'TikTok handle',
    handle_placeholder: '@sunmedx',
    account_id_label: 'TikTok Open ID',
    account_id_placeholder: 'e.g. open_id_...',
    portal_label: 'TikTok for Developers',
    portal_url: 'https://developers.tiktok.com/',
    setup_steps: [
      'Register a web app in TikTok for Developers and enable Content Posting API.',
      'Complete OAuth for your TikTok Business account with video.publish scope.',
      'Store TIKTOK_ACCESS_TOKEN in Cloudflare Workers Secrets.',
    ],
  },
  {
    key: 'youtube',
    name: 'YouTube',
    kind: 'social',
    integration: 'youtube',
    cadence: '1 webinar replay a month',
    automation_key: 'nurture_sequence',
    secret_env_key: 'YOUTUBE_OAUTH_TOKEN',
    handle_label: 'YouTube channel handle',
    handle_placeholder: '@sunmedx',
    account_id_label: 'YouTube Channel ID',
    account_id_placeholder: 'e.g. UCxxxxxxxxxxxx',
    portal_label: 'Google Cloud Console',
    portal_url: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
    setup_steps: [
      'Enable YouTube Data API v3 in Google Cloud Console and create OAuth 2.0 credentials.',
      'Copy your Channel ID from YouTube Studio -> Customization -> Basic info.',
      'Save YOUTUBE_OAUTH_TOKEN in Cloudflare Workers Secrets.',
    ],
  },
  {
    key: 'brevo',
    name: 'Brevo (Sendinblue)',
    kind: 'email',
    integration: 'brevo',
    cadence: '2 emails a week',
    automation_key: 'nurture_sequence',
    secret_env_key: 'BREVO_API_KEY',
    handle_label: 'Workspace / Account label',
    handle_placeholder: 'Sunmedx Brevo',
    account_id_label: 'Contact List ID',
    account_id_placeholder: 'e.g. List #4',
    needs_sender_email: true,
    portal_label: 'Brevo API Keys',
    portal_url: 'https://app.brevo.com/settings/keys/api',
    setup_steps: [
      'Log in to Brevo -> Settings -> Senders, Domains & Dedicated IPs and verify your sending domain (SPF/DKIM).',
      'Go to SMTP & API -> API Keys and generate a new API v3 key.',
      'Store BREVO_API_KEY in Cloudflare Workers -> Settings -> Variables and Secrets.',
      'Enter your verified sender email and target Brevo Contact List ID in the next step.',
    ],
  },
  {
    key: 'mailchimp',
    name: 'Mailchimp',
    kind: 'email',
    integration: 'mailchimp',
    cadence: '2 emails a week',
    automation_key: 'nurture_sequence',
    secret_env_key: 'MAILCHIMP_API_KEY',
    handle_label: 'Server prefix & account',
    handle_placeholder: 'us21 · sunmedx',
    account_id_label: 'Audience ID',
    account_id_placeholder: 'e.g. a1b2c3d4e5',
    needs_sender_email: true,
    portal_label: 'Mailchimp API Keys',
    portal_url: 'https://admin.mailchimp.com/account/api/',
    setup_steps: [
      'Open Mailchimp -> Account & billing -> Extras -> API keys and create a key (note the server prefix like us21).',
      'Copy your Audience ID under Audience -> Settings -> Audience name and defaults.',
      'Add MAILCHIMP_API_KEY in Cloudflare Workers Secrets.',
    ],
  },
  {
    key: 'klaviyo',
    name: 'Klaviyo',
    kind: 'email',
    integration: 'klaviyo',
    cadence: '2 emails a week',
    automation_key: 'nurture_sequence',
    secret_env_key: 'KLAVIYO_API_KEY',
    handle_label: 'Account / Brand name',
    handle_placeholder: 'Sunmedx Klaviyo',
    account_id_label: 'List ID',
    account_id_placeholder: 'e.g. XyZ123',
    needs_sender_email: true,
    portal_label: 'Klaviyo API Settings',
    portal_url: 'https://www.klaviyo.com/settings/account/api-keys',
    setup_steps: [
      'Open Klaviyo -> Settings -> API Keys and create a Private API Key with Profiles and Lists scopes.',
      'Copy the target List ID from Audience -> Lists & Segments.',
      'Save KLAVIYO_API_KEY in Cloudflare Workers Secrets.',
    ],
  },
  {
    key: 'kit',
    name: 'Kit (ConvertKit)',
    kind: 'email',
    integration: 'kit',
    cadence: '2 emails a week',
    automation_key: 'nurture_sequence',
    secret_env_key: 'KIT_API_KEY',
    handle_label: 'Creator profile',
    handle_placeholder: 'sunmedx.kit.com',
    account_id_label: 'Form or Sequence ID',
    account_id_placeholder: 'e.g. 6841203',
    needs_sender_email: true,
    portal_label: 'Kit Developer Settings',
    portal_url: 'https://app.kit.com/account_settings/developer_settings',
    setup_steps: [
      'Go to Kit -> Settings -> Developer Settings and create an API v4 Key.',
      'Copy the Form or Sequence ID that delivers your lead magnet or nurture sequence.',
      'Save KIT_API_KEY in Cloudflare Workers Secrets.',
    ],
  },
  {
    key: 'activecampaign',
    name: 'ActiveCampaign',
    kind: 'email',
    integration: 'activecampaign',
    cadence: '2 emails a week',
    automation_key: 'offer_gate',
    secret_env_key: 'ACTIVECAMPAIGN_API_KEY',
    handle_label: 'Account API URL',
    handle_placeholder: 'sunmedx.api-us1.com',
    account_id_label: 'List or Automation ID',
    account_id_placeholder: 'e.g. 12',
    needs_sender_email: true,
    portal_label: 'ActiveCampaign Settings',
    portal_url: 'https://www.activecampaign.com/',
    setup_steps: [
      'In ActiveCampaign, open Settings -> Developer to copy your API URL and API Key.',
      'Note the List ID or Automation ID for new high-intent leads.',
      'Store ACTIVECAMPAIGN_API_KEY in Cloudflare Workers Secrets.',
    ],
  },
  {
    key: 'resend',
    name: 'Resend / Custom SMTP',
    kind: 'email',
    integration: 'resend',
    cadence: 'Instant transactional + nurture',
    automation_key: 'conversion_welcome',
    secret_env_key: 'RESEND_API_KEY',
    handle_label: 'Verified domain',
    handle_placeholder: 'mail.sunmedx.app',
    account_id_label: 'Webhook / Reply-To',
    account_id_placeholder: 'reply@sunmedx.app',
    needs_sender_email: true,
    portal_label: 'Resend Dashboard',
    portal_url: 'https://resend.com/api-keys',
    setup_steps: [
      'Verify your sending domain DNS records (DKIM + SPF) inside Resend or your SMTP provider.',
      'Create a Sending-Access API Key.',
      'Save RESEND_API_KEY in Cloudflare Workers Secrets so transactional approvals send from your domain.',
    ],
  },
  {
    key: 'gmail',
    name: 'Gmail — 1:1 follow-up',
    kind: 'email',
    integration: 'gmail',
    cadence: 'On every reply',
    automation_key: 'objection_handling',
    secret_env_key: 'GMAIL_OAUTH_TOKEN',
    handle_label: 'Mailbox label',
    handle_placeholder: 'Founder Gmail',
    account_id_label: 'Signature / Alias',
    account_id_placeholder: 'Founder · Sunmedx',
    needs_sender_email: true,
    portal_label: 'Google Workspace OAuth',
    portal_url: 'https://console.cloud.google.com/apis/credentials',
    setup_steps: [
      'Enter the founder email address you want replies to originate from.',
      'Configure OAuth credentials with gmail.send scope if sending directly from Google Workspace.',
      'Keep Approval Gate enabled so every 1:1 reply waits for your sign-off before sending.',
    ],
  },
  {
    key: 'web',
    name: 'Website & landing page',
    kind: 'web',
    integration: '',
    cadence: 'Always on',
    automation_key: 'lead_scoring',
    secret_env_key: '',
    handle_label: 'Public domain',
    handle_placeholder: 'sunmedx.app',
    portal_label: 'Cloudflare Workers Domains',
    portal_url: 'https://dash.cloudflare.com/',
    setup_steps: [
      'Your public landing page, Lead Magnet form, and AI chat advisor are built in and hosted on this Worker.',
      'Update APP_URL in wrangler.jsonc or attach a Custom Domain in Cloudflare Workers Settings.',
    ],
  },
];

export const GENERATOR_CHANNELS = [
  'Pinterest',
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
