import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, Zap } from 'lucide-react';
import { Badge, Card, EmptyState, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { timeAgo } from '../lib/format';
import type { ContentPiece } from '../types/funnel';

const CONTENT_CHANNELS = ['Instagram', 'LinkedIn', 'Blog', 'Email', 'Landing page'];

export function ContentPage() {
  const toast = useToast();
  const [channel, setChannel] = useState('Instagram');
  const [topic, setTopic] = useState('');
  const [writing, setWriting] = useState(false);
  const [items, setItems] = useState<ContentPiece[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.content.list();
      setItems(res.items || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function writePiece() {
    if (topic.trim().length < 4) return;
    setWriting(true);
    try {
      await api.ai.generateContent({ channel, topic: topic.trim() });
      await load();
      toast.success(`${channel} piece written`);
    } catch {
      toast.error('The writer failed. Try again.');
    } finally {
      setWriting(false);
    }
  }

  async function cycleStatus(piece: ContentPiece) {
    const nextStatus: ContentPiece['status'] =
      piece.status === 'draft'
        ? 'scheduled'
        : piece.status === 'scheduled'
          ? 'published'
          : 'draft';
    const patch: Partial<ContentPiece> = { status: nextStatus };
    if (nextStatus === 'scheduled') {
      patch.scheduled_for = new Date(Date.now() + 86400000).toISOString();
    }
    const updated = await api.content.update(piece.id, patch);
    setItems((prev) => prev.map((x) => (x.id === piece.id ? updated : x)));
  }

  return (
    <div className="sx-page">
      <PageHead
        meta="Content studio"
        title="Words that pull strangers in"
        lede="The AI writes in the Sunmedx voice. Schedule it and the weekly posting habit takes care of itself."
      />

      <Card
        title="Write something"
        note="A hook that stops the scroll, a short body, one call to action."
      >
        <div className="sx-row-2" style={{ alignItems: 'end' }}>
          <div className="sx-field">
            <label className="sx-label" htmlFor="content-topic">
              Topic
            </label>
            <input
              id="content-topic"
              className="sx-input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter a topic or angle to write about"
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="sx-field" style={{ flex: '1 1 auto' }}>
              <label className="sx-label" htmlFor="content-channel">
                Channel
              </label>
              <select
                id="content-channel"
                className="sx-native"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                {CONTENT_CHANNELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="sx-btn sx-btn-primary"
              onClick={writePiece}
              disabled={writing}
              style={{ alignSelf: 'end' }}
            >
              {writing ? <LoaderCircle className="animate-spin" /> : <Zap />}
              Write
            </button>
          </div>
        </div>
      </Card>

      <div className="sx-stack" style={{ marginTop: 24 }}>
        {loading ? (
          <p className="sx-muted">Loading the studio…</p>
        ) : items.length === 0 ? (
          <EmptyState title="The studio is empty">
            Write your first piece above — it lands here as a draft.
          </EmptyState>
        ) : (
          items.map((piece) => (
            <Card key={piece.id}>
              <div className="sx-split" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      flexWrap: 'wrap',
                    }}
                  >
                    <h2 className="sx-card-title">{piece.title}</h2>
                    <Badge tone="purple">{piece.channel}</Badge>
                    <Badge
                      tone={
                        piece.status === 'published'
                          ? 'green'
                          : piece.status === 'scheduled'
                            ? 'warm'
                            : 'gray'
                      }
                    >
                      {piece.status}
                    </Badge>
                  </div>
                  {piece.hook && (
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontSize: 13,
                        lineHeight: 1.5,
                        color: 'var(--sx-ink)',
                      }}
                    >
                      {piece.hook}
                    </p>
                  )}
                  {piece.body && (
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: 12.5,
                        lineHeight: 1.65,
                        color: 'var(--sx-ink-2)',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {piece.body}
                    </p>
                  )}
                  <p className="sx-muted" style={{ marginTop: 8 }}>
                    {piece.cta} · {timeAgo(piece.created_date)}
                    {piece.scheduled_for
                      ? ` · scheduled ${new Date(piece.scheduled_for).toLocaleDateString('en-US', { timeZone: 'UTC' })}`
                      : ''}
                  </p>
                </div>

                <button
                  type="button"
                  className="sx-btn sx-btn-ghost sx-btn-sm"
                  onClick={() => cycleStatus(piece)}
                >
                  {piece.status === 'draft'
                    ? 'Schedule'
                    : piece.status === 'scheduled'
                      ? 'Mark published'
                      : 'Back to draft'}
                </button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
