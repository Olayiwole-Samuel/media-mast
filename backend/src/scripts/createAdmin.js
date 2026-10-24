const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Joi = require('joi');
const User = require('../models/User');
const Admin = require('../models/Admin');

dotenv.config();

// ─────────────────────────────────────────────────────────────
// CREATE ADMIN
//
// Credentials are read from the environment, never from source:
//   ADMIN_EMAIL     (required)
//   ADMIN_PASSWORD  (required)
//   ADMIN_NAME      (optional, defaults to 'Media Masters Admin')
//
// Usage (from backend/):
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... node src/scripts/createAdmin.js
//
// Behaviour:
// - No user with this email      → creates an ACTIVE ADMIN user + Admin record
// - Existing ADMIN user          → ensures the Admin record exists; does NOT
//                                  change password, name or status
// - Existing non-ADMIN user      → refuses and exits without changing anything
//
// Secrets (password, MONGODB_URI, JWT_SECRET) are never printed.
// ─────────────────────────────────────────────────────────────

const fail = (message) => {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
};

// Mirrors the registration password rules in validators/auth.validator.js
const validatePassword = (password) => {
    if (password.length < 8) return 'ADMIN_PASSWORD must be at least 8 characters.';
    if (!/[A-Z]/.test(password)) return 'ADMIN_PASSWORD must contain an uppercase letter.';
    if (!/[a-z]/.test(password)) return 'ADMIN_PASSWORD must contain a lowercase letter.';
    if (!/[0-9]/.test(password)) return 'ADMIN_PASSWORD must contain a number.';
    if (!/[^A-Za-z0-9]/.test(password)) return 'ADMIN_PASSWORD must contain a special character.';
    return null;
};

const createAdmin = async () => {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';
    const name = (process.env.ADMIN_NAME || '').trim() || 'Media Masters Admin';

    // ── Validate configuration before touching the database ──
    const missing = [];
    if (!process.env.MONGODB_URI) missing.push('MONGODB_URI');
    if (!email) missing.push('ADMIN_EMAIL');
    if (!password) missing.push('ADMIN_PASSWORD');

    if (missing.length) {
        return fail(`Missing required environment variable(s): ${missing.join(', ')}. No changes were made.`);
    }

    // Same email rule as the sign-in form (Joi email, real top-level domains),
    // so the admin created here can always sign in.
    if (Joi.string().email().validate(email).error) {
        return fail('ADMIN_EMAIL is not a valid email address (it must be one the sign-in page accepts). No changes were made.');
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
        return fail(`${passwordError} No changes were made.`);
    }

    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected');

        let user = await User.findOne({ email });

        if (user) {
            // ── Never promote or modify a non-admin account ──
            if (user.accountType !== 'ADMIN') {
                return fail(
                    `An account with this email already exists with account type ${user.accountType}. ` +
                    'It was NOT promoted to ADMIN and no changes were made. Use a different ADMIN_EMAIL.'
                );
            }

            console.log('An ADMIN user with this email already exists. Password, name and status were NOT changed.');

            if (user.status !== 'ACTIVE') {
                console.warn(`⚠️ Existing ADMIN user status is ${user.status}. It was NOT reactivated by this script.`);
            }
        } else {
            user = await User.create({
                email,
                password,
                name,
                accountType: 'ADMIN',
                status: 'ACTIVE',
            });

            console.log('Admin user created');
        }

        // ── Check/create Admin record ──
        let admin = await Admin.findOne({ userId: user._id });

        if (!admin) {
            admin = await Admin.create({
                userId: user._id,
                isActive: true,
            });

            console.log('Admin record created');
        } else {
            console.log('Admin record already exists');
        }

        console.log('\n================================');
        console.log('ADMIN SETUP COMPLETE');
        console.log('================================');
        console.log('User ID:', user._id.toString());
        console.log('Admin ID:', admin._id.toString());
        console.log('================================\n');
    } catch (error) {
        // Print only the error type/message — never the full error object,
        // which can include connection details.
        const detail = error?.name === 'ValidationError' ? `: ${error.message}` : '';
        fail(`Failed to create admin (${error?.name || 'Error'}${error?.code ? `, code ${error.code}` : ''})${detail}`);
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
};

createAdmin();
