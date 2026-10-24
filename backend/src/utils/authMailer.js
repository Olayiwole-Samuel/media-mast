// ── Auth email delivery ──
// Sent through utils/mailer.js (a no-op returning false until an email
// provider is configured). Never log the token or a URL containing it.
// Links carry the token in the URL fragment (#token=…), which browsers never
// send to a server, so it can't end up in access logs or Referer headers.

const { appUrl, renderEmail, sendEmail } = require('./mailer');

const formatExpiry = (expiresAt) => {
    const minutes = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000);
    if (!Number.isFinite(minutes) || minutes <= 0) return 'soon';
    if (minutes < 120) return `in ${minutes} minutes`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `in ${hours} hours`;
    return `in ${Math.round(hours / 24)} days`;
};

// Receives { email, token, expiresAt }. Returns true once an email was sent.
const sendPasswordResetEmail = async ({ email, token, expiresAt } = {}) => {
    if (!email || !token) return false;

    const { text, html } = renderEmail({
        heading: 'Reset your password',
        paragraphs: [
            'We received a request to reset the password for your Media Masters account.',
            `This link expires ${formatExpiry(expiresAt)} and can be used once.`,
        ],
        action: { label: 'Choose a new password', url: appUrl(`/reset-password#token=${encodeURIComponent(token)}`) },
        footer: 'If you did not ask for this, you can ignore this email; your password stays the same.',
    });

    return sendEmail({ to: email, subject: 'Reset your Media Masters password', text, html });
};

// Receives { email, name, companyName, token, expiresAt }.
const sendInvitationEmail = async ({ email, name, companyName, token, expiresAt } = {}) => {
    if (!email || !token) return false;

    const { text, html } = renderEmail({
        heading: `You're invited to ${companyName || 'a team'} on Media Masters`,
        paragraphs: [
            `Hi ${name || 'there'},`,
            `${companyName || 'A company'} has added you to its Media Masters team. Accept the invitation to choose your password and sign in.`,
            `This invitation expires ${formatExpiry(expiresAt)}.`,
        ],
        action: { label: 'Accept invitation', url: appUrl(`/accept-invite#token=${encodeURIComponent(token)}`) },
        footer: 'If you were not expecting this, you can ignore this email.',
    });

    return sendEmail({ to: email, subject: `Join ${companyName || 'your team'} on Media Masters`, text, html });
};

module.exports = {
    sendPasswordResetEmail,
    sendInvitationEmail,
};
