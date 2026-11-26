import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, MessageSquare, Send, X } from 'lucide-react';
import { RisingSunBackdrop } from '../components/RisingSunBackdrop';
import { SunmedxMark } from '../components/Shell';
import { DEFAULT_WORKSPACE } from '../data/stages';
import { api } from '../lib/api';
import { Link } from '../lib/router';
import type { OfferItem } from '../types/funnel';

const DEFAULT_BRAND = {
  headline: DEFAULT_WORKSPACE.landing_headline,
  subhead: DEFAULT_WORKSPACE.landing_subhead,
  greeting: DEFAULT_WORKSPACE.chat_greeting,
  offers: DEFAULT_WORKSPACE.offers as OfferItem[],
};

const FUNNEL_BLUEPRINT = [
  {
    idx: '01',
    title: 'Signal intake',
    channel: 'Landing form & AI chat · Instant',
    rate: '2 min',
    trigger: 'Lead captured -> top of funnel',
    detail:
      'Visitors share sleep timing, caffeine, afternoon crash window, and budget without filling out a 20-page quiz.',
  },
  {
    idx: '02',
    title: 'Fit scoring & routing',
    channel: 'Autopilot scoring · Automatic',
    rate: '0–100',
    trigger: 'Score >= 70 -> hot queue',
    detail:
      'Every response is scored against need, budget, and urgency so warm leads get a gentle 3-part nurture and hot leads move fast.',
  },
  {
    idx: '03',
    title: 'Single-offer match',
    channel: 'Founder approval gate · Direct',
    rate: '1 offer',
    trigger: 'One-click send -> Buyer inbox',
    detail:
      'Instead of pushing a catalog, the AI drafts one tailored recommendation—digital protocol, 1:1 audit, or daily stack—for review.',
  },
  {
    idx: '04',
    title: 'Thirty-day check-in',
    channel: 'Retention loop · Day 30',
    rate: '1:1',
    trigger: 'Day-30 ping -> Protocol adjustment',
    detail:
      'At day thirty, an automated check-in verifies energy and adherence and triggers a clean adjustment or refill step.',
  },
];

const STEPS = [
  {
    label: '01. Signal intake',
    title: "Tell the assistant what's wrong",
    body: 'Two minutes of plain questions about your energy, sleep, and stress. No bloated survey wall.',
  },
  {
    label: '02. One clear match',
    title: 'Get a single recommendation',
    body: 'Not a dozen upsells. The one Sunmedx offer that matches your daily signals and budget.',
  },
  {
    label: '03. Thirty-day loop',
    title: 'Run it and adjust at day thirty',
    body: 'A practical morning-and-evening sequence with a real founder check-in when your first month wraps.',
  },
];

function ChatWidget({
  greeting,
  open,
  onOpenChange,
  seededPrompt,
  onClearSeed,
}: {
  greeting: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  seededPrompt: string;
  onClearSeed: () => void;
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'assistant' | 'visitor'; content: string }>>([
    { role: 'assistant', content: greeting },
  ]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].role === 'assistant') {
        return [{ role: 'assistant', content: greeting }];
      }
      return prev;
    });
  }, [greeting]);

  useEffect(() => {
    if (seededPrompt && open) {
      setInput(seededPrompt);
      onClearSeed();
    }
  }, [seededPrompt, open, onClearSeed]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    const nextMsgs = [...messages, { role: 'visitor' as const, content: text }];
    setMessages(nextMsgs);
    setInput('');
    setSending(true);
    setError('');
    try {
      const res = await api.ai.chat(nextMsgs.slice(-8));
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch {
      setError('The assistant is unavailable for a moment. Try again.');
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button className="cw-launcher" type="button" onClick={() => onOpenChange(true)}>
        <MessageSquare size={17} /> Ask about your energy
      </button>
    );
  }

  return (
    <div className="cw-shell" role="dialog" aria-label="Sunmedx assistant">
      <div className="cw-head">
        <div className="cw-head-who">
          <span className="cw-head-name">Sunmedx advisor</span>
          <span className="cw-head-status">Replies in seconds</span>
        </div>
        <button
          className="cw-close"
          type="button"
          aria-label="Close chat"
          onClick={() => onOpenChange(false)}
        >
          <X size={16} />
        </button>
      </div>

      <div className="cw-body">
        {messages.map((m, i) => (
          <div key={i} className="cw-msg" data-role={m.role}>
            {m.content}
          </div>
        ))}
        {sending && (
          <div className="cw-msg" data-role="assistant" style={{ opacity: 0.6 }}>
            …
          </div>
        )}
      </div>

      {error && (
        <p className="cw-hint" style={{ color: '#fda4af' }}>
          {error}
        </p>
      )}

      <form className="cw-form" onSubmit={send}>
        <input
          className="cw-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question…"
          aria-label="Your message"
        />
        <button
          className="cw-send"
          type="submit"
          disabled={sending || !input.trim()}
          aria-label="Send"
        >
          <Send size={15} />
        </button>
      </form>
      <p className="cw-hint">
        Leave your email in the chat and the founder will follow up personally.
      </p>
    </div>
  );
}

export function SitePage({
  isLoggedIn = false,
  operatorEmail,
}: {
  isLoggedIn?: boolean;
  operatorEmail?: string;
}) {
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [activeStep, setActiveStep] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [seededPrompt, setSeededPrompt] = useState('');
  const [captureEmail, setCaptureEmail] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [capturedLeadEmail, setCapturedLeadEmail] = useState('');
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  // Lead magnet form state
  const [magnetName, setMagnetName] = useState('');
  const [magnetEmail, setMagnetEmail] = useState('');
  const [magnetGoal, setMagnetGoal] = useState('Fix 2 PM afternoon crash');
  const [magnetTimeline, setMagnetTimeline] = useState('Starting this week');
  const [magnetSubmitting, setMagnetSubmitting] = useState(false);
  const [magnetError, setMagnetError] = useState('');
  const [magnetUnlocked, setMagnetUnlocked] = useState<{
    name: string;
    email: string;
    goal: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    api
      .brand()
      .then((res) => {
        if (active && res?.brand) {
          setBrand({
            headline: res.brand.headline || DEFAULT_BRAND.headline,
            subhead: res.brand.subhead || DEFAULT_BRAND.subhead,
            greeting: res.brand.greeting || DEFAULT_BRAND.greeting,
            offers: res.brand.offers?.length ? res.brand.offers : DEFAULT_BRAND.offers,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function handleLeadCapture(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = captureEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setCaptureError('Enter a valid email address so we can send your protocol.');
      return;
    }
    setCapturing(true);
    setCaptureError('');
    try {
      const nameGuess = cleaned.split('@')[0].replace(/[._-]+/g, ' ').trim();
      const displayName =
        nameGuess
          .split(' ')
          .filter(Boolean)
          .map((part) => part[0].toUpperCase() + part.slice(1))
          .join(' ') || 'Landing Visitor';
      await api.leads.create({
        full_name: displayName,
        email: cleaned,
        source: 'Landing page',
        interest: 'Digital protocol',
        stage: 'awareness',
        temperature: 'warm',
        score: 45,
        next_action: 'Review energy intake and match to best offer',
        last_touch: new Date().toISOString(),
      });
      setCapturedLeadEmail(cleaned);
      setCaptureEmail('');
    } catch {
      setCaptureError('Could not save right now. Try the advisor chat below.');
    } finally {
      setCapturing(false);
    }
  }

  async function handleMagnetSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = magnetName.trim();
    const cleanEmail = magnetEmail.trim().toLowerCase();
    if (!cleanName) {
      setMagnetError('Please enter your name so we can personalize your blueprint.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setMagnetError('Please enter a valid email address.');
      return;
    }
    setMagnetSubmitting(true);
    setMagnetError('');
    try {
      const isUrgent = magnetTimeline === 'Starting this week';
      await api.leads.create({
        full_name: cleanName,
        email: cleanEmail,
        source: 'Lead magnet form',
        interest: '30-Day Energy Blueprint',
        stage: 'interest',
        temperature: isUrgent ? 'hot' : 'warm',
        score: isUrgent ? 78 : 62,
        need_signal: magnetGoal,
        timeline_signal: magnetTimeline,
        notes: `Downloaded 30-Day Energy & Sleep Blueprint · Goal: ${magnetGoal}`,
        next_action: 'Deliver 30-Day Blueprint & send tailored Day-1 follow-up',
        last_touch: new Date().toISOString(),
      });
      setMagnetUnlocked({ name: cleanName, email: cleanEmail, goal: magnetGoal });
    } catch {
      setMagnetError('Could not deliver right now. Please try again in a moment.');
    } finally {
      setMagnetSubmitting(false);
    }
  }

  function downloadBlueprintFile() {
    if (!magnetUnlocked) return;
    const content = [
      'SUNMEDX · 30-DAY ENERGY & SLEEP PROTOCOL BLUEPRINT',
      '===================================================',
      `Prepared for: ${magnetUnlocked.name} (${magnetUnlocked.email})`,
      `Primary Focus: ${magnetUnlocked.goal}`,
      '',
      'PHASE 1 · DAYS 1–7 (MORNING ANCHOR)',
      '- Get 10 minutes of natural outdoor light within 30 minutes of waking.',
      '- Delay first caffeine 60–90 minutes after waking to flatten the 2 PM crash.',
      '- Pair hydration + electrolytes before your first meal.',
      '',
      'PHASE 2 · DAYS 8–18 (AFTERNOON RESCUE)',
      '- Keep lunch balanced around 30g+ protein and low glycemic volatility.',
      '- Take a 7-minute walk or sunlight reset around 1:30–2:30 PM.',
      '',
      'PHASE 3 · DAYS 19–30 (DEEP RECOVERY & AUDIT)',
      '- Dim overhead blue light 90 minutes before target sleep.',
      '- Complete your Day-30 Sunmedx check-in to refine your protocol stack.',
      '',
      'Questions? Reply to your Sunmedx advisor inside the landing chat anytime.',
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sunmedx-30-day-energy-blueprint.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function scrollToMagnet() {
    const el = document.getElementById('lead-magnet');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function focusCapture() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => emailInputRef.current?.focus(), 220);
  }

  const currentBlueprint = FUNNEL_BLUEPRINT[activeStep] || FUNNEL_BLUEPRINT[0];
  const dashboardTarget = isLoggedIn ? '/dashboard' : '/login';

  return (
    <div className="lp-root">
      <RisingSunBackdrop />
      <div className="lp-wrap">
        <nav className="lp-nav">
          <Link to="/" className="lp-brand">
            <SunmedxMark width={30} height={30} />
            <span>Sunmedx</span>
          </Link>
          <div className="lp-nav-links">
            <a href="#funnel">Funnel</a>
            <a href="#lead-magnet">Lead Magnet</a>
            <a href="#offers">Offers</a>
            <a href="#how">How it works</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link to={dashboardTarget} className="lp-btn lp-btn-sm lp-btn-cobalt">
              {isLoggedIn ? 'Open Dashboard' : 'Jump to Dashboard'}
            </Link>
            <button
              type="button"
              className="lp-btn lp-btn-sm lp-btn-primary"
              onClick={scrollToMagnet}
            >
              Free Blueprint
            </button>
          </div>
        </nav>

        <header className="lp-hero">
          <div>
            <p className="lp-eyebrow">Precision Energy Funnel · Onboarding Open</p>
            <h1 className="lp-h1">{brand.headline}</h1>
            <p className="lp-sub">{brand.subhead}</p>

            {capturedLeadEmail ? (
              <div
                style={{
                  marginTop: 26,
                  padding: '16px 18px',
                  borderRadius: 10,
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  background: 'rgba(16, 185, 129, 0.1)',
                  maxWidth: 520,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: '#6ee7b7',
                    fontWeight: 600,
                    fontSize: 13.5,
                  }}
                >
                  <CheckCircle2 size={17} /> Check-in started for {capturedLeadEmail}
                </div>
                <p style={{ margin: '6px 0 12px', fontSize: 12.5, color: '#cbd5e1' }}>
                  Answer two quick questions with the advisor to lock in your matched Sunmedx plan.
                </p>
                <button
                  type="button"
                  className="lp-btn lp-btn-sm lp-btn-cobalt"
                  onClick={() => {
                    setSeededPrompt(
                      `Hi, I just signed up with ${capturedLeadEmail}. Can you help match me to the right protocol?`
                    );
                    setChatOpen(true);
                  }}
                >
                  Open AI advisor <ArrowRight size={14} />
                </button>
              </div>
            ) : (
              <>
                <form className="lp-capture" onSubmit={handleLeadCapture} noValidate>
                  <input
                    ref={emailInputRef}
                    type="email"
                    className="lp-capture-input"
                    placeholder="Enter your email for a custom 30-day protocol"
                    aria-label="Email address"
                    value={captureEmail}
                    onChange={(e) => {
                      setCaptureEmail(e.target.value);
                      if (captureError) setCaptureError('');
                    }}
                  />
                  <button type="submit" className="lp-btn lp-btn-primary" disabled={capturing}>
                    {capturing ? 'Starting…' : 'Get My Protocol'} <ArrowRight size={15} />
                  </button>
                </form>
                {captureError ? (
                  <p className="lp-capture-note" style={{ color: '#fda4af' }} role="alert">
                    {captureError}
                  </p>
                ) : (
                  <p className="lp-capture-note">
                    2-minute intake · No spam sequences · Or{' '}
                    <button
                      type="button"
                      onClick={() => setChatOpen(true)}
                      style={{
                        background: 'none',
                        border: 0,
                        padding: 0,
                        color: '#60a5fa',
                        font: 'inherit',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textUnderlineOffset: 3,
                      }}
                    >
                      chat with the advisor directly
                    </button>
                  </p>
                )}
              </>
            )}

            <div className="lp-proof">
              <div>
                <strong>2 min</strong>
                to your recommendation
              </div>
              <div>
                <strong>30 days</strong>
                to a protocol that holds
              </div>
              <div>
                <strong>1:1</strong>
                with the founder, not a bot
              </div>
            </div>
          </div>

          <div className="lp-panel" id="funnel">
            <div className="lp-panel-title">
              <span>Interactive funnel flow</span>
              <span style={{ color: '#fb923c' }}>4 connected steps</span>
            </div>

            <div className="lp-builder-steps">
              {FUNNEL_BLUEPRINT.map((step, idx) => (
                <button
                  key={step.idx}
                  type="button"
                  className="lp-builder-step"
                  data-active={activeStep === idx ? 'true' : undefined}
                  onClick={() => setActiveStep(idx)}
                >
                  <span className="lp-builder-idx">{step.idx}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="lp-builder-name">{step.title}</span>
                    <span className="lp-builder-meta">{step.channel}</span>
                  </span>
                  <span className="lp-builder-metric">{step.rate}</span>
                </button>
              ))}
            </div>

            <div className="lp-builder-inspector">
              <strong>
                Step {currentBlueprint.idx} trigger: {currentBlueprint.trigger}
              </strong>
              <p>{currentBlueprint.detail}</p>
            </div>
          </div>
        </header>

        <section className="lp-magnet-section" id="lead-magnet">
          <div className="lp-magnet-grid">
            <div className="lp-magnet-copy">
              <p className="lp-eyebrow">Free Lead Magnet · Instant Protocol Guide</p>
              <h2 className="lp-magnet-title">
                Download the 30-Day Energy &amp; Cortisol Reset Blueprint
              </h2>
              <p className="lp-magnet-sub">
                Want to fix afternoon fatigue before booking a consult? Grab our structured 3-phase
                daily playbook—customized to your top bottleneck and delivered right away.
              </p>
              <ul className="lp-magnet-list">
                <li>
                  <CheckCircle2 size={16} />
                  <span>Morning light &amp; caffeine timing map to stabilize focus</span>
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  <span>2:00 PM crash rescue checklist without extra stimulants</span>
                </li>
                <li>
                  <CheckCircle2 size={16} />
                  <span>Day-30 reflection template synced with your Sunmedx intake</span>
                </li>
              </ul>
            </div>

            <div className="lp-magnet-card">
              {magnetUnlocked ? (
                <div className="lp-magnet-success">
                  <div className="lp-magnet-success-head">
                    <CheckCircle2 size={20} />
                    <span>Blueprint unlocked for {magnetUnlocked.name}</span>
                  </div>
                  <p>
                    We saved your intake for <strong>{magnetUnlocked.email}</strong> focused on{' '}
                    <strong>{magnetUnlocked.goal}</strong>.
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                    <button
                      type="button"
                      className="lp-btn lp-btn-primary"
                      onClick={downloadBlueprintFile}
                    >
                      Download Blueprint (.txt) <ArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      className="lp-btn lp-btn-cobalt"
                      onClick={() => {
                        setSeededPrompt(
                          `I just grabbed the 30-Day Blueprint for "${magnetUnlocked.goal}" (${magnetUnlocked.email}). What should my Day-1 step be?`
                        );
                        setChatOpen(true);
                      }}
                    >
                      Ask Advisor
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleMagnetSubmit} noValidate>
                  <div className="lp-magnet-card-head">
                    <strong>Send me the free blueprint</strong>
                    <span>Instant download · 0 spam</span>
                  </div>

                  <div className="lp-magnet-fields">
                    <div className="lp-magnet-field">
                      <label htmlFor="lm-name">Full name</label>
                      <input
                        id="lm-name"
                        type="text"
                        placeholder="Alex Rivera"
                        value={magnetName}
                        onChange={(e) => {
                          setMagnetName(e.target.value);
                          if (magnetError) setMagnetError('');
                        }}
                      />
                    </div>

                    <div className="lp-magnet-field">
                      <label htmlFor="lm-email">Email address</label>
                      <input
                        id="lm-email"
                        type="email"
                        placeholder="alex@company.com"
                        value={magnetEmail}
                        onChange={(e) => {
                          setMagnetEmail(e.target.value);
                          if (magnetError) setMagnetError('');
                        }}
                      />
                    </div>

                    <div className="lp-magnet-row">
                      <div className="lp-magnet-field">
                        <label htmlFor="lm-goal">Primary goal</label>
                        <select
                          id="lm-goal"
                          value={magnetGoal}
                          onChange={(e) => setMagnetGoal(e.target.value)}
                        >
                          <option>Fix 2 PM afternoon crash</option>
                          <option>Deeper uninterrupted sleep</option>
                          <option>Steady morning focus</option>
                          <option>Full 30-day metabolic reset</option>
                        </select>
                      </div>

                      <div className="lp-magnet-field">
                        <label htmlFor="lm-timeline">When to start</label>
                        <select
                          id="lm-timeline"
                          value={magnetTimeline}
                          onChange={(e) => setMagnetTimeline(e.target.value)}
                        >
                          <option>Starting this week</option>
                          <option>Within 30 days</option>
                          <option>Just exploring</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {magnetError && (
                    <p role="alert" style={{ margin: '10px 0 0', fontSize: 12, color: '#fda4af' }}>
                      {magnetError}
                    </p>
                  )}

                  <button
                    type="submit"
                    className="lp-btn lp-btn-primary"
                    disabled={magnetSubmitting}
                    style={{ width: '100%', marginTop: 16 }}
                  >
                    {magnetSubmitting ? 'Unlocking…' : 'Get Free Blueprint'} <ArrowRight size={15} />
                  </button>
                </form>
              )}
            </div>
          </div>
        </section>

        <section id="offers" style={{ paddingTop: 12 }}>
          <h2 className="lp-section-title">Three ways to work with Sunmedx</h2>
          <p className="lp-section-note">
            Digital first, a human service if you want one, and the daily physical stack when it
            fits.
          </p>
          <div className="lp-offers">
            {brand.offers.slice(0, 3).map((offer, idx) => {
              const featured = idx === 1 || offer.kind === 'service';
              return (
                <article
                  key={offer.name}
                  className="lp-offer"
                  data-featured={featured ? 'true' : undefined}
                >
                  <div className="lp-offer-kicker">
                    <span style={{ textTransform: 'capitalize' }}>{offer.kind} offer</span>
                    {featured && <span>Most chosen</span>}
                  </div>
                  <h3>{offer.name}</h3>
                  <p>{offer.promise}</p>
                  <div className="lp-offer-foot">
                    <div className="lp-price">${Math.round(Number(offer.price) || 0)}</div>
                    <button
                      type="button"
                      className={`lp-btn lp-btn-sm ${featured ? 'lp-btn-primary' : 'lp-btn-ghost'}`}
                      onClick={() => {
                        setSeededPrompt(
                          `I'm interested in ${offer.name} ($${Math.round(Number(offer.price) || 0)}). Is it the right fit for me?`
                        );
                        setChatOpen(true);
                      }}
                    >
                      Select offer
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="how" style={{ paddingBottom: 8 }}>
          <h2 className="lp-section-title">Built for conversion, not guesswork</h2>
          <p className="lp-section-note">
            Three structured steps that turn a single question into a 30-day protocol.
          </p>
          <div className="lp-steps">
            {STEPS.map((st) => (
              <div key={st.label} className="lp-step">
                <span>{st.label}</span>
                <h4>{st.title}</h4>
                <p>{st.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-cta-banner" id="start">
          <div>
            <h2 className="lp-section-title" style={{ marginBottom: 6 }}>
              Ready to map your energy &amp; sleep protocol?
            </h2>
            <p className="lp-section-note" style={{ marginBottom: 0 }}>
              Start your 2-minute intake or jump straight into the operator dashboard.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button type="button" className="lp-btn lp-btn-primary" onClick={focusCapture}>
              Get My Protocol <ArrowRight size={15} />
            </button>
            <Link to={dashboardTarget} className="lp-btn lp-btn-cobalt">
              {isLoggedIn ? 'Open Dashboard' : 'Jump to Dashboard'}
            </Link>
          </div>
        </section>

        <footer className="lp-foot">
          <span>Sunmedx · precision wellness. Not medical advice.</span>
          <span style={{ display: 'inline-flex', gap: 18, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              style={{
                background: 'none',
                border: 0,
                padding: 0,
                color: '#94a8cc',
                font: 'inherit',
                cursor: 'pointer',
              }}
            >
              Ask the advisor
            </button>
            <Link to={dashboardTarget} style={{ color: '#94a8cc', textDecoration: 'none' }}>
              {isLoggedIn && operatorEmail
                ? `Dashboard (${operatorEmail})`
                : 'Jump to dashboard'}
            </Link>
          </span>
        </footer>
      </div>

      <ChatWidget
        greeting={brand.greeting}
        open={chatOpen}
        onOpenChange={setChatOpen}
        seededPrompt={seededPrompt}
        onClearSeed={() => setSeededPrompt('')}
      />
    </div>
  );
}
