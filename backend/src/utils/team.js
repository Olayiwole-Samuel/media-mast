// ─────────────────────────────────────────────────────────────
// TEAM ACCOUNTS (switched off)
//
// Each company now has a single login: its owner, who alone books and
// spends the wallet. Team members (EMPLOYEE logins), invites and
// departments are turned off unless TEAM_ACCOUNTS_ENABLED=true. Nothing is
// deleted: existing staff accounts simply can't sign in while it is off.
// ─────────────────────────────────────────────────────────────

const teamAccountsEnabled = () => String(process.env.TEAM_ACCOUNTS_ENABLED || '').trim().toLowerCase() === 'true';

const TEAM_DISABLED = {
    success: false,
    code: 'TEAM_DISABLED',
    message: 'Team logins have been turned off. Each company now signs in with its owner account only.',
};

// For routes that only exist for teams (members, invites, departments).
const requireTeamEnabled = (req, res, next) => (teamAccountsEnabled() ? next() : res.status(410).json(TEAM_DISABLED));

module.exports = { teamAccountsEnabled, requireTeamEnabled, TEAM_DISABLED };
