const dns = require('dns');
const mongoose = require('mongoose');

// ─────────────────────────────────────────────────
// DATABASE CONNECTION + REQUEST READINESS
//
// One shared Mongoose connection per process. On Vercel every request
// waits for it (databaseGate), so nothing is served before the database is
// ready. A failed attempt is forgotten, so the next request retries instead
// of the instance staying broken. Errors are logged by name and redacted
// message only — never the connection string.
// ─────────────────────────────────────────────────

const UNAVAILABLE_MESSAGE = 'Service temporarily unavailable. Please try again later.';

let connecting = null;

// Same rule as the app's error handler: blank out credentials in URIs.
const redact = (text) => String(text)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@');

const logConnectionError = (context, error) => {
    console.error(
        '❌ MongoDB connection error:',
        context,
        error && error.name,
        redact(error && error.message)
    );
};

// An Atlas "mongodb+srv://" address needs DNS SRV/TXT lookups. Some networks'
// DNS servers can't answer those (ESERVFAIL / ETIMEOUT) although the internet
// works; then retry once through public DNS (Google, Cloudflare).
const DNS_FAILURE = /ESERVFAIL|ETIMEOUT|ECONNREFUSED|ENOTFOUND|EREFUSED/;
const isDnsLookupFailure = (error) => /query(Srv|Txt)/.test(String(error && error.message)) && DNS_FAILURE.test(String(error && (error.code || error.message)));
let usingPublicDns = false;

const connectWithDnsFallback = async (uri, options) => {
    try {
        return await mongoose.connect(uri, options);
    } catch (error) {
        if (usingPublicDns || !isDnsLookupFailure(error)) throw error;
        usingPublicDns = true;
        dns.setServers(['8.8.8.8', '1.1.1.1', ...dns.getServers()]);
        console.warn('⚠️ This network could not look up the database address; retrying through public DNS (8.8.8.8 / 1.1.1.1).');
        return mongoose.connect(uri, options);
    }
};

const connectDatabase = () => {
    if (!connecting) {
        if (!process.env.MONGODB_URI) {
            const error = new Error('MONGODB_URI is not set');
            error.name = 'ConfigurationError';
            return Promise.reject(error);
        }

        connecting = connectWithDnsFallback(process.env.MONGODB_URI).then(
            () => {
                console.log('✅ Connected to MongoDB');
            },
            (error) => {
                connecting = null; // let the next caller retry
                throw error;
            }
        );
    }

    return connecting;
};

// Express middleware: hold each request until the connection is up.
// /health also reports 503 whenever the connection is not currently open.
const databaseGate = async (req, res, next) => {
    try {
        await connectDatabase();
    } catch (error) {
        logConnectionError(`${req.method} ${req.path}`, error);
        return res.status(503).json({
            success: false,
            message: UNAVAILABLE_MESSAGE,
        });
    }

    if (req.path === '/health' && mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            status: 'UNAVAILABLE',
            message: 'Database unavailable',
            timestamp: new Date().toISOString(),
        });
    }

    return next();
};

module.exports = {
    connectDatabase,
    connectWithDnsFallback,
    databaseGate,
    logConnectionError,
    UNAVAILABLE_MESSAGE,
};
