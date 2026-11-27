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
const pushInApp = async (users, { type, title, body = '', link = null, ref = null }) => {
    const ids = [...new Set((users || []).map((u) => String(idOf(u))).filter((x) => x && x !== 'undefined' && x !== 'null'))];
    if (!ids.length) return 0;
    try {
        await Notification.create(ids.map((userId) => ({ userId, type, title: title.slice(0, 160), body: String(body).slice(0, 600), link, ref })));
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
    CHANGES_REQUESTED: { subject: 'needs rescheduling', line: 'The station cannot take your spot as booked (for example, that date is already taken). Pick a new date and resubmit it from your bookings.' },
    SCHEDULED: { subject: 'scheduled', line: 'Your spot is scheduled to air.' },
    COMPLETED: { subject: 'aired', line: 'The station has confirmed your spot has aired.' },
    NOT_AIRED: { subject: 'not aired', line: 'The station could not air your spot. Its full cost is back in your wallet; you can book again.' },
    CANCELLED: { subject: 'cancelled', line: 'The station has cancelled your booking.' },
};

const refundLine = (booking) =>
    booking.paymentStatus === 'REFUNDED' && Number(booking.refundAmount) > 0
        ? `${money(booking.refundAmount, booking.currency)} has been refunded to you.`
        : null;

// The money for an aired spot is paid to the station at releaseAt unless disputed.
const airedWindowLine = (booking) => {
    const at = booking.escrow?.releaseAt ? new Date(booking.escrow.releaseAt) : null;
    const when = at ? at.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'soon';
    return `Check the TX log and clip on your bookings page. If something is wrong, raise a dispute before ${when}; otherwise the payment is released to the station automatically.`;
};

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
            ...(booking.proposedDate ? [`The station suggests: ${new Date(booking.proposedDate).toDateString()}`] : []),
            ...(booking.proofUrl && toStatus === 'COMPLETED' ? [`Broadcast proof: ${booking.proofUrl}`] : []),
            ...(toStatus === 'COMPLETED' && booking.escrow?.status === 'AIRED' ? [airedWindowLine(booking)] : []),
            ...[refundLine(booking)].filter(Boolean),
        ],
        action: { label: 'View booking', url: appUrl(bookingsPath(user)) },
    });
    await sendEmail({ to: user.email, subject: `Your booking ${booking.bookingReference} was ${copy.subject}`, text, html });
    await pushInApp([user], {
        type: 'BOOKING_STATUS',
        title: `${station ? station.name : 'Station'}: booking ${copy.subject}`,
        body: [spotWhen(booking), toStatus === 'COMPLETED' && booking.escrow?.status === 'AIRED' ? airedWindowLine(booking) : null, booking.stationNote ? `Note: ${booking.stationNote}` : null, booking.proposedDate ? `Suggested date: ${new Date(booking.proposedDate).toDateString()}` : null, refundLine(booking)].filter(Boolean).join(' · '),
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
        paragraphs: [`${company.name} can now use Media Masters: create campaigns, upload adverts with their ARCON certificates and book airtime across stations.`],
        action: { label: 'Sign in', url: appUrl('/login') },
    });
    await sendEmail({ to, subject: 'Your Media Masters account is approved', text, html });
    if (user) await pushInApp([user], { type: 'ACCOUNT', title: 'Your company account is approved', body: 'You can now create campaigns and book airtime.', link: '/company/dashboard' });
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

// ── Account verification (CAC / TIN / rate card) ──
const KIND_LABEL = { CLIENT: 'media client', AGENCY: 'media agency', MEDIA_HOUSE: 'media house' };

const notifyVerificationSubmitted = safely('verification submitted', async (verification) => {
    const admins = await User.find({ accountType: 'ADMIN', status: 'ACTIVE' }).select('_id email');
    const kind = KIND_LABEL[verification.accountKind] || 'business';
    await pushInApp(admins, {
        type: 'ACCOUNT',
        title: `New ${kind} to verify: ${verification.businessName || 'business'}`,
        body: 'Check their CAC number, TIN and documents, then approve or reject.',
        link: `/admin/verifications?id=${verification._id}`,
        ref: `verification:${verification._id}`,
    });
    const emails = admins.map((a) => a.email).filter(Boolean);
    if (emails.length) {
        const { text, html } = renderEmail({
            heading: `${verification.businessName || 'A business'} is waiting for verification`,
            paragraphs: [`A new ${kind} has submitted its CAC registration, TIN and documents for review.`],
            action: { label: 'Review', url: appUrl('/admin/verifications') },
        });
        await sendEmail({ to: emails, subject: `Verify ${verification.businessName || 'a new business'}`, text, html });
    }
    return true;
});

const notifyVerificationDecision = safely('verification decision', async (verification, user, approved) => {
    const kind = KIND_LABEL[verification.accountKind] || 'business';
    const home = verification.accountKind === 'MEDIA_HOUSE' ? '/station' : '/company/dashboard';
    const heading = approved
        ? `${verification.businessName || 'Your account'} is verified`
        : `We could not verify ${verification.businessName || 'your account'} yet`;
    const paragraphs = approved
        ? [verification.accountKind === 'MEDIA_HOUSE'
            ? 'Your media house is live on Media Masters. Advertisers can now see your rates and send you bookings.'
            : `Your ${kind} account is approved. You can now create campaigns, upload adverts and book airtime.`]
        : [`Reason: ${verification.reviewNote || 'see your verification page'}`, 'Update your details or documents and submit again.'];
    const { text, html } = renderEmail({
        heading,
        paragraphs,
        action: { label: approved ? 'Open Media Masters' : 'Update verification', url: appUrl(approved ? home : '/verify') },
    });
    if (user?.email) await sendEmail({ to: user.email, subject: heading, text, html });
    if (user) {
        await pushInApp([user], {
            type: 'ACCOUNT',
            title: heading,
            body: approved ? paragraphs[0] : paragraphs.join(' '),
            link: approved ? home : '/verify',
        });
    }
    return true;
});

// Once something has been dealt with (an approval decided, a request handled),
// its notifications are marked read for everyone who got them.
const resolveNotifications = async (ref) => {
    try {
        await Notification.updateMany({ ref, readAt: null }, { $set: { readAt: new Date() } });
    } catch (error) {
        console.error('⚠️ Resolve notifications failed:', error.name);
    }
};

// ── Money held until airing: disputes, earnings, overdue confirmations, payouts ──
const adminUsers = () => User.find({ accountType: 'ADMIN', status: 'ACTIVE' }).select('_id email');
const REASON_TEXT = {
    NOT_AIRED: 'it did not air', WRONG_ADVERT: 'the wrong advert aired', WRONG_TIME: 'it aired at the wrong time or programme',
    CUT_SHORT: 'it was cut short', OTHER: 'something else went wrong',
};

const notifyDisputeOpened = safely('dispute opened', async (booking, { reason, details }) => {
    const [admins, { station, users, emails }] = await Promise.all([adminUsers(), stationContacts(booking.stationId)]);
    const name = station ? station.name : 'the station';
    const line = `The advertiser says ${REASON_TEXT[reason] || 'something went wrong'}: "${String(details).slice(0, 300)}"`;
    await pushInApp(admins, { type: 'BOOKING_STATUS', title: `Dispute: ${booking.bookingReference} (${name})`, body: line, link: '/admin/settlement', ref: `dispute:${booking._id}` });
    await pushInApp(users, { type: 'BOOKING_STATUS', title: `Spot ${booking.bookingReference} disputed`, body: `${line} Payment is on hold while Media Masters reviews it.`, link: '/station/requests' });
    const all = [...admins.map((a) => a.email), ...emails].filter(Boolean);
    if (all.length) {
        const { text, html } = renderEmail({
            heading: `Spot ${booking.bookingReference} has been disputed`,
            paragraphs: [`${name} · ${spotWhen(booking)}.`, line, 'The payment for this spot stays on hold until Media Masters decides.'],
            action: { label: 'Review', url: appUrl('/admin/settlement') },
        });
        await sendEmail({ to: all, subject: `Dispute on spot ${booking.bookingReference}`, text, html });
    }
    return true;
});

const notifyDisputeResolved = safely('dispute resolved', async (booking, { outcome, refunded, resolution }) => {
    const [user, { station, users }] = await Promise.all([advertiserOf(booking), stationContacts(booking.stationId)]);
    const result = outcome === 'RELEASE' ? 'The spot was found to have aired correctly; the payment went to the station.'
        : outcome === 'REFUND' ? `The dispute was upheld: ${money(refunded, booking.currency)} is back in the advertiser's wallet.`
            : `Settled in part: ${money(refunded, booking.currency)} back to the advertiser, the rest to the station.`;
    const body = [result, resolution ? `Note: ${resolution}` : null].filter(Boolean).join(' ');
    if (user) {
        await pushInApp([user], { type: 'BOOKING_STATUS', title: `Dispute on ${booking.bookingReference} decided`, body, link: bookingsPath(user) });
        const { text, html } = renderEmail({ heading: `Your dispute on ${booking.bookingReference} has been decided`, paragraphs: [`${station ? station.name : 'Station'} · ${spotWhen(booking)}.`, body], action: { label: 'View booking', url: appUrl(bookingsPath(user)) } });
        await sendEmail({ to: user.email, subject: `Dispute decided: ${booking.bookingReference}`, text, html });
    }
    await pushInApp(users, { type: 'BOOKING_STATUS', title: `Dispute on ${booking.bookingReference} decided`, body, link: '/station/earnings' });
    await resolveNotifications(`dispute:${booking._id}`);
    return true;
});

// The station's earnings wallet was credited for an aired spot.
const notifyStationEarning = safely('station earning', async (booking, amount) => {
    if (!(amount > 0)) return false;
    const { users } = await stationContacts(booking.stationId);
    await pushInApp(users, { type: 'PAYMENT_RECEIVED', title: `Earned ${money(amount, booking.currency)}`, body: `${booking.bookingReference} · ${spotWhen(booking)}`, link: '/station/earnings' });
    return true;
});

// A spot's slot ended long ago and the station hasn't said whether it aired.
const notifyAirOverdue = safely('air overdue', async (booking, hours) => {
    const [admins, { station, users, emails }] = await Promise.all([adminUsers(), stationContacts(booking.stationId)]);
    const name = station ? station.name : 'A station';
    await pushInApp(users, { type: 'BOOKING_STATUS', title: `Confirm spot ${booking.bookingReference}`, body: `It was due ${spotWhen(booking)}. Mark it aired (with the TX log and clip) or not aired. You're paid only once it's confirmed.`, link: '/station/requests' });
    await pushInApp(admins, { type: 'BOOKING_STATUS', title: `${name} hasn't confirmed ${booking.bookingReference}`, body: `No answer ${hours}h after the slot (${spotWhen(booking)}). The advertiser's money is still on hold.`, link: '/admin/bookings' });
    if (emails.length) {
        const { text, html } = renderEmail({
            heading: `Please confirm spot ${booking.bookingReference}`,
            paragraphs: [`${name} · ${spotWhen(booking)}.`, `It is ${hours} hours past the slot and the spot hasn't been marked aired or not aired. Upload the TX log and a clip to be paid.`],
            action: { label: 'Open your desk', url: appUrl('/station/requests') },
        });
        await sendEmail({ to: emails, subject: `Confirm whether spot ${booking.bookingReference} aired`, text, html });
    }
    return true;
});

const notifyPayoutRequested = safely('payout requested', async (request, station) => {
    const admins = await adminUsers();
    await pushInApp(admins, { type: 'PAYMENT_RECEIVED', title: `Payout request: ${station.name}`, body: `${money(request.amount, request.currency)} to ${request.account?.bankName || 'their bank'}`, link: '/admin/settlement?tab=payouts', ref: `payout:${request._id}` });
    return true;
});

const notifyPayoutDecided = safely('payout decided', async (request, station) => {
    const { users } = await stationContacts(station._id);
    const paid = request.status === 'PAID';
    await pushInApp(users, {
        type: 'PAYMENT_RECEIVED',
        title: paid ? `Payout sent: ${money(request.amount, request.currency)}` : 'Payout request declined',
        body: paid ? `Reference ${request.reference || '—'}` : `${money(request.amount, request.currency)} is back in your earnings.${request.note ? ` ${request.note}` : ''}`,
        link: '/station/earnings',
    });
    await resolveNotifications(`payout:${request._id}`);
    return true;
});

// Admins: a Paystack transfer failed, came back, or looks wrong.
const notifyPayoutProblem = safely('payout problem', async (request, reason) => {
    const admins = await adminUsers();
    await pushInApp(admins, { type: 'PAYMENT_RECEIVED', title: `Payout not sent: ${money(request.amount, request.currency)}`, body: reason, link: '/admin/settlement?tab=payouts', ref: `payout:${request._id}` });
    return true;
});

// Admins: a Paystack top-up that needs a person to look at it.
const notifyFundingProblem = safely('funding problem', async (intent, reason) => {
    const admins = await adminUsers();
    await pushInApp(admins, { type: 'PAYMENT_RECEIVED', title: `Check a Paystack top-up: ${money(intent.amount, intent.currency)}`, body: `${intent.reference}: ${reason}`, link: '/admin/wallets' });
    return true;
});

// ── Media plans ──
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// "Mon 2, Tue 1, Thu 3" (Monday first).
const perDay = (spotsByDay) => [1, 2, 3, 4, 5, 6, 0].filter((d) => (spotsByDay || [])[d] > 0).map((d) => `${DAY_SHORT[d]} ${spotsByDay[d]}`).join(', ');

// One message per media house (its order) and one to the advertiser.
const notifyPlanBooked = safely('plan booked', async ({ payment, campaign, lines, totals }) => {
    const user = await User.findById(payment.userId).select('email name status accountType');
    if (user) {
        const { text, html } = renderEmail({
            heading: 'Media plan booked',
            paragraphs: [
                `"${campaign.name}": ${totals.spots} spots on ${totals.stations} media house${totals.stations === 1 ? '' : 's'}, ${fmtDay(totals.firstDate)} to ${fmtDay(totals.lastDate)}.`,
                `${money(totals.total, payment.currency)} (net ${money(totals.net, payment.currency)} + VAT ${money(totals.vat, payment.currency)}) is on hold in your wallet. Each media house is paid only as its spots air.`,
                ...lines.slice(0, 40).map((l) => `${l.station.name} · ${l.rate.name}${l.rate.spotSeconds ? ` ${l.rate.spotSeconds}s` : ''} · ${perDay(l.spotsByDay)} · ${l.spots} spots · ${money(l.totals.total, payment.currency)}`),
            ],
            action: { label: 'Track the campaign', url: appUrl(bookingsPath(user)) },
        });
        await sendEmail({ to: user.email, subject: `Media plan booked: ${totals.spots} spots`, text, html });
        await pushInApp([user], { type: 'PAYMENT_RECEIVED', title: `Plan booked: ${totals.spots} spots`, body: `"${campaign.name}" · ${money(totals.total, payment.currency)} on hold, paid as spots air.`, link: bookingsPath(user) });
    }
    const byStation = new Map();
    for (const l of lines) {
        const k = String(l.station._id);
        if (!byStation.has(k)) byStation.set(k, []);
        byStation.get(k).push(l);
    }
    for (const [stationId, ls] of byStation) {
        const { station, users, emails } = await stationContacts(stationId);
        if (!station) continue;
        const spots = ls.reduce((t, l) => t + l.spots, 0);
        const net = ls.reduce((t, l) => t + l.totals.net, 0);
        const first = ls.map((l) => l.dates[0]).sort()[0];
        const last = ls.map((l) => l.dates[l.dates.length - 1]).sort().slice(-1)[0];
        const body = `${spots} spots for "${campaign.name}", ${fmtDay(first)} to ${fmtDay(last)} · ${money(net, payment.currency)} (net), paid as they air`;
        await pushInApp(users, { type: 'BOOKING_REQUEST', title: `New order: ${spots} spots`, body, link: '/station/requests' });
        if (emails.length) {
            const { text, html } = renderEmail({
                heading: `New order for ${station.name}`,
                paragraphs: [body, ...ls.map((l) => `${l.rate.name}${l.rate.spotSeconds ? ` ${l.rate.spotSeconds}s` : ''} · ${perDay(l.spotsByDay)} · ${l.spots} spots`), 'Accept the whole order on your desk, or decline any dates you cannot take.'],
                action: { label: 'Review the order', url: appUrl('/station/requests') },
            });
            await sendEmail({ to: emails, subject: `New order: ${spots} spots for "${campaign.name}"`, text, html });
        }
    }
    return true;
});

// Many spots changed at once (a whole order accepted, a day marked aired):
// one message per advertiser and media house, not one per spot.
const notifyPlanStatus = safely('plan status', async (bookings, { kind, note, date }) => {
    if (!bookings.length) return false;
    const byAdvertiser = new Map();
    for (const b of bookings) {
        const k = `${b.userId}|${b.stationId}`;
        if (!byAdvertiser.has(k)) byAdvertiser.set(k, []);
        byAdvertiser.get(k).push(b);
    }
    for (const list of byAdvertiser.values()) {
        const [user, { station }] = await Promise.all([advertiserOf(list[0]), stationContacts(list[0].stationId)]);
        if (!user) continue;
        const name = station ? station.name : 'The media house';
        const n = `${list.length} spot${list.length === 1 ? '' : 's'}`;
        const title = kind === 'ACCEPTED' ? `${name} accepted ${n}`
            : kind === 'SCHEDULED' ? `${name} scheduled ${n}`
                : kind === 'DECLINED' ? `${name} declined ${n}`
                    : kind === 'RESCHEDULE' ? `${name} asks to reschedule ${n}`
                        : `${name}: ${n} aired${date ? ` on ${fmtDay(date)}` : ''}`;
        const body = kind === 'AIRED' ? airedWindowLine(list[0])
            : kind === 'DECLINED' ? [note ? `Reason: ${note}` : null, 'Their cost is back in your wallet.'].filter(Boolean).join(' ')
                : kind === 'RESCHEDULE' ? [note ? `Reason: ${note}` : null, date ? `They suggest ${fmtDay(date)}.` : null, 'Pick new dates on your bookings page, or cancel them for a refund.'].filter(Boolean).join(' ')
                    : [note ? `Note: ${note}` : null, 'Your money stays on hold and is paid as each spot airs.'].filter(Boolean).join(' ');
        await pushInApp([user], { type: 'BOOKING_STATUS', title, body, link: bookingsPath(user) });
        if (['AIRED', 'DECLINED', 'RESCHEDULE'].includes(kind)) {
            const { text, html } = renderEmail({ heading: title, paragraphs: [body], action: { label: 'Check the proof', url: appUrl(bookingsPath(user)) } });
            await sendEmail({ to: user.email, subject: title, text, html });
        }
    }
    return true;
});

// An agency cancelled or moved many spots at once: one message per media house.
const notifyBulkToStations = safely('bulk to stations', async (bookings, { kind, date }) => {
    const byStation = new Map();
    for (const b of bookings || []) {
        const k = String(idOf(b.stationId));
        if (!byStation.has(k)) byStation.set(k, []);
        byStation.get(k).push(b);
    }
    for (const [stationId, list] of byStation) {
        const { users, emails } = await stationContacts(stationId);
        const name = await campaignName(list[0]);
        const n = `${list.length} spot${list.length === 1 ? '' : 's'}`;
        const title = kind === 'MOVED' ? `${n} moved to ${fmtDay(date)}` : `${n} cancelled`;
        const body = kind === 'MOVED' ? `"${name}": the advertiser moved them. Please confirm the new date on your desk.` : `"${name}": the advertiser cancelled them; they are no longer on your schedule.`;
        await pushInApp(users, { type: 'BOOKING_STATUS', title, body, link: '/station/requests' });
        if (emails.length) {
            const { text, html } = renderEmail({ heading: title, paragraphs: [body, ...list.slice(0, 30).map((b) => `${b.bookingReference} · ${spotWhen(b)}`)], action: { label: 'Open your desk', url: appUrl('/station/requests') } });
            await sendEmail({ to: emails, subject: title, text, html });
        }
    }
    return true;
});

// The client answered the plan review link.
const notifyPlanShareResponse = safely('plan share response', async (share, draft) => {
    const owners = share.companyId
        ? await User.find({ companyId: share.companyId, accountType: 'COMPANY', status: 'ACTIVE' }).select('_id email accountType')
        : await User.find({ _id: share.userId }).select('_id email accountType');
    const name = await campaignName({ campaignId: draft.campaignId });
    const ok = share.decision === 'APPROVED';
    const title = ok ? `${share.responderName} approved the plan for "${name}"` : `${share.responderName} asked for changes to "${name}"`;
    const body = ok ? 'You can book it from your cart.' : `"${share.comment}"`;
    const link = owners[0]?.accountType === 'INDIVIDUAL' ? '/cart' : '/company/cart';
    await pushInApp(owners, { type: 'BOOKING_STATUS', title, body, link });
    const emails = owners.map((o) => o.email).filter(Boolean);
    if (emails.length) {
        const { text, html } = renderEmail({ heading: title, paragraphs: [body], action: { label: 'Open your cart', url: appUrl(link) } });
        await sendEmail({ to: emails, subject: title, text, html });
    }
    return true;
});

// Morning briefing for one media house.
const notifyMorningBriefing = safely('morning briefing', async (stationId, bookings, day) => {
    const { station, users, emails } = await stationContacts(stationId);
    if (!station) return false;
    const campaigns = new Set(bookings.map((b) => String(b.campaignId))).size;
    const pending = bookings.filter((b) => b.status === 'PENDING').length;
    const title = `Today at ${station.name}: ${bookings.length} spot${bookings.length === 1 ? '' : 's'} across ${campaigns} campaign${campaigns === 1 ? '' : 's'}`;
    const body = [pending ? `${pending} still waiting for you to accept.` : null, 'Open the run sheet for times, programmes and adverts. Confirm them aired with the TX log and clip.'].filter(Boolean).join(' ');
    const link = `/print/run-sheet?date=${day}`;
    await pushInApp(users, { type: 'SLOT_REMINDER', title, body, link });
    if (emails.length) {
        const sorted = [...bookings].sort((a, b) => String(a.time).localeCompare(String(b.time)));
        const { text, html } = renderEmail({ heading: title, paragraphs: [body, ...sorted.slice(0, 40).map((b) => `${b.time} · ${b.rateName || b.slot}${b.spotSeconds ? ` · ${b.spotSeconds}s` : ''} · ${b.bookingReference}`)], action: { label: 'Open the run sheet', url: appUrl(link) } });
        await sendEmail({ to: emails, subject: title, text, html });
    }
    return true;
});

// A media house changed its rate card: tell agencies with plans on it.
const notifyRateCardChanged = safely('rate card changed', async (station) => {
    const Booking = require('../models/Booking');
    const PlanDraft = require('../models/PlanDraft');
    const today = new Date(new Date().toISOString().slice(0, 10));
    const [booked, drafts] = await Promise.all([
        Booking.find({ stationId: station._id, date: { $gte: today }, status: { $in: ['PENDING', 'ACCEPTED', 'SCHEDULED'] } }).select('userId companyId'),
        PlanDraft.find({ 'lines.stationId': station._id }).select('userId companyId'),
    ]);
    const owners = new Map();
    for (const r of [...booked, ...drafts]) owners.set(String(r.companyId || r.userId), r);
    for (const r of owners.values()) {
        const users = r.companyId ? await User.find({ companyId: r.companyId, accountType: 'COMPANY', status: 'ACTIVE' }).select('_id accountType') : await User.find({ _id: r.userId }).select('_id accountType');
        await pushInApp(users, { type: 'NEW_STATION', title: `${station.name} updated its rate card`, body: 'Spots you have already booked keep their price. Plans in your cart now use the new rates.', link: users[0]?.accountType === 'INDIVIDUAL' ? '/cart' : '/company/cart' });
    }
    return true;
});

// ── Volume discount agreements (agency ↔ media house) ──
const notifyAgreementRequested = safely('agreement requested', async (agreement, { agencyName, station }) => {
    const { users, emails } = await stationContacts(station._id);
    const what = `${agencyName} says it has a ${agreement.percent}% volume discount with ${station.name}${agreement.programmes?.length ? ` (and ${agreement.programmes.length} programme rate${agreement.programmes.length === 1 ? '' : 's'})` : ''}.`;
    await pushInApp(users, { type: 'ACCOUNT', title: `Confirm ${agencyName}'s volume discount`, body: `${what} Confirm it so it applies to their bookings.`, link: '/station/discounts', ref: `agreement:${agreement._id}` });
    if (emails.length) {
        const { text, html } = renderEmail({
            heading: `Please confirm ${agencyName}'s volume discount`,
            paragraphs: [what, ...(agreement.agencyNote ? [`Their note: "${agreement.agencyNote}"`] : []), 'It only applies to their plans once you confirm it.'],
            action: { label: 'Review', url: appUrl('/station/discounts') },
        });
        await sendEmail({ to: emails, subject: `Confirm ${agencyName}'s volume discount`, text, html });
    }
    return true;
});

const notifyAgreementDecided = safely('agreement decided', async (agreement, { station }) => {
    const owners = await User.find({ companyId: agreement.companyId, accountType: 'COMPANY', status: 'ACTIVE' }).select('_id email');
    const ok = agreement.status === 'APPROVED';
    const title = ok ? `${station.name} confirmed your ${agreement.percent}% volume discount` : `${station.name} did not confirm your volume discount`;
    const body = ok ? 'It now applies to your plans with them.' : (agreement.stationNote ? `Reason: ${agreement.stationNote}` : 'Check the figures and send it again.');
    await pushInApp(owners, { type: 'ACCOUNT', title, body, link: '/company/discounts' });
    const emails = owners.map((o) => o.email).filter(Boolean);
    if (emails.length) {
        const { text, html } = renderEmail({ heading: title, paragraphs: [body], action: { label: 'Volume discounts', url: appUrl('/company/discounts') } });
        await sendEmail({ to: emails, subject: title, text, html });
    }
    await resolveNotifications(`agreement:${agreement._id}`);
    return true;
});

// ── Wallet ──
const walletPath = (user) => (user && user.accountType === 'INDIVIDUAL' ? '/wallet' : '/company/wallet');

// The balance fell below the owner's alert line after a booking.
const notifyWalletLow = safely('wallet low', async (wallet, payer) => {
    const user = await User.findById(idOf(payer && payer.userId)).select('email name status accountType');
    if (!user) return false;
    const { text, html } = renderEmail({
        heading: 'Your wallet is running low',
        paragraphs: [
            `Your wallet balance is now ${money(wallet.balance, wallet.currency)}, below the ${money(wallet.lowBalanceThreshold, wallet.currency)} alert you set.`,
            'Fund your wallet so your next bookings go through.',
        ],
        action: { label: 'Fund wallet', url: appUrl(walletPath(user)) },
    });
    await sendEmail({ to: user.email, subject: 'Your Media Masters wallet is running low', text, html });
    await pushInApp([user], { type: 'WALLET', title: 'Wallet running low', body: `Balance ${money(wallet.balance, wallet.currency)}`, link: walletPath(user) });
    return true;
});

// Money added to the wallet (top-up, refund or admin adjustment).
const notifyWalletCredited = safely('wallet credited', async (wallet, { userId, amount, type, note }) => {
    const user = await User.findById(idOf(userId)).select('email name status accountType');
    if (!user) return false;
    const what = type === 'FUND' ? 'Wallet funded' : type === 'REFUND' ? 'Refund added to your wallet' : 'Wallet adjusted';
    const body = `${amount >= 0 ? '+' : '−'}${money(Math.abs(amount), wallet.currency)} · balance ${money(wallet.balance, wallet.currency)}${note ? ` · ${note}` : ''}`;
    await pushInApp([user], { type: 'WALLET', title: what, body, link: walletPath(user) });
    return true;
});

module.exports = {
    resolveNotifications,
    notifyWalletLow,
    notifyWalletCredited,
    notifyDisputeOpened,
    notifyDisputeResolved,
    notifyStationEarning,
    notifyAirOverdue,
    notifyPayoutRequested,
    notifyPayoutDecided,
    notifyPayoutProblem,
    notifyFundingProblem,
    notifyPlanBooked,
    notifyPlanStatus,
    notifyAgreementRequested,
    notifyAgreementDecided,
    notifyBulkToStations,
    notifyPlanShareResponse,
    notifyMorningBriefing,
    notifyRateCardChanged,
    notifyVerificationSubmitted,
    notifyVerificationDecision,
    notifyCheckout,
    notifyBookingStatus,
    notifyCustomerCancellation,
    notifySlotReminder,
    notifyNewStation,
    notifyCompanyApproved,
    notifyStationManagerCreated,
    pushInApp,
};
