import { Badge, Card, PageHead } from '../components/UI';
import { Link } from '../lib/router';

export function HelpPage() {
  return (
    <div className="sx-page">
      <PageHead
        meta="Help & docs"
        title="How the autopilot thinks"
        lede="Three verticals, one loop. Read this once and the dashboard stops needing explanations."
      />

      <div className="sx-stack">
        <Card
          title="The three verticals"
          note="Every column on the board carries all three."
        >
          <div className="sx-stack" style={{ gap: 8 }}>
            <div className="sx-node">
              <span className="sx-node-label">Funnel stage</span>
              <span className="sx-node-title">Where the lead is</span>
              <span className="sx-node-note">
                Awareness → Interest → Nurture → Proposal → Conversion → Retention.
              </span>
            </div>
            <div className="sx-node" data-kind="activity">
              <span className="sx-node-label">Activity sequence</span>
              <span className="sx-node-title">What the AI does at that stage</span>
              <span className="sx-node-note">
                Chat, score, drip, pitch, object, check in.
              </span>
            </div>
            <div className="sx-node" data-kind="automation">
              <span className="sx-node-label">Automation</span>
              <span className="sx-node-title">What fires without you</span>
              <span className="sx-node-note">
                Triggers and delays, with the offer gate on anything a buyer reads.
              </span>
            </div>
          </div>
        </Card>

        <Card title="The loop, in order">
          <ol
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              lineHeight: 1.85,
              color: 'var(--sx-ink-2)',
            }}
          >
            <li>A stranger lands on the public page and the assistant greets them.</li>
            <li>They give a name, an email and a problem — that becomes a lead.</li>
            <li>
              The AI scores budget, need and timeline; hot leads escalate, cold ones get
              nurture.
            </li>
            <li>A hot lead gets a drafted offer and price, waiting in Approvals.</li>
            <li>You approve in one click — the email leaves with your name on it.</li>
            <li>Objections get an answer with proof; unusual ones come to you.</li>
            <li>When they pay, the lead turns green and onboarding fires.</li>
            <li>Thirty days later the retention trigger sends the next offer.</li>
            <li>
              Metrics and experiments feed the winner back to the top of the funnel.
            </li>
          </ol>
        </Card>

        <Card
          title="Keyboard shortcuts"
          note="The shell is built for quick movement."
        >
          <ul className="sx-list" id="shortcuts">
            <li className="sx-item">
              <div className="sx-item-main">
                <span className="sx-item-title">Collapse or expand the sidebar</span>
              </div>
              <span className="sx-item-meta sx-code">⌘ / Ctrl + B</span>
            </li>
            <li className="sx-item">
              <div className="sx-item-main">
                <span className="sx-item-title">Close a menu, search or the drawer</span>
              </div>
              <span className="sx-item-meta sx-code">Esc</span>
            </li>
            <li className="sx-item">
              <div className="sx-item-main">
                <span className="sx-item-title">Move through the navigation</span>
              </div>
              <span className="sx-item-meta sx-code">↑ ↓</span>
            </li>
            <li className="sx-item">
              <div className="sx-item-main">
                <span className="sx-item-title">Search leads from anywhere</span>
              </div>
              <span className="sx-item-meta sx-code">/</span>
            </li>
          </ul>
        </Card>

        <Card
          title="What's new"
          note="Built on integrated AI, scheduled runs, and real-time lead capture."
        >
          <ul className="sx-list" id="changelog">
            <li className="sx-item">
              <div className="sx-item-main">
                <span className="sx-item-title">Funnel board with drag and drop</span>
                <span className="sx-item-note">
                  Moves log themselves to the activity feed.
                </span>
              </div>
              <Badge tone="green">live</Badge>
            </li>
            <li className="sx-item">
              <div className="sx-item-main">
                <span className="sx-item-title">Approval gate on every offer</span>
                <span className="sx-item-note">
                  Nothing reaches a buyer without one click.
                </span>
              </div>
              <Badge tone="green">live</Badge>
            </li>
            <li className="sx-item">
              <div className="sx-item-main">
                <span className="sx-item-title">
                  Landing page assistant that captures leads
                </span>
                <span className="sx-item-note">
                  Email in the chat creates the lead instantly.
                </span>
              </div>
              <Badge tone="green">live</Badge>
            </li>
          </ul>
        </Card>

        <Card title="Support" note="Two ways to inspect or configure the system.">
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--sx-ink-2)',
            }}
            id="support"
          >
            Email delivery to external addresses routes through your connected Gmail,
            Mailchimp, or Klaviyo channels under Accounts &amp; wiring. Everything else
            runs directly inside this workspace.
          </p>
          <div className="sx-actions" style={{ marginTop: 14 }}>
            <Link to="/site" className="sx-btn sx-btn-ghost">
              Open the public page
            </Link>
            <Link to="/settings" className="sx-btn sx-btn-ghost">
              Brand settings
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
