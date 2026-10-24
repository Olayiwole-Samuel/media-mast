const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

dotenv.config();

const routes = require('./routes');

const app = express();

// On Vercel the app sits behind Vercel's edge proxy, which sets
// X-Forwarded-For to the real client IP. Trust that single hop so the
// auth rate limiter keys on the client, not the proxy. Locally there is
// no proxy, so forwarded headers stay untrusted.
if (process.env.VERCEL) {
    app.set('trust proxy', 1);
}

// ── Security headers ──
app.use(helmet());

// ── CORS ──
const allowedOrigins = [
    'http://localhost:3000',
    'https://media-masters-x.vercel.app',
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests that don't include an Origin header
        // (for example, server-to-server requests)
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // A client condition, not a server fault: the error handler
        // answers 403 with this exact (safe) message.
        const corsError = new Error('Not allowed by CORS');
        corsError.status = 403;
        corsError.isCorsRejection = true;
        return callback(corsError);
    },
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Database readiness ──
// server.js installs the gate (utils/database.js) so requests wait for the
// MongoDB connection. Offline tests use this app with in-memory models and
// leave it unset.
app.use((req, res, next) => {
    const gate = app.get('databaseGate');
    return gate ? gate(req, res, next) : next();
});

// ── Routes ──
app.use('/api/v1', routes);

// ── Health Check ──
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
    });
});

// ── 404 Handler ──
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.url,
    });
});

// ── Error Handler ──
// Public responses never contain an exception's own message or stack for
// unexpected errors: those can carry database hosts, credentials, file
// paths or user input. Only the known client errors below get a specific
// status, each with a fixed message.
const INTERNAL_ERROR_MESSAGE = 'Internal server error. Please try again later.';

// body-parser client errors (other than malformed JSON) keep their 4xx
// status; the parser's own text is not reused because it can quote input.
const BODY_PARSER_ERRORS = {
    'entity.too.large': 'Request body is too large',
    'charset.unsupported': 'Unsupported request body charset',
    'encoding.unsupported': 'Unsupported request body encoding',
    'request.aborted': 'Request aborted',
    'request.size.invalid': 'Invalid request body',
    'stream.encoding.set': 'Invalid request body',
    'parameters.too.many': 'Too many parameters in request body',
};

// Server-side log only: keep the diagnostics but blank out credentials in
// URIs, bearer tokens and JWTs that an exception message may contain.
const redactForLog = (text) => String(text)
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');

app.use((err, req, res, next) => {
    // Response already started: let Express's default handler close the
    // connection instead of attempting a second response.
    if (res.headersSent) {
        return next(err);
    }

    try {
        // Malformed JSON: the parser's message can quote the raw body
        // (e.g. a password), so never log or echo it.
        if (err.type === 'entity.parse.failed') {
            console.error('❌ Invalid JSON body:', req.method, req.path);
            return res.status(400).json({
                success: false,
                message: 'Invalid JSON in request body',
            });
        }

        if (BODY_PARSER_ERRORS[err.type] && err.status >= 400 && err.status < 500) {
            console.error('❌ Invalid request body:', req.method, req.path, err.type);
            return res.status(err.status).json({
                success: false,
                message: BODY_PARSER_ERRORS[err.type],
            });
        }

        if (err.isCorsRejection) {
            return res.status(403).json({
                success: false,
                message: 'Not allowed by CORS',
            });
        }

        // Safety net (N17): a malformed id that slipped past route validation
        // reaches Mongoose as a CastError. That is a client error, and the
        // Mongoose message ("Cast to ObjectId failed for value ...") is not
        // returned. Only CastError is mapped to 400.
        if (err.name === 'CastError') {
            console.error('❌ Invalid ID:', req.method, req.path, err.path || '');
            return res.status(400).json({
                success: false,
                message: 'Invalid ID',
            });
        }

        // Unexpected: log once (redacted), answer generically.
        console.error(
            '❌ Server error:',
            req.method,
            req.path,
            redactForLog(`${err.name}: ${err.message}\n${err.stack || ''}`)
        );
    } catch (handlerError) {
        // Formatting/logging the error failed; still never expose it.
        console.error('❌ Error handler failure:', handlerError && handlerError.name);
    }

    return res.status(500).json({
        success: false,
        message: INTERNAL_ERROR_MESSAGE,
    });
});

module.exports = app;