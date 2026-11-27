import type { Channel } from '../src/types/funnel.ts';

export interface EmailRuntimeConfig {
  brevoApiKey?: string;
  brevoSenderEmail?: string;
  brevoSenderName?: string;
  resendApiKey?: string;
}

export interface SendEmailInput {
  toEmail: string;
  toName?: string;
  subject: string;
  textBody: string;
  htmlContent?: string;
  fromEmail?: string;
  fromName?: string;
}

export interface SendEmailResult {
  ok: boolean;
  provider: 'brevo' | 'resend' | 'none';
  messageId?: string;
  senderEmail?: string;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value?: string | null): boolean {
  return Boolean(value && EMAIL_RE.test(value.trim()));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtmlEmail(textBody: string, brandName: string): string {
  const safeBrand = escapeHtml(brandName);
  const safeParagraphs = textBody
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;line-height:1.6;">${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');

  return [
    '<!doctype html>',
    '<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#0f172a;">',
    '<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:28px;">',
    `<div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:18px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;">${safeBrand}</div>`,
    `<div style="font-size:14.5px;color:#1e293b;">${safeParagraphs}</div>`,
    `<div style="margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">Sent via ${safeBrand} Funnel Autopilot</div>`,
    '</div></body></html>',
  ].join('');
}

async function resolveBrevoSender(
  apiKey: string,
  preferredEmail?: string,
  preferredName?: string
): Promise<{ email: string; name: string } | null> {
  if (isValidEmail(preferredEmail)) {
    return {
      email: preferredEmail!.trim().toLowerCase(),
      name: (preferredName || 'Sunmedx').trim(),
    };
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/senders', {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      senders?: Array<{ email?: string; name?: string; active?: boolean }>;
    };
    const senders = Array.isArray(data.senders) ? data.senders : [];
    const chosen =
      senders.find((s) => s.active && isValidEmail(s.email)) ||
      senders.find((s) => isValidEmail(s.email));
    if (!chosen?.email) return null;
    return {
      email: chosen.email.trim().toLowerCase(),
      name: (preferredName || chosen.name || 'Sunmedx').trim(),
    };
  } catch {
    return null;
  }
}

export function resolveChannelSender(
  channels: Channel[],
  envConfig: EmailRuntimeConfig
): string {
  const brevo = channels.find((c) => c.key === 'brevo');
  if (isValidEmail(brevo?.sender_email)) {
    return brevo!.sender_email!.trim().toLowerCase();
  }
  if (isValidEmail(envConfig.brevoSenderEmail)) {
    return envConfig.brevoSenderEmail!.trim().toLowerCase();
  }
  const emailWithSender = channels.find(
    (c) => c.kind === 'email' && c.enabled && isValidEmail(c.sender_email)
  );
  if (emailWithSender?.sender_email) {
    return emailWithSender.sender_email.trim().toLowerCase();
  }
  return '';
}

export async function resolveActiveEmailSender(
  runtime: EmailRuntimeConfig,
  preferredEmail?: string,
  preferredName?: string
): Promise<{ email: string; name: string } | null> {
  const brevoKey = runtime.brevoApiKey?.trim();
  if (brevoKey) {
    return resolveBrevoSender(
      brevoKey,
      preferredEmail || runtime.brevoSenderEmail,
      preferredName || runtime.brevoSenderName
    );
  }
  const fallbackEmail = (preferredEmail || runtime.brevoSenderEmail || '').trim().toLowerCase();
  if (isValidEmail(fallbackEmail)) {
    return {
      email: fallbackEmail,
      name: (preferredName || runtime.brevoSenderName || 'Sunmedx').trim(),
    };
  }
  return null;
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
  runtime: EmailRuntimeConfig
): Promise<SendEmailResult> {
  const toEmail = input.toEmail.trim().toLowerCase();
  const subject = input.subject.trim();
  const textBody = input.textBody.trim();
  const brandName = (input.fromName || runtime.brevoSenderName || 'Sunmedx').trim();

  if (!isValidEmail(toEmail)) {
    return { ok: false, provider: 'none', error: 'Recipient email address is invalid.' };
  }
  if (!subject || !textBody) {
    return { ok: false, provider: 'none', error: 'Email subject and body cannot be empty.' };
  }

  const brevoKey = runtime.brevoApiKey?.trim();
  if (brevoKey) {
    const sender = await resolveBrevoSender(
      brevoKey,
      input.fromEmail || runtime.brevoSenderEmail,
      brandName
    );
    if (!sender) {
      return {
        ok: false,
        provider: 'brevo',
        error:
          'Brevo requires a verified sender email. Add a verified sender in Brevo, then save it in Channels → Brevo Setup Wizard or set BREVO_SENDER_EMAIL in Cloudflare Variables and Secrets.',
      };
    }

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'api-key': brevoKey,
        },
        body: JSON.stringify({
          sender: { name: sender.name, email: sender.email },
          replyTo: { name: sender.name, email: sender.email },
          to: [
            {
              email: toEmail,
              name: (input.toName || toEmail.split('@')[0]).trim(),
            },
          ],
          subject,
          textContent: textBody,
          htmlContent: input.htmlContent?.trim() || buildHtmlEmail(textBody, sender.name),
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        messageId?: string;
        message?: string;
        code?: string;
      };

      if (!res.ok) {
        const detail = payload.message || payload.code || `HTTP ${res.status}`;
        return {
          ok: false,
          provider: 'brevo',
          senderEmail: sender.email,
          error: `Brevo rejected send (${res.status}): ${detail}`,
        };
      }

      return {
        ok: true,
        provider: 'brevo',
        messageId: payload.messageId || 'sent',
        senderEmail: sender.email,
      };
    } catch (err) {
      return {
        ok: false,
        provider: 'brevo',
        error: `Brevo network error: ${(err as Error).message}`,
      };
    }
  }

  const resendKey = runtime.resendApiKey?.trim();
  if (resendKey) {
    const senderEmail = input.fromEmail || runtime.brevoSenderEmail || '';
    if (!isValidEmail(senderEmail)) {
      return {
        ok: false,
        provider: 'resend',
        error:
          'Verified Sender Email is required for Resend. Set it in Channels → Resend Wizard or BREVO_SENDER_EMAIL.',
      };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${brandName} <${senderEmail}>`,
          to: [toEmail],
          subject,
          text: textBody,
          html: input.htmlContent?.trim() || buildHtmlEmail(textBody, brandName),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
      };
      if (!res.ok) {
        return {
          ok: false,
          provider: 'resend',
          senderEmail,
          error: `Resend rejected send (${res.status}): ${payload.message || 'Unknown error'}`,
        };
      }
      return {
        ok: true,
        provider: 'resend',
        messageId: payload.id || 'sent',
        senderEmail,
      };
    } catch (err) {
      return {
        ok: false,
        provider: 'resend',
        error: `Resend network error: ${(err as Error).message}`,
      };
    }
  }

  return {
    ok: false,
    provider: 'none',
    error:
      'No email provider API key is active on the server. Add BREVO_API_KEY (and BREVO_SENDER_EMAIL) in Cloudflare Workers → Settings → Variables and Secrets, then redeploy.',
  };
}

export async function syncBrevoContact(
  params: {
    email: string;
    fullName: string;
    source: string;
    interest: string;
    listIdRaw?: string;
  },
  brevoApiKey?: string
): Promise<{ synced: boolean; error?: string }> {
  const apiKey = brevoApiKey?.trim();
  if (!apiKey || !isValidEmail(params.email)) {
    return { synced: false };
  }

  const numericMatch = (params.listIdRaw || '').match(/\d+/);
  const listIds = numericMatch ? [Number(numericMatch[0])] : undefined;
  const firstName = params.fullName.trim().split(/\s+/)[0] || params.fullName.trim();

  try {
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        email: params.email.trim().toLowerCase(),
        attributes: {
          FIRSTNAME: firstName,
          SOURCE: params.source,
          INTEREST: params.interest,
        },
        ...(listIds ? { listIds } : {}),
        updateEnabled: true,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return { synced: false, error: data.message || `HTTP ${res.status}` };
    }
    return { synced: true };
  } catch (err) {
    return { synced: false, error: (err as Error).message };
  }
}
