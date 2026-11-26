import React, { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Zap } from 'lucide-react';
import { Badge, Card, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { GENERATOR_CHANNELS } from '../data/stages';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import { Link, useRouter } from '../lib/router';
import type { Campaign } from '../types/funnel';

const KIT_TYPES: Array<{ key: Campaign['type']; label: string }> = [
  { key: 'full_campaign', label: 'Full campaign kit' },
  { key: 'lead_magnet', label: 'Lead magnet' },
  { key: 'email_sequence', label: 'Email sequence' },
  { key: 'social_pack', label: 'Social post pack' },
  { key: 'webinar', label: 'Webinar kit' },
  { key: 'landing_page', label: 'Landing page' },
];

const KIT_LABELS: Record<string, string> = {
  full_campaign: 'Full kit',
  lead_magnet: 'Lead magnet',
  webinar: 'Webinar',
  email_sequence: 'Email sequence',
  social_pack: 'Social pack',
  landing_page: 'Landing page',
};

export function GeneratorIndexPage() {
  const { navigate } = useRouter();
  const toast = useToast();

  const [kits, setKits] = useState<Campaign[]>([]);
  const [wiredCount, setWiredCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState<Campaign['type']>('full_campaign');
  const [topic, setTopic] = useState(
    'Why your 3pm crash is a blood-sugar problem, not a coffee problem'
  );
  const [audience, setAudience] = useState('');
  const [channels, setChannels] = useState<string[]>([
    'Instagram',
    'LinkedIn',
    'X',
    'Email',
  ]);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [kitsRes, chRes] = await Promise.all([
        api.campaigns.list(),
        api.channels.list(true),
      ]);
      setKits(kitsRes.items || []);
      setWiredCount((chRes.items || []).length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function toggleChannel(ch: string) {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch]
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (topic.trim().length < 4) {
      toast.error('Give the kit a topic first.');
      return;
    }
    if (channels.length === 0) {
      toast.error('Pick at least one channel.');
      return;
    }
    setGenerating(true);
    try {
      const created = await api.ai.generateCampaign({
        type,
        topic: topic.trim(),
        audience: audience.trim() || undefined,
        channels,
      });
      toast.success(`Kit ready — ${created.name}`);
      await load();
      navigate({ to: `/generator/${created.id}` });
    } catch {
      toast.error('The writer could not finish that kit. Try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="sx-page">
      <PageHead
        meta="Lead engine"
        title="A campaign on demand"
        lede="One kit writes the magnet, the landing page, the webinar and the posts — then activation puts it live on the channels you wired."
      >
        <Link to="/channels" className="sx-btn sx-btn-ghost">
          Accounts &amp; wiring
        </Link>
      </PageHead>

      <Card
        title="Generate a kit"
        note="One prompt writes the magnet, the landing page, the webinar and the posts — then you approve what goes out."
      >
        <form onSubmit={onSubmit} className="sx-stack" style={{ gap: 14 }}>
          <div className="sx-row-2">
            <div className="sx-field">
              <label className="sx-label" htmlFor="kit-type">
                What do you need
              </label>
              <select
                id="kit-type"
                className="sx-native"
                value={type}
                onChange={(e) => setType(e.target.value as Campaign['type'])}
              >
                {KIT_TYPES.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sx-field">
              <label className="sx-label" htmlFor="kit-topic">
                Topic or angle
              </label>
              <input
                id="kit-topic"
                className="sx-input"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="The one thing you want them to fix"
              />
            </div>
          </div>

          <div className="sx-field">
            <label className="sx-label" htmlFor="kit-audience">
              Who it is for (optional)
            </label>
            <input
              id="kit-audience"
              className="sx-input"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="Leaves blank to use the brand audience"
            />
          </div>

          <div className="sx-field">
            <span className="sx-label">Channels to write for</span>
            <div className="lg-pill-row">
              {GENERATOR_CHANNELS.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  className="lg-chip"
                  data-on={channels.includes(ch) ? 'true' : 'false'}
                  aria-pressed={channels.includes(ch)}
                  onClick={() => toggleChannel(ch)}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="sx-btn sx-btn-primary"
              disabled={generating}
            >
              {generating ? <LoaderCircle className="animate-spin" /> : <Zap />}
              {generating ? 'Writing the kit' : 'Generate kit'}
            </button>
          </div>
        </form>
      </Card>

      <div className="sx-stack" style={{ marginTop: 24 }}>
        <Card
          title="Your kits"
          note={
            wiredCount
              ? `Runs on ${wiredCount} wired channel${wiredCount === 1 ? '' : 's'}. Activate a kit to put it live on them.`
              : 'No channels wired yet — set up accounts so a kit can go live.'
          }
        >
          {loading ? (
            <p className="sx-muted">Loading kits…</p>
          ) : kits.length === 0 ? (
            <EmptyState title="No kits yet">
              Generate one above — the magnet, the page, the webinar and the posts land together.
            </EmptyState>
          ) : (
            kits.map((kit) => (
              <Link key={kit.id} to={`/generator/${kit.id}`} className="lg-kit">
                <div style={{ minWidth: 0 }}>
                  <div className="lg-name">
                    <strong>{kit.name}</strong>
                    <Badge tone="purple">{KIT_LABELS[kit.type] || kit.type}</Badge>
                    <Badge tone={kit.status === 'active' ? 'green' : 'gray'}>
                      {kit.status}
                    </Badge>
                  </div>
                  <p className="lg-hint">{kit.promise || kit.topic}</p>
                </div>
                <span
                  className="sx-muted"
                  style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}
                >
                  {(kit.emails || []).length} emails · {(kit.social || []).length} posts ·{' '}
                  {kit.pieces_sent || 0} in studio · {timeAgo(kit.created_date)}
                </span>
              </Link>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
