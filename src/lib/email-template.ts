import type {
  EmailTemplate,
  EmailTemplateCategory,
  EmailTemplateTheme,
  WorkspaceSettings,
} from '../types/funnel.ts';

export interface EmailTemplateDraft {
  name: string;
  category: EmailTemplateCategory;
  theme: EmailTemplateTheme;
  subject: string;
  preheader: string;
  badge: string;
  headline: string;
  body: string;
  offer_title?: string;
  offer_price?: string;
  cta_label: string;
  cta_url: string;
  logo_url?: string;
  sender_name?: string;
  sender_role?: string;
  sender_email?: string;
  sender_website?: string;
  sender_address?: string;
  footer_note: string;
}

export interface RenderEmailOptions {
  assetBaseUrl?: string;
  defaultSenderEmail?: string;
  defaultSenderName?: string;
  defaultWebsite?: string;
  unsubscribeUrl?: string;
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeEmailUrl(raw?: string, fallback = 'https://sunmedx-funnel.workers.dev'): string {
  const trimmed = String(raw || '').trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return fallback;
}

export function sanitizeLogoUrl(raw?: string, assetBaseUrl?: string): string {
  const cleanBase = String(assetBaseUrl || '').trim().replace(/\/+$/, '');
  const trimmed = String(raw || '').trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed)) {
    return trimmed;
  }
  const relPath = trimmed.startsWith('/') ? trimmed : '/sunmedx-logo.png';
  return cleanBase ? `${cleanBase}${relPath}` : relPath;
}

export function applyPersonalization(text: string, firstName?: string): string {
  const cleanName = (firstName || 'there').trim() || 'there';
  return String(text || '').replace(/\{\{\s*first_name\s*\}\}/gi, cleanName);
}

export function personalizeTemplate<T extends EmailTemplateDraft>(
  template: T,
  firstName?: string
): T {
  return {
    ...template,
    subject: applyPersonalization(template.subject, firstName),
    preheader: applyPersonalization(template.preheader, firstName),
    badge: applyPersonalization(template.badge, firstName),
    headline: applyPersonalization(template.headline, firstName),
    body: applyPersonalization(template.body, firstName),
    offer_title: template.offer_title
      ? applyPersonalization(template.offer_title, firstName)
      : undefined,
    offer_price: template.offer_price,
    cta_label: applyPersonalization(template.cta_label, firstName),
    footer_note: applyPersonalization(template.footer_note, firstName),
  };
}

export function renderPromoEmailText(
  template: EmailTemplateDraft,
  brandName = 'Sunmedx',
  options?: RenderEmailOptions
): string {
  const parts: string[] = [];
  if (template.badge?.trim()) parts.push(`[${template.badge.trim()}]`);
  if (template.headline?.trim()) parts.push(template.headline.trim());
  if (template.body?.trim()) parts.push(template.body.trim());
  if (template.offer_title?.trim()) {
    parts.push(
      `Featured Offer: ${template.offer_title.trim()}${
        template.offer_price?.trim() ? ` — ${template.offer_price.trim()}` : ''
      }`
    );
  }
  if (template.cta_label?.trim()) {
    parts.push(`${template.cta_label.trim()}: ${sanitizeEmailUrl(template.cta_url)}`);
  }

  const senderName = (template.sender_name || options?.defaultSenderName || brandName).trim();
  const senderRole = (template.sender_role || '').trim();
  const senderEmail = (template.sender_email || options?.defaultSenderEmail || '').trim();
  const senderWebsite = sanitizeEmailUrl(
    template.sender_website || options?.defaultWebsite || template.cta_url
  );
  const senderAddress = (template.sender_address || '').trim();

  const signatureLines: string[] = [
    senderRole ? `${senderName} — ${senderRole}` : senderName,
  ];
  if (senderEmail) signatureLines.push(`Email: ${senderEmail}`);
  if (senderWebsite) signatureLines.push(`Web: ${senderWebsite}`);
  if (senderAddress) signatureLines.push(senderAddress);
  signatureLines.push(
    template.footer_note?.trim() || `${brandName} · Precision wellness protocols.`
  );
  if (options?.unsubscribeUrl) {
    signatureLines.push(`Unsubscribe: ${options.unsubscribeUrl}`);
  }
  parts.push(`---\n${signatureLines.join('\n')}`);
  return parts.join('\n\n');
}

export function renderPromoEmailHtml(
  template: EmailTemplateDraft,
  brandName = 'Sunmedx',
  firstName?: string,
  options?: RenderEmailOptions
): string {
  const t = firstName ? personalizeTemplate(template, firstName) : template;
  const safeBrand = escapeHtml(brandName || 'Sunmedx');
  const safePreheader = escapeHtml(t.preheader || t.headline || '');
  const safeBadge = escapeHtml(t.badge || 'BRAND SPOTLIGHT');
  const safeHeadline = escapeHtml(t.headline || 'Build steady energy you can plan around');
  const safeOfferTitle = escapeHtml(t.offer_title || '');
  const safeOfferPrice = escapeHtml(t.offer_price || '');
  const safeCtaLabel = escapeHtml(t.cta_label || 'Explore the protocol');
  const safeCtaUrl = escapeHtml(sanitizeEmailUrl(t.cta_url));

  const resolvedLogoUrl = sanitizeLogoUrl(t.logo_url, options?.assetBaseUrl);
  const safeLogoUrl = escapeHtml(resolvedLogoUrl);

  const senderName = (t.sender_name || options?.defaultSenderName || brandName || 'Sunmedx').trim();
  const senderRole = (t.sender_role || '').trim();
  const senderEmail = (t.sender_email || options?.defaultSenderEmail || '').trim();
  const rawWebsite = (t.sender_website || options?.defaultWebsite || t.cta_url || '').trim();
  const safeWebsiteUrl = rawWebsite ? escapeHtml(sanitizeEmailUrl(rawWebsite)) : '';
  const displayWebsite = safeWebsiteUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const senderAddress = (t.sender_address || '').trim();
  const safeFooterNote = escapeHtml(
    t.footer_note || `You received this brand update from ${brandName}. Reply directly anytime.`
  );
  const rawUnsubscribe = (options?.unsubscribeUrl || '').trim();
  const safeUnsubscribeUrl = rawUnsubscribe
    ? escapeHtml(
        /^https?:\/\//i.test(rawUnsubscribe) ||
          rawUnsubscribe.startsWith('/unsubscribe') ||
          rawUnsubscribe === '#unsubscribe'
          ? rawUnsubscribe
          : '#unsubscribe'
      )
    : '';

  const paragraphsHtml = (t.body || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 15px;font-size:15px;line-height:1.68;color:#334155;">${escapeHtml(
          block
        ).replace(/\n/g, '<br />')}</p>`
    )
    .join('');

  const theme = t.theme || 'sunrise';
  const palette =
    theme === 'midnight'
      ? {
          outerBg: '#eef2f9',
          heroBg: '#070f24',
          heroBorder: '#2563eb',
          badgeBg: 'rgba(37, 99, 235, 0.22)',
          badgeColor: '#93c5fd',
          heroTitle: '#f8fafc',
          brandInk: '#60a5fa',
          accentHex: '#2563eb',
          ctaBg: '#2563eb',
          ctaColor: '#ffffff',
          offerBg: '#f8fafc',
          offerBorder: '#cbd5e1',
          offerPriceColor: '#1d4ed8',
          logoBoxBg: '#070f24',
        }
      : theme === 'minimal'
        ? {
            outerBg: '#f8fafc',
            heroBg: '#ffffff',
            heroBorder: '#e2e8f0',
            badgeBg: '#fff7ed',
            badgeColor: '#c2410c',
            heroTitle: '#0f172a',
            brandInk: '#f97316',
            accentHex: '#0f172a',
            ctaBg: '#0f172a',
            ctaColor: '#ffffff',
            offerBg: '#f8fafc',
            offerBorder: '#e2e8f0',
            offerPriceColor: '#ea580c',
            logoBoxBg: '#0f172a',
          }
        : {
            outerBg: '#f3f4f8',
            heroBg: '#080e21',
            heroBorder: '#f97316',
            badgeBg: 'rgba(249, 115, 22, 0.18)',
            badgeColor: '#fdba74',
            heroTitle: '#ffffff',
            brandInk: '#fb923c',
            accentHex: '#f97316',
            ctaBg: '#f97316',
            ctaColor: '#ffffff',
            offerBg: '#fff7ed',
            offerBorder: '#fed7aa',
            offerPriceColor: '#ea580c',
            logoBoxBg: '#080e21',
          };

  const offerCardHtml = safeOfferTitle
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:${palette.offerBg};border:1px solid ${palette.offerBorder};border-radius:10px;">
        <tr>
          <td style="padding:16px 18px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="font-size:14px;font-weight:700;color:#0f172a;line-height:1.4;">${safeOfferTitle}</td>
                ${
                  safeOfferPrice
                    ? `<td align="right" style="font-size:16px;font-weight:700;color:${palette.offerPriceColor};white-space:nowrap;padding-left:12px;">${safeOfferPrice}</td>`
                    : ''
                }
              </tr>
            </table>
          </td>
        </tr>
      </table>`
    : '';

  const senderMetaItems: string[] = [];
  if (senderEmail) {
    const safeEmail = escapeHtml(senderEmail);
    senderMetaItems.push(
      `<a href="mailto:${safeEmail}" style="color:#334155;text-decoration:none;font-weight:500;">${safeEmail}</a>`
    );
  }
  if (safeWebsiteUrl) {
    senderMetaItems.push(
      `<a href="${safeWebsiteUrl}" target="_blank" rel="noopener noreferrer" style="color:${palette.accentHex};text-decoration:none;font-weight:500;">${escapeHtml(displayWebsite)}</a>`
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(t.subject || safeBrand)}</title>
</head>
<body style="margin:0;padding:0;background:${palette.outerBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${palette.outerBg};padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 12px 32px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:${palette.heroBg};padding:28px 30px 26px;border-bottom:3px solid ${palette.heroBorder};">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-bottom:18px;">
                <tr>
                  <td style="vertical-align:middle;padding-right:10px;">
                    <img src="${safeLogoUrl}" width="24" height="24" alt="${safeBrand}" style="display:block;width:24px;height:24px;border:0;border-radius:4px;" />
                  </td>
                  <td style="vertical-align:middle;font-size:15px;font-weight:700;color:${palette.brandInk};letter-spacing:-0.01em;">
                    ${safeBrand}
                  </td>
                </tr>
              </table>
              <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${palette.badgeBg};color:${palette.badgeColor};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:12px;">
                ${safeBadge}
              </div>
              <h1 style="margin:0;font-size:25px;line-height:1.22;font-weight:700;letter-spacing:-0.02em;color:${palette.heroTitle};">
                ${safeHeadline}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              ${paragraphsHtml}
              ${offerCardHtml}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px;">
                <tr>
                  <td style="border-radius:9px;background:${palette.ctaBg};">
                    <a href="${safeCtaUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 24px;font-size:14.5px;font-weight:700;color:${palette.ctaColor};text-decoration:none;letter-spacing:0.01em;">
                      ${safeCtaLabel} &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 30px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="52" valign="top" style="padding-right:14px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" style="width:42px;height:42px;background:${palette.logoBoxBg};border-radius:10px;border:1px solid #cbd5e1;">
                      <tr>
                        <td align="center" valign="middle" style="padding:7px;">
                          <img src="${safeLogoUrl}" width="26" height="26" alt="${safeBrand} logo" style="display:block;width:26px;height:26px;border:0;" />
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td valign="top">
                    <div style="font-size:13.5px;font-weight:700;color:#0f172a;line-height:1.35;">
                      ${escapeHtml(senderName)}${
                        senderRole
                          ? ` <span style="font-weight:500;color:#64748b;">&middot; ${escapeHtml(senderRole)}</span>`
                          : ''
                      }
                    </div>
                    ${
                      senderMetaItems.length > 0
                        ? `<div style="margin-top:4px;font-size:12.5px;line-height:1.5;color:#475569;">${senderMetaItems.join(' &nbsp;&bull;&nbsp; ')}</div>`
                        : ''
                    }
                    ${
                      senderAddress
                        ? `<div style="margin-top:3px;font-size:11.5px;line-height:1.45;color:#64748b;">${escapeHtml(senderAddress)}</div>`
                        : ''
                    }
                  </td>
                </tr>
              </table>
              <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11.5px;line-height:1.55;color:#64748b;">
                ${safeFooterNote}
                ${
                  safeUnsubscribeUrl
                    ? `<div style="margin-top:8px;">Do you want to stop getting messages from this mailing? <a href="${safeUnsubscribeUrl}" target="_blank" rel="noopener noreferrer" style="color:#475569;text-decoration:underline;font-weight:600;">Unsubscribe</a></div>`
                    : ''
                }
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function createDefaultPromoTemplates(
  workspace: WorkspaceSettings,
  appUrl = 'https://sunmedx-funnel.workers.dev'
): EmailTemplate[] {
  const brand = workspace.brand || 'Sunmedx';
  const primaryOffer = workspace.offers?.[0];
  const serviceOffer = workspace.offers?.[1] || workspace.offers?.[0];
  const now = new Date().toISOString();

  return [
    {
      id: 'tpl-brand-spotlight',
      name: `${brand} · Brand Promotion Spotlight`,
      category: 'brand_promo',
      theme: 'sunrise',
      subject: `Energy you can plan around — inside ${brand}`,
      preheader: 'Your calm, evidence-led 30-day sequence without guesswork.',
      badge: 'Brand Promotion',
      headline: workspace.landing_headline || 'Energy you can plan around.',
      body: `Hi {{first_name}},\n\nMost routines fail because they pile on pills before fixing timing.\n\n${brand} maps your morning light anchor, caffeine cutoff, and recovery window into one clear sequence — built for ${workspace.audience || 'busy professionals who want steady focus'}.\n\nStart with our core 30-day protocol and feel the afternoon shift within week one.`,
      offer_title: primaryOffer
        ? `${primaryOffer.name} — ${primaryOffer.promise}`
        : '30-Day Energy Reset Protocol',
      offer_price: primaryOffer ? `$${primaryOffer.price}` : '$29',
      cta_label: 'Claim Your Protocol',
      cta_url: appUrl,
      logo_url: '/sunmedx-logo.png',
      sender_name: `${brand} Team`,
      sender_role: workspace.positioning || 'Precision wellness protocols',
      sender_email: '',
      sender_website: appUrl,
      sender_address: 'Delivered via Brevo · Reply directly anytime',
      footer_note: `You received this brand update from ${brand}. Reply directly if you have any questions.`,
      created_date: now,
      updated_date: now,
    },
    {
      id: 'tpl-founder-launch',
      name: `${brand} · 1:1 Audit Launch Invite`,
      category: 'launch',
      theme: 'midnight',
      subject: `Direct 1:1 protocol slots open this week — ${brand}`,
      preheader: 'Work directly with the founder on your sleep, stress, and stamina.',
      badge: 'Limited Spots',
      headline: 'A protocol built from your own daily signals.',
      body: `Hi {{first_name}},\n\nIf you are tired of guessing what is draining your afternoon focus, we opened a small batch of 1:1 reviews this week.\n\nWe review your schedule, sleep timing, and current habits together — and send back a clean, realistic plan you can start tomorrow morning.`,
      offer_title: serviceOffer
        ? `${serviceOffer.name} — ${serviceOffer.promise}`
        : '1:1 Wellness Audit',
      offer_price: serviceOffer ? `$${serviceOffer.price}` : '$180',
      cta_label: 'Book Your Review',
      cta_url: appUrl,
      logo_url: '/sunmedx-logo.png',
      sender_name: `${brand} Founder Desk`,
      sender_role: '1:1 Energy & Sleep Review',
      sender_email: '',
      sender_website: appUrl,
      sender_address: 'Delivered via Brevo · Direct reply enabled',
      footer_note: `Sent by ${brand}. Simply reply to this email to reserve a review slot.`,
      created_date: now,
      updated_date: now,
    },
  ];
}
