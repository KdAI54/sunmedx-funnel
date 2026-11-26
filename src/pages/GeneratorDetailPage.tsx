import { useCallback, useEffect, useState } from 'react';
import { Archive, ArrowLeft, CirclePlay, Copy, LoaderCircle, Send } from 'lucide-react';
import { Badge, Card, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { Link } from '../lib/router';
import type { Campaign, ContentPiece } from '../types/funnel';

const ALLOWED_STUDIO_CHANNELS = new Set([
  'Instagram',
  'LinkedIn',
  'X',
  'Facebook',
  'TikTok',
  'YouTube',
  'Email',
  'Blog',
  'Landing page',
  'Webinar',
]);

function kitToStudioPieces(kit: Campaign): Partial<ContentPiece>[] {
  const pieces: Partial<ContentPiece>[] = [];
  if (kit.landing_headline || kit.landing_subhead) {
    pieces.push({
      title: kit.landing_headline || kit.name,
      channel: 'Landing page',
      hook: kit.landing_subhead || kit.promise || '',
      body: [kit.landing_proof, kit.landing_cta].filter(Boolean).join('\n\n'),
      cta: kit.landing_cta || 'Get the guide',
      status: 'draft',
    });
  }
  if (kit.magnet_title) {
    pieces.push({
      title: kit.magnet_title,
      channel: 'Blog',
      hook: kit.promise || '',
      body: kit.magnet_body || '',
      cta: 'Download the guide',
      status: 'draft',
    });
  }
  if (kit.webinar_title) {
    pieces.push({
      title: kit.webinar_title,
      channel: 'Webinar',
      hook: kit.webinar_description || '',
      body: kit.webinar_outline || '',
      cta: 'Save a seat',
      status: 'draft',
    });
  }
  (kit.emails || []).forEach((em) => {
    pieces.push({
      title: `Day ${em.day} · ${em.subject}`,
      channel: 'Email',
      hook: em.subject,
      body: em.body,
      cta: 'Reply to this email',
      status: 'draft',
    });
  });
  (kit.social || []).forEach((post) => {
    pieces.push({
      title: post.hook || `${post.channel} post`,
      channel: ALLOWED_STUDIO_CHANNELS.has(post.channel) ? post.channel : 'Instagram',
      hook: post.hook,
      body: post.body,
      cta: post.cta,
      status: 'draft',
    });
  });
  return pieces;
}

function CopyButton({ value, label }: { value?: string; label: string }) {
  const toast = useToast();
  if (!value) return null;
  return (
    <button
      type="button"
      className="sx-btn sx-btn-ghost sx-btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(`${label} copied`);
        } catch {
          toast.error('This browser blocked the copy. Select the text instead.');
        }
      }}
    >
      <Copy /> Copy
    </button>
  );
}

export function GeneratorDetailPage({ campaignId }: { campaignId: string }) {
  const toast = useToast();
  const [kit, setKit] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.campaigns.get(campaignId);
      setKit(data);
    } catch {
      setKit(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendToStudio() {
    if (!kit) return;
    const pieces = kitToStudioPieces(kit);
    if (pieces.length === 0) {
      toast.error('This kit has no copy to send.');
      return;
    }
    setBusy('studio');
    try {
      await api.content.bulkCreate(pieces);
      const updated = await api.campaigns.update(kit.id, {
        pieces_sent: (kit.pieces_sent || 0) + pieces.length,
      });
      setKit(updated);
      await api.activities.create({
        type: 'content',
        summary: `${pieces.length} pieces from ${kit.name} sent to the studio`,
        detail: kit.promise || '',
        status: 'done',
        automated: false,
      });
      toast.success(`${pieces.length} pieces in the studio`);
    } catch {
      toast.error('That send failed. Try again.');
    } finally {
      setBusy('');
    }
  }

  async function activateKit() {
    if (!kit) return;
    setBusy('activate');
    try {
      const updated = await api.campaigns.activate(kit.id);
      setKit(updated);
      toast.success('Kit is live');
    } catch {
      toast.error('Activation failed. Try again.');
    } finally {
      setBusy('');
    }
  }

  async function archiveKit() {
    if (!kit) return;
    setBusy('archive');
    try {
      const updated = await api.campaigns.update(kit.id, { status: 'archived' });
      setKit(updated);
      toast.success('Kit archived');
    } catch {
      toast.error('That did not save. Try again.');
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div className="sx-page">
        <p className="sx-muted">Loading the kit…</p>
      </div>
    );
  }

  if (!kit) {
    return (
      <div className="sx-page">
        <PageHead meta="Lead engine" title="Kit not found" />
        <Link to="/generator" className="sx-btn sx-btn-ghost">
          <ArrowLeft /> Back to the engine
        </Link>
      </div>
    );
  }

  const emails = kit.emails || [];
  const social = kit.social || [];

  return (
    <div className="sx-page">
      <PageHead meta="Lead engine" title={kit.name} lede={kit.promise || kit.topic}>
        <Link to="/generator" className="sx-btn sx-btn-ghost">
          <ArrowLeft /> All kits
        </Link>
        <button
          type="button"
          className="sx-btn sx-btn-ghost"
          onClick={sendToStudio}
          disabled={busy !== ''}
        >
          {busy === 'studio' ? <LoaderCircle className="animate-spin" /> : <Send />}
          {kit.pieces_sent ? `Send again (${kit.pieces_sent} sent)` : 'Send to studio'}
        </button>
        <button
          type="button"
          className="sx-btn sx-btn-primary"
          onClick={activateKit}
          disabled={busy !== '' || kit.status === 'active'}
        >
          {busy === 'activate' ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <CirclePlay />
          )}
          {kit.status === 'active' ? 'Live' : 'Activate kit'}
        </button>
        {kit.status !== 'archived' && (
          <button
            type="button"
            className="sx-btn sx-btn-quiet"
            onClick={archiveKit}
            disabled={busy !== ''}
          >
            <Archive /> Archive
          </button>
        )}
      </PageHead>

      <div className="lg-pill-row" style={{ marginBottom: 20 }}>
        <Badge tone={kit.status === 'active' ? 'green' : 'gray'}>{kit.status}</Badge>
        <Badge tone="purple">{kit.type.replace(/_/g, ' ')}</Badge>
        {(kit.channels || []).map((ch) => (
          <Badge key={ch} tone="teal">
            {ch}
          </Badge>
        ))}
      </div>

      <div className="lg-kit-grid">
        <Card
          title="The lead magnet"
          note={kit.magnet_title || '—'}
          action={<CopyButton value={kit.magnet_body} label="Magnet outline" />}
        >
          <p className="lg-block">{kit.magnet_body || 'This kit has no magnet.'}</p>
        </Card>

        <Card
          title="Landing page"
          action={
            <CopyButton
              value={[
                kit.landing_headline,
                kit.landing_subhead,
                kit.landing_proof,
                kit.landing_cta,
              ]
                .filter(Boolean)
                .join('\n\n')}
              label="Landing copy"
            />
          }
        >
          <p className="lg-sub">Headline</p>
          <p className="lg-block">{kit.landing_headline || '—'}</p>
          <p className="lg-sub" style={{ marginTop: 10 }}>
            Subhead
          </p>
          <p className="lg-block">{kit.landing_subhead || '—'}</p>
          <p className="lg-sub" style={{ marginTop: 10 }}>
            Proof
          </p>
          <p className="lg-block">{kit.landing_proof || '—'}</p>
          <p className="lg-sub" style={{ marginTop: 10 }}>
            Call to action
          </p>
          <p className="lg-block">{kit.landing_cta || '—'}</p>
        </Card>

        <Card
          title="Webinar"
          note={kit.webinar_title || '—'}
          action={
            <CopyButton
              value={`${kit.webinar_description || ''}\n\n${kit.webinar_outline || ''}`}
              label="Webinar plan"
            />
          }
        >
          <p className="lg-block">{kit.webinar_description || 'This kit has no webinar.'}</p>
          <p className="lg-sub" style={{ marginTop: 10 }}>
            Run of show
          </p>
          <p className="lg-block">{kit.webinar_outline || '—'}</p>
        </Card>

        <Card
          title={`Email sequence — ${emails.length}`}
          note="Day 0 sends the moment they opt in."
        >
          {emails.length === 0 ? (
            <p className="sx-muted">This kit has no emails.</p>
          ) : (
            emails.map((em, idx) => (
              <div
                key={`${em.day}-${idx}`}
                className="lg-row"
                style={{ gridTemplateColumns: 'auto minmax(0, 1fr)' }}
              >
                <Badge tone="purple">Day {em.day}</Badge>
                <div style={{ minWidth: 0 }}>
                  <div className="lg-name">
                    <strong>{em.subject}</strong>
                  </div>
                  <p className="lg-block">{em.body}</p>
                </div>
              </div>
            ))
          )}
        </Card>

        <Card
          title={`Social posts — ${social.length}`}
          note="One post per channel, written in the Sunmedx voice."
        >
          {social.length === 0 ? (
            <p className="sx-muted">This kit has no posts.</p>
          ) : (
            social.map((post, idx) => (
              <div
                key={`${post.channel}-${idx}`}
                className="lg-row"
                style={{ gridTemplateColumns: 'auto minmax(0, 1fr)' }}
              >
                <Badge tone={post.channel === 'Email' ? 'purple' : 'blue'}>
                  {post.channel}
                </Badge>
                <div style={{ minWidth: 0 }}>
                  <div className="lg-name">
                    <strong>{post.hook}</strong>
                  </div>
                  <p className="lg-block">{post.body}</p>
                  <p className="lg-hint">{post.cta}</p>
                </div>
              </div>
            ))
          )}
        </Card>
      </div>

      <div className="sx-stack" style={{ marginTop: 24 }}>
        <Card
          title="Where it runs"
          note="Activation logs one activity per channel, against the automation each channel is wired to."
        >
          <div className="lg-pill-row">
            {(kit.channels || []).length === 0 ? (
              <p className="sx-muted">No channels on this kit.</p>
            ) : (
              (kit.channels || []).map((ch) => (
                <Badge key={ch} tone="gray">
                  {ch}
                </Badge>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
