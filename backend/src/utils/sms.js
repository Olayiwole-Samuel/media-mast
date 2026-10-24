// ── SMS (Termii) ──
// Configured by TERMII_API_KEY and TERMII_SENDER_ID (an approved 3–11
// character sender ID). TERMII_BASE_URL is the API host shown in your Termii
// dashboard (default https://api.ng.termii.com). Without a key nothing is
// sent and sendSms returns false. Never throws; never logs numbers or text.

const DEFAULT_BASE_URL = 'https://api.ng.termii.com';
const SEND_TIMEOUT_MS = 8000;

const isSmsConfigured = () => Boolean(process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID);

// Nigerian numbers to international format without "+": 0803… → 234803…
const normalisePhone = (phone) => {
    const digits = String(phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
    if (/^0\d{10}$/.test(digits)) return `234${digits.slice(1)}`;
    if (/^234\d{10}$/.test(digits)) return digits;
    if (/^\d{10,15}$/.test(digits)) return digits;
    return null;
};

const sendSms = async ({ to, text }) => {
    const number = normalisePhone(to);
    if (!isSmsConfigured() || !number || !text) return false;
    try {
        const base = String(process.env.TERMII_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
        const response = await fetch(`${base}/api/sms/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: process.env.TERMII_API_KEY,
                to: number,
                from: process.env.TERMII_SENDER_ID,
                sms: String(text).slice(0, 480),
                type: 'plain',
                channel: 'dnd', // transactional: reaches numbers on Do-Not-Disturb
            }),
            signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        });
        if (!response.ok) {
            console.error('⚠️ SMS not sent: provider returned', response.status);
            return false;
        }
        return true;
    } catch (error) {
        console.error('⚠️ SMS not sent:', error.name);
        return false;
    }
};

module.exports = { isSmsConfigured, normalisePhone, sendSms };
