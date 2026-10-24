// ── Booking and account notifications (in-app + email, SMS for reminders) ──
// Called after a change has been saved. Every function here is best-effort
// and never throws, so a notification problem can't turn a successful
// request into an error. In-app notifications are always created; emails
// go out when the email provider is configured (utils/mailer.js).
//
// Recipients:
//   advertiser → the user who made the booking (booking.userId)
//   station    → its active station managers; for a station still run by a
//                media company (transition) and with no managers, that
//                company's owner account and email.

const User = require('../models/User');
const Station = require('../models/Station');
const Company = require('../models/Company');
const Campaign = require('../models/Campaign');
const Notification = require('../models/Notification');
const { appUrl, renderEmail, sendEmail } = require('./mailer');
const { sendSms } = require('./sms');

const money = (amount, currency = 'NGN') => {
    const n = Number(amount) || 0;
    try {
        return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(n);
    } catch {
        return `${currency} ${n.toFixed(2)}`;
    }
};

const spotWhen = (booking) => {
    const day = booking.date
        ? new Date(booking.date).toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' })
        : 'date to be confirmed';
    return `${day}${booking.time ? ` at ${booking.time}` : ''}${booking.duration ? ` (${booking.duration} min)` : ''}`;
};

const idOf = (value) => (value && value._id ? value._id : value);

// Individuals use /bookings; company owners and team members /company/bookings.
const bookingsPath = (user) => (user && user.accountType === 'INDIVIDUAL' ? '/bookings' : '/company/bookings');

const advertiserOf = async (booking) => {
    const user = await User.findById(idOf(booking.userId)).select('email name status accountType phone');
    return user && user.status !== 'SUSPENDED' && user.status !== 'DEACTIVATED' ? user : null;
};

// { station, users: [{_id, email}], emails: [] }
const stationContacts = async (stationId) => {
    const station = await Station.findById(idOf(stationId)).select('name managerIds companyId');
    if (!station) return { station: null, users: [], emails: [] };

    let users = station.managerIds && station.managerIds.length
        ? await User.find({ _id: { $in: station.managerIds }, status: 'ACTIVE' }).select('email')
        : [];
    let emails = users.map((m) => m.email).filter(Boolean);

    if (users.length === 0 && station.companyId) {
        const [company, owners] = await Promise.all([
            Company.findById(station.companyId).select('email'),
            User.find({ companyId: station.companyId, accountType: 'COMPANY', status: 'ACTIVE' }).select('email'),
        ]);
        users = owners;
        emails = company && company.email ? [company.email] : owners.map((o) => o.email).filter(Boolean);
    }

    return { station, users, emails };
};

const campaignName = async (booking) => {
    const campaign = await Campaign.findById(idOf(booking.campaignId)).select('name');
    return campaign ? campaign.name : 'your campaign';
};

// In-app notifications for several users (never throws).
const pushInApp = async (users, { type, title, body = '', link = null }) => {
    const ids = [...new Set((users || []).map((u) => String(idOf(u))).filter((x) => x && x !== 'undefined' && x !== 'null'))];
    if (!ids.length) return 0;
    try {
        await Notification.create(ids.map((userId) => ({ userId, type, title: title.slice(0, 160), body: String(body).slice(0, 600), link })));
        return ids.length;
    } catch (error) {
        console.error('⚠️ In-app notification failed:', error.name);
        return 0;
    }
};

const safely = (label, fn) => async (...args) => {
    try {
        return await fn(...args);
    } catch (error) {
        console.error(`⚠️ Notification (${label}) failed:`, error.name);
        return false;
    }
};

// ── Checkout: receipt to the advertiser; each station gets its new requests ──
const notifyCheckout = safely('checkout', async ({ payment, bookings }) => {
    if (!bookings || bookings.length === 0) return false;
    const first = bookings[0];
    const [user, name] = await Promise.all([advertiserOf(first), campaignName(first)]);

    const byStation = new Map();
    for (const b of bookings) {
        const key = String(idOf(b.stationId));
        if (!byStation.has(key)) byStation.set(key, []);
        byStation.get(key).push(b);
    }
    const contacts = new Map();
    for (const stationId of byStation.keys()) contacts.set(stationId, await stationContacts(stationId));

    if (user) {
        const lines = bookings.map((b) =>
            `${b.bookingReference}: ${contacts.get(String(idOf(b.stationId)))?.station?.name || 'Station'}, ${spotWhen(b)}, ${money(b.price, b.currency)}`);
        const discountLine = Number(payment.discount) > 0
            ? [`Multi-station discount: ${payment.discountPercent}% (${money(payment.discount, payment.currency)} off).`]
            : [];
        const { text, html } = renderEmail({
            heading: 'Payment received: booking requests sent',
            paragraphs: [
                `Thanks${user.name ? `, ${user.name}` : ''}. We've received ${money(payment.amount, payment.currency)} (reference ${payment.reference}) for "${name}".`,
                ...discountLine,
                `${bookings.length} booking request${bookings.length === 1 ? ' has' : 's have'} been sent to the stations:`,
                ...lines,
                'Each station will accept or decline. If a station declines, that spot is refunded in full.',
            ],
            action: { label: 'View your bookings', url: appUrl(bookingsPath(user)) },
        });
        await sendEmail({ to: user.email, subject: `Payment received — ${bookings.length} booking request${bookings.length === 1 ? '' : 's'} sent`, text, html });
        await pushInApp([user], {
            type: 'PAYMENT_RECEIVED',
            title: `Payment received: ${money(payment.amount, payment.currency)}`,
            body: `${bookings.length} booking request${bookings.length === 1 ? '' : 's'} for "${name}" sent to the stations.`,
            link: bookingsPath(user),
        });
    }

    for (const [stationId, list] of byStation) {
        const { station, users, emails } = contacts.get(stationId);
        if (!station) continue;
        const { text, html } = renderEmail({
            heading: `New paid booking request${list.length === 1 ? '' : 's'} for ${station.name}`,
            paragraphs: [
                `${list.length} new request${list.length === 1 ? '' : 's'} for the campaign "${name}" ${list.length === 1 ? 'is' : 'are'} waiting for your review:`,
                ...list.map((b) => `${b.bookingReference}: ${spotWhen(b)}, ${money(b.price, b.currency)}${b.rateName ? ` (${b.rateName})` : ''}`),
            ],
            action: { label: 'Review requests', url: appUrl('/station/requests') },
        });
        if (emails.length) await sendEmail({ to: emails, subject: `New booking request${list.length === 1 ? '' : 's'} for ${station.name}`, text, html });
        await pushInApp(users, {
            type: 'BOOKING_REQUEST',
            title: `${list.length} new booking request${list.length === 1 ? '' : 's'} for ${station.name}`,
            body: `For "${name}": ${list.map((b) => spotWhen(b)).join('; ')}`,
            link: '/station/requests',
        });
    }
    return true;
});

// ── A station acted on a booking (or the advertiser resubmitted it) ──
const STATUS_COPY = {
    ACCEPTED: { subject: 'accepted', line: 'The station has accepted your booking.' },
    REJECTED: { subject: 'declined', line: 'The station has declined your booking.' },
    CHANGES_REQUESTED: { subject: 'needs changes', line: 'The station has asked for changes before it can accept your booking. Update it and resubmit.' },
    SCHEDULED: { subject: 'scheduled', line: 'Your spot is scheduled to air.' },
    COMPLETED: { subject: 'aired', line: 'The station has confirmed your spot has aired.' },
    CANCELLED: { subject: 'cancelled', line: 'The station has cancelled your booking.' },
};

const refundLine = (booking) =>
    booking.paymentStatus === 'REFUNDED' && Number(booking.refundAmount) > 0
        ? `${money(booking.refundAmount, booking.currency)} has been refunded to you.`
        : null;

const notifyBookingStatus = safely('booking status', async (booking, { actor, toStatus }) => {
    if (actor === 'CUSTOMER') {
        // Resubmitted after requested changes → back to the station.
        const [{ station, users, emails }, name] = await Promise.all([stationContacts(booking.stationId), campaignName(booking)]);
        if (!station) return false;
        const { text, html } = renderEmail({
            heading: `Booking ${booking.bookingReference} was resubmitted`,
            paragraphs: [`The advertiser updated "${name}" and resubmitted ${booking.bookingReference} (${spotWhen(booking)}) for your review.`],
            action: { label: 'Review requests', url: appUrl('/station/requests') },
        });
        if (emails.length) await sendEmail({ to: emails, subject: `Booking ${booking.bookingReference} resubmitted`, text, html });
        await pushInApp(users, { type: 'BOOKING_REQUEST', title: `Booking ${booking.bookingReference} resubmitted`, body: `${station.name} · ${spotWhen(booking)}`, link: '/station/requests' });
        return true;
    }

    const copy = STATUS_COPY[toStatus];
    if (!copy) return false;
    const [user, { station }] = await Promise.all([advertiserOf(booking), stationContacts(booking.stationId)]);
    if (!user) return false;

    const { text, html } = renderEmail({
        heading: `Booking ${booking.bookingReference} ${copy.subject}`,
        paragraphs: [
            `${station ? station.name : 'The station'} — ${spotWhen(booking)}.`,
            copy.line,
            ...(booking.stationNote ? [`Note from the station: ${booking.stationNote}`] : []),
            ...(booking.proofUrl && toStatus === 'COMPLETED' ? [`Broadcast proof: ${booking.proofUrl}`] : []),
            ...[refundLine(booking)].filter(Boolean),
        ],
        action: { label: 'View booking', url: appUrl(bookingsPath(user)) },
    });
    await sendEmail({ to: user.email, subject: `Your booking ${booking.bookingReference} was ${copy.subject}`, text, html });
    await pushInApp([user], {
        type: 'BOOKING_STATUS',
        title: `${station ? station.name : 'Station'}: booking ${copy.subject}`,
        body: [spotWhen(booking), booking.stationNote ? `Note: ${booking.stationNote}` : null, refundLine(booking)].filter(Boolean).join(' · '),
        link: bookingsPath(user),
    });
    return true;
});

// ── The advertiser cancelled: receipt to them, heads-up to the station ──
const notifyCustomerCancellation = safely('customer cancellation', async (booking) => {
    const [user, { station, users, emails }] = await Promise.all([advertiserOf(booking), stationContacts(booking.stationId)]);
    const refund = Number(booking.refundAmount) || 0;
    const fee = Number(booking.cancellationFee) || 0;

    if (user) {
        const { text, html } = renderEmail({
            heading: `Booking ${booking.bookingReference} cancelled`,
            paragraphs: [
                `You cancelled ${booking.bookingReference} with ${station ? station.name : 'the station'} (${spotWhen(booking)}).`,
                refund > 0
                    ? `${money(refund, booking.currency)} is being refunded to you${fee > 0 ? ` (cancellation fee ${money(fee, booking.currency)})` : ''}.`
                    : (booking.paymentStatus === 'PAID' ? 'Under the cancellation policy this spot is not refunded.' : null),
                booking.cancellationReason || null,
            ].filter(Boolean),
            action: { label: 'View your bookings', url: appUrl(bookingsPath(user)) },
        });
        await sendEmail({ to: user.email, subject: `Booking ${booking.bookingReference} cancelled`, text, html });
        await pushInApp([user], {
            type: 'BOOKING_CANCELLED',
            title: `Booking ${booking.bookingReference} cancelled`,
            body: refund > 0 ? `${money(refund, booking.currency)} is being refunded to you.` : `${station ? station.name : 'Station'} · ${spotWhen(booking)}`,
            link: bookingsPath(user),
        });
    }

    if (station) {
        const { text, html } = renderEmail({
            heading: `Booking ${booking.bookingReference} was cancelled by the advertiser`,
            paragraphs: [
                `${spotWhen(booking)} on ${station.name} is free again.`,
                ...(fee > 0 ? [`A cancellation fee of ${money(fee, booking.currency)} applies.`] : []),
            ],
            action: { label: 'Open schedule', url: appUrl('/station/schedule') },
        });
        if (emails.length) await sendEmail({ to: emails, subject: `Booking ${booking.bookingReference} cancelled by the advertiser`, text, html });
        await pushInApp(users, { type: 'BOOKING_CANCELLED', title: `Booking ${booking.bookingReference} cancelled by the advertiser`, body: `${spotWhen(booking)} on ${station.name} is free again.`, link: '/station/schedule' });
    }
    return true;
});

// ── Slot reminder before a spot airs (24 hours or 1 hour) ──
const notifySlotReminder = safely('slot reminder', async (booking, { hours }) => {
    const [user, { station }] = await Promise.all([advertiserOf(booking), stationContacts(booking.stationId)]);
    if (!user) return false;
    const when = hours >= 24 ? 'tomorrow' : 'in about an hour';
    const stationName = station ? station.name : 'the station';
    const { text, html } = renderEmail({
        heading: `Your spot airs ${when}`,
        paragraphs: [
            `${booking.bookingReference} on ${stationName}: ${spotWhen(booking)}.`,
            hours >= 24
                ? 'Make sure your final creative is with the station. Cancellations close 2 hours before broadcast.'
                : 'It is now too close to broadcast to cancel.',
        ],
        action: { label: 'View booking', url: appUrl(bookingsPath(user)) },
    });
    await sendEmail({ to: user.email, subject: `Reminder: your spot on ${stationName} airs ${when}`, text, html });
    await sendSms({ to: user.phone, text: `Media Masters: your spot ${booking.bookingReference} on ${stationName} airs ${when} (${spotWhen(booking)}).` });
    await pushInApp([user], { type: 'SLOT_REMINDER', title: `Your spot on ${stationName} airs ${when}`, body: spotWhen(booking), link: bookingsPath(user) });
    return true;
});

// ── A new station opened: advertisers who opted in for its state ──
const notifyNewStation = safely('new station', async (station) => {
    const state = station.location?.state || null;
    const users = await User.find({
        notifyNewStations: true,
        status: 'ACTIVE',
        accountType: { $in: ['INDIVIDUAL', 'COMPANY', 'EMPLOYEE'] },
    }).select('email accountType notifyStates');
    const matching = users
        .filter((u) => !u.notifyStates || u.notifyStates.length === 0 || (state && u.notifyStates.map((s) => s.toLowerCase()).includes(String(state).toLowerCase())))
        .slice(0, 1000);
    if (!matching.length) return 0;

    const where = [station.location?.city, state].filter(Boolean).join(', ');
    const { text, html } = renderEmail({
        heading: `New on Media Masters: ${station.name}`,
        paragraphs: [
            `${station.name}${station.type ? ` (${String(station.type).toLowerCase()})` : ''}${where ? ` in ${where}` : ''} is now taking bookings.`,
            'You get this email because you asked to hear about new stations. Turn it off in your account settings.',
        ],
        action: { label: 'See stations', url: appUrl('/stations') },
    });
    for (const u of matching) {
        await sendEmail({ to: u.email, subject: `New station: ${station.name}`, text, html });
    }
    await pushInApp(matching, { type: 'NEW_STATION', title: `New station: ${station.name}`, body: where ? `Now taking bookings in ${where}.` : 'Now taking bookings.', link: '/stations' });
    return matching.length;
});

// ── Company account approved by an admin ──
const notifyCompanyApproved = safely('company approved', async (company, user) => {
    const to = (user && user.email) || company.email;
    const { text, html } = renderEmail({
        heading: 'Your company account is approved',
        paragraphs: [`${company.name} can now sign in to Media Masters. Choose a plan to start booking airtime across stations.`],
        action: { label: 'Sign in', url: appUrl('/login') },
    });
    await sendEmail({ to, subject: 'Your Media Masters account is approved', text, html });
    if (user) await pushInApp([user], { type: 'ACCOUNT', title: 'Your company account is approved', body: 'Choose a plan to start booking airtime.', link: '/company/subscription' });
    return true;
});

// ── Station manager account created by an admin (no password in the email) ──
const notifyStationManagerCreated = safely('station manager created', async (user, stations = []) => {
    const { text, html } = renderEmail({
        heading: 'Your station manager account is ready',
        paragraphs: [
            `Hi ${user.name || 'there'}, a Media Masters admin has created a station manager account for you${stations.length ? ` for ${stations.map((s) => s.name).join(', ')}` : ''}.`,
            'Sign in with this email address and the temporary password the admin gave you; you will be asked to choose your own password straight away. If you lose it, use "Forgot password?" on the sign-in page.',
        ],
        action: { label: 'Sign in', url: appUrl('/login') },
    });
    return sendEmail({ to: user.email, subject: 'Your Media Masters station account', text, html });
});

module.exports = {
    notifyCheckout,
    notifyBookingStatus,
    notifyCustomerCancellation,
    notifySlotReminder,
    notifyNewStation,
    notifyCompanyApproved,
    notifyStationManagerCreated,
    pushInApp,
};
