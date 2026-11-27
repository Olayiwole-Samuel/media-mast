const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────
// PAYSTACK API CLIENT
//
// PAYSTACK_SECRET_KEY decides the mode:
//   not set     OFF      wallet top-ups stay in instant test mode (no real money)
//   sk_test_…   TEST     Paystack's own test mode (test cards, no real money)
//   sk_live_…   LIVE     real money
//   anything else, or PAYSTACK_REQUIRED=true with no key: INVALID. Funding
//   and payouts refuse rather than falling back to free test money.
//
// The key is only ever sent to api.paystack.co and never logged. Amounts
// cross this boundary in kobo.
// ─────────────────────────────────────────────────────────────

const API = 'https://api.paystack.co';
const TIMEOUT_MS = 20000;
const SIGNATURE_TOLERANCE_SECONDS = 300;

const secretKey = () => String(process.env.PAYSTACK_SECRET_KEY || '').trim();
const paystackRequired = () => String(process.env.PAYSTACK_REQUIRED || '').trim().toLowerCase() === 'true';

const paystackMode = () => {
    const key = secretKey();
    if (!key) return paystackRequired() ? 'INVALID' : 'OFF';
    if (/^sk_test_\w+$/.test(key)) return 'TEST';
    if (/^sk_live_\w+$/.test(key)) return 'LIVE';
    return 'INVALID';
};
const paystackEnabled = () => ['TEST', 'LIVE'].includes(paystackMode());

const toKobo = (naira) => Math.round(Number(naira) * 100);
const fromKobo = (kobo) => Math.round(Number(kobo)) / 100;

// answered: Paystack replied with a definite "no" (4xx). Otherwise (timeout,
// network, 5xx, unreadable reply) we don't know what happened on its side.
class PaystackError extends Error {
    constructor(message, { status = 0, answered = false } = {}) {
        super(message);
        this.name = 'PaystackError';
        this.status = status;
        this.answered = answered;
    }
}

// Tests swap this; production always uses the built-in fetch.
let doFetch = (...args) => fetch(...args);
const setPaystackFetchForTests = (fn) => { doFetch = fn || ((...args) => fetch(...args)); };

const request = async (method, path, body) => {
    if (!paystackEnabled()) throw new PaystackError('Paystack is not set up', { answered: true });
    let response;
    let parsed;
    try {
        response = await doFetch(`${API}${path}`, {
            method,
            headers: { Authorization: `Bearer ${secretKey()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        parsed = await response.json();
    } catch (error) {
        throw new PaystackError(`Could not reach Paystack (${error.name})`, { status: response ? response.status : 0 });
    }
    if (!response.ok || !parsed || parsed.status !== true) {
        throw new PaystackError(String((parsed && parsed.message) || `Paystack error ${response.status}`).slice(0, 300), {
            status: response.status,
            // 408/429 are "try again", not an answer.
            answered: response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status),
        });
    }
    return parsed;
};

// ── Collecting ──
const initializeTransaction = async ({ email, amount, reference, callbackUrl, cancelUrl, metadata = {} }) => {
    const { data } = await request('POST', '/transaction/initialize', {
        email,
        amount: String(toKobo(amount)),
        currency: 'NGN',
        reference,
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        metadata: { ...metadata, ...(cancelUrl ? { cancel_action: cancelUrl } : {}) },
    });
    let host = '';
    try {
        const u = new URL(data.authorization_url);
        host = u.protocol === 'https:' ? u.hostname : '';
    } catch { /* refused below */ }
    if (!/(^|\.)paystack\.(com|co)$/.test(host)) throw new PaystackError('Unexpected checkout address from Paystack', { answered: true });
    return { authorizationUrl: data.authorization_url, reference: data.reference };
};

const verifyTransaction = async (reference) => (await request('GET', `/transaction/verify/${encodeURIComponent(reference)}`)).data;

// ── Paying out ──
let bankCache = { mode: null, at: 0, banks: [] };
const listBanks = async () => {
    const mode = paystackMode();
    if (bankCache.mode === mode && bankCache.banks.length && Date.now() - bankCache.at < 24 * 3600000) return bankCache.banks;
    const banks = new Map();
    let next = null;
    for (let page = 0; page < 10; page += 1) {
        const res = await request('GET', `/bank?country=nigeria&currency=NGN&use_cursor=true&perPage=100${next ? `&next=${encodeURIComponent(next)}` : ''}`);
        for (const b of res.data || []) {
            if (b.code && b.active !== false && !b.is_deleted && !banks.has(String(b.code))) banks.set(String(b.code), { code: String(b.code), name: String(b.name) });
        }
        next = res.meta && res.meta.next;
        if (!next) break;
    }
    const list = [...banks.values()].sort((a, b) => a.name.localeCompare(b.name));
    bankCache = { mode, at: Date.now(), banks: list };
    return list;
};
const clearBankCache = () => { bankCache = { mode: null, at: 0, banks: [] }; };

const resolveAccount = async ({ accountNumber, bankCode }) =>
    (await request('GET', `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`)).data;

const createRecipient = async ({ name, accountNumber, bankCode }) =>
    (await request('POST', '/transferrecipient', { type: 'nuban', name, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' })).data;

const initiateTransfer = async ({ amount, recipient, reference, reason }) =>
    (await request('POST', '/transfer', { source: 'balance', amount: toKobo(amount), recipient, reference, reason, currency: 'NGN' })).data;

const finalizeTransfer = async ({ transferCode, otp }) =>
    (await request('POST', '/transfer/finalize_transfer', { transfer_code: transferCode, otp })).data;

const verifyTransfer = async (reference) => (await request('GET', `/transfer/verify/${encodeURIComponent(reference)}`)).data;

// Money on the Paystack balance, naira (what transfers are sent from).
const getBalance = async () => {
    const { data } = await request('GET', '/balance');
    const ngn = (data || []).find((b) => b.currency === 'NGN');
    return ngn ? fromKobo(ngn.balance) : 0;
};

// ── Webhook signatures ──
const hexMatches = (expected, hex) => /^[0-9a-f]{128}$/.test(hex) && crypto.timingSafeEqual(expected, Buffer.from(hex, 'hex'));

// Paystack-Signature: t=<unix>,v1=<key id>:<hmac of "t.body">, signed with the
// webhook signing secret (whsec_…; several, comma-separated, while rotating).
const verifySigningSecret = (rawBody, header, now) => {
    const secrets = String(process.env.PAYSTACK_WEBHOOK_SECRET || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!secrets.length || typeof header !== 'string') return false;
    let t = null;
    const signatures = [];
    for (const part of header.split(',')) {
        const i = part.indexOf('=');
        if (i === -1) continue;
        const key = part.slice(0, i).trim();
        const value = part.slice(i + 1).trim();
        if (key === 't') {
            if (t !== null || !/^\d+$/.test(value)) return false;
            t = Number(value);
        } else if (key === 'v1') {
            const j = value.indexOf(':');
            if (j !== -1) signatures.push(value.slice(j + 1));
        }
    }
    if (t === null || !signatures.length || Math.abs(now - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
    return secrets.some((secret) => {
        const expected = crypto.createHmac('sha512', secret).update(`${t}.`).update(rawBody).digest();
        return signatures.some((hex) => hexMatches(expected, hex));
    });
};

// Is this webhook really from Paystack? Either its signing-secret signature or
// the older x-paystack-signature (signed with the secret key) must match.
const verifyWebhookSignature = (rawBody, headers, now = Math.floor(Date.now() / 1000)) => {
    if (!Buffer.isBuffer(rawBody) || !paystackEnabled()) return false;
    if (verifySigningSecret(rawBody, headers['paystack-signature'], now)) return true;
    const legacy = headers['x-paystack-signature'];
    if (typeof legacy !== 'string') return false;
    return hexMatches(crypto.createHmac('sha512', secretKey()).update(rawBody).digest(), legacy);
};

module.exports = {
    PaystackError,
    paystackMode,
    paystackEnabled,
    toKobo,
    fromKobo,
    initializeTransaction,
    verifyTransaction,
    listBanks,
    clearBankCache,
    resolveAccount,
    createRecipient,
    initiateTransfer,
    finalizeTransfer,
    verifyTransfer,
    getBalance,
    verifyWebhookSignature,
    setPaystackFetchForTests,
};
