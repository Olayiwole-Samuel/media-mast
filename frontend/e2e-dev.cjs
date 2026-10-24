'use strict';
// Local end-to-end run: production build of the frontend served on localhost:3000, talking to the local
// e2e backend (backend/test/e2e/start-backend.cjs on 127.0.0.1:5055) instead of the deployed API.
// NEXT_PUBLIC_API_URL is baked in at build time, so this builds first (Vercel builds its own copy).
const { spawnSync, spawn } = require('child_process');
const path = require('path');

const next = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
const env = { ...process.env, NEXT_PUBLIC_API_URL: 'http://127.0.0.1:5055', NEXT_TELEMETRY_DISABLED: '1' };

const build = spawnSync(process.execPath, [next, 'build'], { cwd: __dirname, stdio: 'inherit', env });
if (build.status !== 0) process.exit(build.status || 1);

const child = spawn(process.execPath, [next, 'start', '-H', 'localhost', '-p', '3000'], { cwd: __dirname, stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
