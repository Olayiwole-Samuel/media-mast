require('dotenv').config();

const app = require('./src/app');
const {
    connectDatabase,
    databaseGate,
    logConnectionError,
} = require('./src/utils/database');

const PORT = process.env.PORT || 5000;

// Every request waits for the shared MongoDB connection (503 if it fails).
app.set('databaseGate', databaseGate);

if (process.env.VERCEL) {
    // Serverless: start connecting at cold start. A failure is logged here
    // and retried by the next request's gate — never an unhandled rejection.
    connectDatabase().catch((error) => {
        logConnectionError('startup', error);
    });
} else {
    // Standalone: listen only once the database is connected.
    connectDatabase()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`🚀 Server running on port ${PORT}`);
            });

            // Slot reminders (24h and 1h before airing) every 5 minutes.
            // On Vercel a cron service calls POST /api/v1/jobs/reminders instead.
            const { runReminders } = require('./src/utils/reminders');
            const tick = () => runReminders().catch((error) => console.error('⚠️ Reminder run failed:', error.name));
            setInterval(tick, 5 * 60 * 1000).unref();
            tick();
        })
        .catch((error) => {
            logConnectionError('startup', error);
            process.exit(1);
        });
}

module.exports = app;
