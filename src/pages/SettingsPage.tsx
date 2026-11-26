import React, { useEffect, useState } from 'react';
import { LoaderCircle, Save } from 'lucide-react';
import { Card, PageHead } from '../components/UI';
import { useToast } from '../components/Toast';
import { DEFAULT_WORKSPACE } from '../data/stages';
import { api } from '../lib/api';
import type { OfferItem, WorkspaceSettings } from '../types/funnel';

export function SettingsPage() {
  const toast = useToast();
  const [ws, setWs] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.workspace
      .get()
      .then((data) => {
        if (data) {
          setWs({
            ...DEFAULT_WORKSPACE,
            ...data,
            offers: data.offers?.length ? data.offers : DEFAULT_WORKSPACE.offers,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const setField = (key: keyof WorkspaceSettings) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setWs((prev) => ({ ...prev, [key]: e.target.value }));

  function updateOffer(idx: number, key: keyof OfferItem, val: string) {
    setWs((prev) => ({
      ...prev,
      offers: prev.offers.map((o, i) =>
        i === idx ? { ...o, [key]: key === 'price' ? Number(val) || 0 : val } : o
      ),
    }));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await api.workspace.save({
        brand: ws.brand,
        positioning: ws.positioning,
        audience: ws.audience,
        pain: ws.pain,
        tone: ws.tone,
        landing_headline: ws.landing_headline,
        landing_subhead: ws.landing_subhead,
        chat_greeting: ws.chat_greeting,
        offers: ws.offers,
      });
      setWs(saved);
      toast.success('Saved. The AI writes with this brief from now on.');
    } catch {
      toast.error('Settings could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="sx-page">
        <PageHead meta="Settings" title="The brand brief" />
        <p className="sx-muted">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="sx-page">
      <PageHead
        meta="Settings"
        title="The brand brief"
        lede="Everything the AI writes is grounded in this page. Change it here, not in a hundred prompts."
      >
        <button
          type="button"
          className="sx-btn sx-btn-primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
          Save
        </button>
      </PageHead>

      <div className="sx-stack" id="brand">
        <Card
          title="Who Sunmedx is"
          note="Brand, positioning and the person on the other side."
        >
          <div className="sx-row-2">
            <div className="sx-field">
              <label className="sx-label" htmlFor="brand-name">
                Brand name
              </label>
              <input
                id="brand-name"
                className="sx-input"
                value={ws.brand}
                onChange={setField('brand')}
              />
            </div>
            <div className="sx-field">
              <label className="sx-label" htmlFor="tone">
                Voice
              </label>
              <input
                id="tone"
                className="sx-input"
                value={ws.tone}
                onChange={setField('tone')}
              />
            </div>
          </div>

          <div className="sx-field">
            <label className="sx-label" htmlFor="positioning">
              Positioning
            </label>
            <textarea
              id="positioning"
              className="sx-textarea"
              value={ws.positioning}
              onChange={setField('positioning')}
            />
          </div>

          <div className="sx-field">
            <label className="sx-label" htmlFor="audience">
              Audience
            </label>
            <textarea
              id="audience"
              className="sx-textarea"
              value={ws.audience}
              onChange={setField('audience')}
            />
          </div>

          <div className="sx-field">
            <label className="sx-label" htmlFor="pain">
              The problem they feel
            </label>
            <textarea
              id="pain"
              className="sx-textarea"
              value={ws.pain}
              onChange={setField('pain')}
            />
          </div>
        </Card>

        <Card
          title="The offer catalog"
          note="Digital, service and physical. The AI prices from here."
        >
          {ws.offers.map((offer, idx) => (
            <div key={offer.kind + idx} className="sx-field">
              <div
                className="sx-row-2"
                style={{ gridTemplateColumns: 'minmax(0, 1.4fr) 96px' }}
              >
                <input
                  className="sx-input"
                  aria-label={`${offer.kind} offer name`}
                  value={offer.name}
                  onChange={(e) => updateOffer(idx, 'name', e.target.value)}
                />
                <input
                  className="sx-input"
                  type="number"
                  aria-label={`${offer.kind} price`}
                  value={offer.price}
                  onChange={(e) => updateOffer(idx, 'price', e.target.value)}
                />
              </div>
              <input
                className="sx-input"
                style={{ marginTop: 6 }}
                aria-label={`${offer.kind} promise`}
                value={offer.promise}
                onChange={(e) => updateOffer(idx, 'promise', e.target.value)}
              />
              <p
                className="sx-muted"
                style={{ marginTop: 5, textTransform: 'capitalize' }}
              >
                {offer.kind}
              </p>
            </div>
          ))}
        </Card>

        <Card
          title="The public page"
          note="What a stranger reads before they talk to the assistant."
        >
          <div className="sx-field">
            <label className="sx-label" htmlFor="headline">
              Headline
            </label>
            <input
              id="headline"
              className="sx-input"
              value={ws.landing_headline}
              onChange={setField('landing_headline')}
            />
          </div>
          <div className="sx-field">
            <label className="sx-label" htmlFor="subhead">
              Subhead
            </label>
            <textarea
              id="subhead"
              className="sx-textarea"
              value={ws.landing_subhead}
              onChange={setField('landing_subhead')}
            />
          </div>
          <div className="sx-field">
            <label className="sx-label" htmlFor="greeting">
              Chat greeting
            </label>
            <textarea
              id="greeting"
              className="sx-textarea"
              value={ws.chat_greeting}
              onChange={setField('chat_greeting')}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
