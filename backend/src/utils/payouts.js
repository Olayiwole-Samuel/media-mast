const PayoutRequest = require('../models/PayoutRequest');
const Station = require('../models/Station');
const paystack = require('./paystack');
const { notifyPayoutDecided, notifyPayoutProblem } = require('./notifications');

// ─────────────────────────────────────────────────────────────
// SENDING PAYOUTS WITH PAYSTACK TRANSFERS
//
// The money left the media house's earnings when it asked for the payout.
// PENDING → PROCESSING (an admin pressed Send) → PAID, or back to PENDING
// with the reason if Paystack says it failed, so the admin can retry or
// decline (which returns the money to their earnings).
//
// Never paying twice: the request is claimed before anything is sent, and
// each attempt has its own fixed reference. If we don't know what happened
// (timeout), it stays PROCESSING and the same reference is checked; a new
// reference is only used after Paystack says the last one definitely failed.
// ─────────────────────────────────────────────────────────────

const FAILED = ['failed', 'reversed', 'abandoned', 'blocked', 'rejected'];
// An unanswered send that Paystack still has no record of after this long never reached it.
const LOST_AFTER_MS = 30 * 60000;
const SWEEP_LIMIT = 25;

// Paystack: 16–50 characters, a–z 0–9 - _ only.
const referenceOf = (payout) => `mm-payout-${payout._id}-${payout.attempt || 1}`.toLowerCase();

const backToPending = async (payout, from, reason, { newAttempt }) => {
    const moved = await PayoutRequest.findOneAndUpdate(
        { _id: payout._id, status: { $in: from }, transferReference: payout.transferReference },
        {
            $set: {
                status: 'PENDING', failure: String(reason).slice(0, 300), transferStatus: null, transferCode: null, decidedAt: null, reference: null,
                ...(newAttempt ? { attempt: (payout.attempt || 1) + 1 } : {}),
            },
        },
        { returnDocument: 'after' }
    );
    if (moved) await notifyPayoutProblem(moved, reason);
    return moved;
};

// Record what Paystack says about a transfer.
const applyTransfer = async (payout, t) => {
    if (t.reference && t.reference !== payout.transferReference) return payout;
    if (t.amount != null && Number(t.amount) !== paystack.toKobo(payout.amount)) {
        await notifyPayoutProblem(payout, 'Paystack reports a different amount for this transfer');
        return payout;
    }
    if (t.status === 'success') {
        const paid = await PayoutRequest.findOneAndUpdate(
            { _id: payout._id, status: 'PROCESSING', transferReference: payout.transferReference },
            { $set: { status: 'PAID', reference: t.transfer_code || payout.transferReference, transferCode: t.transfer_code || payout.transferCode || null, transferStatus: 'success', failure: null, decidedAt: new Date() } },
            { returnDocument: 'after' }
        );
        if (paid) await notifyPayoutDecided(paid, (await Station.findById(paid.stationId).select('name')) || { _id: paid.stationId });
        return paid || PayoutRequest.findById(payout._id);
    }
    if (FAILED.includes(t.status)) {
        // A bank can send the money back after it was first reported sent.
        const reason = t.status === 'reversed' ? 'The bank returned the money' : `Paystack: transfer ${t.status}`;
        return (await backToPending(payout, ['PROCESSING', 'PAID'], reason, { newAttempt: true })) || PayoutRequest.findById(payout._id);
    }
    await PayoutRequest.updateOne(
        { _id: payout._id, status: 'PROCESSING', transferReference: payout.transferReference },
        { $set: { transferStatus: String(t.status || 'pending').slice(0, 40), transferCode: t.transfer_code || payout.transferCode || null } }
    );
    return PayoutRequest.findById(payout._id);
};

// Ask Paystack about a sent payout. Throws when it can't be reached.
const refreshPayout = async (payout, now = new Date()) => {
    if (payout.provider !== 'PAYSTACK' || !payout.transferReference || payout.mode !== paystack.paystackMode()) return payout;
    if (!['PROCESSING', 'PAID'].includes(payout.status)) return payout;
    let t;
    try {
        t = await paystack.verifyTransfer(payout.transferReference);
    } catch (error) {
        if (!error.answered || error.status === 401 || error.status === 403) throw error;
        // No such transfer. Shortly after an unanswered send it may still appear.
        if (payout.status === 'PROCESSING' && now - new Date(payout.sentAt || 0) >= LOST_AFTER_MS) {
            return (await backToPending(payout, ['PROCESSING'], 'Paystack did not receive this transfer', { newAttempt: false })) || payout;
        }
        return payout;
    }
    return t ? applyTransfer(payout, t) : payout;
};

// Admin pressed "Send with Paystack". Returns { payout } or { error, code }.
const sendPayout = async (id, actorId) => {
    const waiting = await PayoutRequest.findOne({ _id: id, status: 'PENDING' });
    if (!waiting) return { code: 409, error: 'This payout is no longer pending' };
    const { bankCode, accountNumber, accountName } = waiting.account || {};
    if (!bankCode) return { code: 400, error: 'This request has no Paystack bank on it. Pay it by hand and mark it paid, or decline it and ask the media house to choose its bank again.' };

    const payout = await PayoutRequest.findOneAndUpdate(
        { _id: waiting._id, status: 'PENDING' },
        {
            $set: {
                status: 'PROCESSING', provider: 'PAYSTACK', mode: paystack.paystackMode(), transferReference: referenceOf(waiting),
                transferStatus: 'sending', transferCode: null, failure: null, sentAt: new Date(), decidedBy: actorId,
            },
        },
        { returnDocument: 'after' }
    );
    if (!payout) return { code: 409, error: 'This payout is no longer pending' };

    // Nothing has been sent yet: any failure here just puts it back.
    let recipient;
    try {
        recipient = await paystack.createRecipient({ name: accountName, accountNumber, bankCode });
    } catch (error) {
        await backToPending(payout, ['PROCESSING'], error.message, { newAttempt: false });
        return { code: 502, error: `Paystack did not accept the bank account: ${error.message}` };
    }

    try {
        const t = await paystack.initiateTransfer({ amount: payout.amount, recipient: recipient.recipient_code, reference: payout.transferReference, reason: 'Media Masters payout' });
        return { payout: await applyTransfer(payout, t) };
    } catch (error) {
        // Unknown: it stays PROCESSING under the same reference and the checks decide.
        if (!error.answered) return { payout: await PayoutRequest.findById(payout._id), unknown: true };
        // A refusal, or "this reference already exists" from an earlier try: ask which.
        try {
            const t = await paystack.verifyTransfer(payout.transferReference);
            if (t) return { payout: await applyTransfer(payout, t) };
        } catch (check) {
            if (!check.answered) return { payout: await PayoutRequest.findById(payout._id), unknown: true };
        }
        await backToPending(payout, ['PROCESSING'], error.message, { newAttempt: false });
        return { code: 502, error: `Paystack did not send it: ${error.message}` };
    }
};

// Paystack asked for the one-time approval code it sent the business owner.
const approvePayout = async (id, otp) => {
    const payout = await PayoutRequest.findOne({ _id: id, status: 'PROCESSING' });
    if (!payout || payout.transferStatus !== 'otp' || !payout.transferCode) return { code: 409, error: 'This payout is not waiting for a code' };
    if (payout.mode !== paystack.paystackMode()) return { code: 409, error: 'This payout was sent with a different Paystack key' };
    try {
        return { payout: await applyTransfer(payout, await paystack.finalizeTransfer({ transferCode: payout.transferCode, otp })) };
    } catch (error) {
        return error.answered ? { code: 400, error: error.message } : { payout, unknown: true };
    }
};

const sweepPayouts = async (now = new Date()) => {
    if (!paystack.paystackEnabled()) return { checked: 0 };
    const open = (await PayoutRequest.find({ status: 'PROCESSING', provider: 'PAYSTACK', mode: paystack.paystackMode() })).slice(0, SWEEP_LIMIT);
    for (const payout of open) {
        try {
            await refreshPayout(payout, now);
        } catch (error) {
            console.error('⚠️ Payout check failed:', error.name);
            break;
        }
    }
    return { checked: open.length };
};

module.exports = { sendPayout, approvePayout, refreshPayout, sweepPayouts, referenceOf };
