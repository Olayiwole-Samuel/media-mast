// ── Email delivery (Resend HTTP API, no SDK) ──
// Configured by RESEND_API_KEY and MAIL_FROM (e.g. "Media Masters <no-reply@yourdomain>").
// Without both, nothing is sent and every call returns false, so the app
// (and the offline tests) run with no email provider at all.
// sendEmail never throws and never logs addresses, tokens, keys or bodies.

const RESEND_URL = 'https://api.resend.com/emails';
const SEND_TIMEOUT_MS = 8000;
const DEFAULT_APP_URL = 'https://media-masters-x.vercel.app';

const isEmailConfigured = () =>
    Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

// Absolute link into the frontend (APP_URL, else the production site).
const appUrl = (path) =>
    `${String(process.env.APP_URL || DEFAULT_APP_URL).trim().replace(/\/+$/, '')}${path}`;

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

// One simple layout for every email: a heading, paragraphs, an optional
// button and a footer line. Returns both text and HTML versions.
const renderEmail = ({ heading, paragraphs = [], action, footer }) => {
    const text = [
        heading,
        '',
        ...paragraphs,
        ...(action ? ['', `${action.label}: ${action.url}`] : []),
        ...(footer ? ['', footer] : []),
        '',
        '— Media Masters',
    ].join('\n');

    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${escapeHtml(p)}</p>`).join('\n')}
${action ? `<p style="margin:20px 0"><a href="${escapeHtml(action.url)}" style="background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block;font-size:15px">${escapeHtml(action.label)}</a></p>` : ''}
${footer ? `<p style="font-size:13px;color:#71717a;margin:16px 0 0">${escapeHtml(footer)}</p>` : ''}
<p style="font-size:13px;color:#71717a;margin:16px 0 0">— Media Masters</p>
</div></body></html>`;

    return { text, html };
};

// Returns true once the provider accepted the email.
const sendEmail = async ({ to, subject, text, html }) => {
    const recipients = [].concat(to || []).filter((r) => typeof r === 'string' && r.includes('@'));
    if (!isEmailConfigured() || recipients.length === 0) return false;

    try {
        const response = await fetch(RESEND_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: process.env.MAIL_FROM,
                to: recipients,
                subject,
                text,
                html,
            }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });

        if (!response.ok) {
            console.error('⚠️ Email not sent: provider returned', response.status);
            return false;
        }
        return true;
    } catch (error) {
        console.error('⚠️ Email not sent:', error.name);
        return false;
    }
};

module.exports = {
    isEmailConfigured,
    appUrl,
    escapeHtml,
    renderEmail,
    sendEmail,
};
