// Runs the OFFLINE test suites only (backend/test/offline/*.test.cjs), one process each, and prints totals.
// These suites use in-memory fakes and never connect to a database. The real-Atlas integration test lives
// in backend/test/integration/ and is NOT run here (see `npm run test:integration`).
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const BACKEND = path.resolve(__dirname, '..');
const OFFLINE = path.join(__dirname, 'offline');
const files = fs.readdirSync(OFFLINE).filter((f) => f.endsWith('.test.cjs')).sort();

let passedChecks = 0;
let totalChecks = 0;
const failedSuites = [];

for (const file of files) {
    const run = spawnSync(process.execPath, [path.join(OFFLINE, file)], {
        cwd: BACKEND,
        encoding: 'utf8',
        timeout: 180000,
        env: { ...process.env, MM_RUN_TXN_INTEGRATION: '' }, // never forwarded to offline suites
    });
    const output = `${run.stdout || ''}\n${run.stderr || ''}`;
    // Each suite ends with a line like "N/M passed" (some prefix it, e.g. "N9: 75/75 passed").
    const totals = [...output.matchAll(/(\d+)\/(\d+) passed/g)].pop();
    const ok = run.status === 0 && totals && totals[1] === totals[2];

    if (totals) {
        passedChecks += Number(totals[1]);
        totalChecks += Number(totals[2]);
    }
    if (!ok) failedSuites.push(file);

    const label = totals ? `${totals[1]}/${totals[2]}` : (run.error ? `error: ${run.error.code || run.error.name}` : 'no summary');
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${file.padEnd(40)} ${label}\n`);
    if (!ok) {
        output.split('\n').filter((l) => /^FAIL|CRASH/.test(l)).slice(0, 10).forEach((l) => process.stdout.write(`        ${l}\n`));
    }
}

process.stdout.write(`\nOffline suites: ${files.length - failedSuites.length}/${files.length} passed | checks: ${passedChecks}/${totalChecks}\n`);
process.exitCode = failedSuites.length === 0 && files.length > 0 ? 0 : 1;
