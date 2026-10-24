const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'], // ← Fixed regex
        },

        password: {
            type: String,
            required: false,
            minlength: [8, 'Password must be at least 8 characters'],
        },

        name: {
            type: String,
            required: [true, 'Name is required'],
            trim: true,
        },

        accountType: {
            type: String,
            enum: ['INDIVIDUAL', 'COMPANY', 'STATION', 'ADMIN', 'EMPLOYEE'],
            default: 'INDIVIDUAL',
            uppercase: true,
        },

        status: {
            type: String,
            enum: ['ACTIVE', 'PENDING', 'SUSPENDED', 'DEACTIVATED'],
            default: 'ACTIVE',
        },

        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            default: null,
        },

        image: {
            type: String,
            default: null,
        },

        emailVerified: {
            type: Date,
            default: null,
        },

        lastLogin: {
            type: Date,
            default: null,
        },

        loginCount: {
            type: Number,
            default: 0,
        },

        // ── Password lifecycle ──
        // Signed into every JWT; incrementing it revokes all existing tokens.
        tokenVersion: {
            type: Number,
            default: 0,
        },

        passwordChangedAt: {
            type: Date,
            default: null,
        },

        // Set when someone other than the user chose the password
        // (admin reset / admin-created account).
        mustChangePassword: {
            type: Boolean,
            default: false,
        },

        // Opt-in: tell me when a new station opens (in these states; empty = anywhere).
        notifyNewStations: {
            type: Boolean,
            default: false,
        },
        notifyStates: {
            type: [String],
            default: [],
        },

        // SHA-256 of the emailed reset token; the raw token is never stored.
        passwordResetTokenHash: {
            type: String,
            default: null,
            select: false,
        },

        passwordResetExpiresAt: {
            type: Date,
            default: null,
            select: false,
        },
    },
    {
        timestamps: true,
    }
);

// ── Hash Password Before Saving ──
UserSchema.pre('save', async function () {
    // Skip hashing if password is not modified or not provided
    if (!this.isModified('password') || !this.password) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// ── Compare Password Method ──
UserSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false;
    const result = await bcrypt.compare(candidatePassword, this.password);
    return result;
};

// ── Remove Password From JSON Response ──
UserSchema.methods.toJSON = function() {
    const user = this.toObject();
    delete user.password;
    delete user.passwordResetTokenHash;
    delete user.passwordResetExpiresAt;
    delete user.tokenVersion;
    return user;
};

module.exports = mongoose.model('User', UserSchema);