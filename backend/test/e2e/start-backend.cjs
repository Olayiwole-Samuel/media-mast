'use strict';
// Local end-to-end run of the real backend against the throwaway MongoDB replica set at 127.0.0.1:27018.
// Every setting is forced here (env vars win over .env), so nothing reaches Atlas, Resend or a real payment.
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27018/mm_e2e?replicaSet=rs0';
process.env.JWT_SECRET = 'e2e-local-only-jwt-secret-not-used-anywhere-else';
process.env.JWT_EXPIRE = '2h';
process.env.PORT = '5055';
process.env.PAYMENT_PROVIDER = 'stub';
process.env.PLATFORM_FEE_PERCENT = '0';
process.env.RESEND_API_KEY = ''; // email off
process.env.MAIL_FROM = '';
process.env.ALLOW_DIRECT_BOOKING = '';
process.env.APP_URL = 'http://localhost:3000';
delete process.env.VERCEL;

// Loopback only: server.js calls app.listen(PORT) with no host.
const net = require('net');
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function patched(...args) {
    if (typeof args[0] === 'number' || (typeof args[0] === 'string' && /^\d+$/.test(args[0]))) {
        const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : undefined;
        return listen.call(this, Number(args[0]), '127.0.0.1', cb);
    }
    return listen.apply(this, args);
};

require('../../server.js');
