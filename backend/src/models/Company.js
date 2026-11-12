const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Company name is required'],
        trim: true,
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Company email is required'],
        unique: true,
        lowercase: true,
        trim: true,
    },
    phone: {
        type: String,
        default: null,
    },
    logo: {
        type: String,
        default: null,
    },
    website: {
        type: String,
        default: null,
    },
    description: {
        type: String,
        default: null,
    },
    address: {
        type: String,
        default: null,
    },
    city: {
        type: String,
        default: null,
    },
    state: {
        type: String,
        default: null,
    },
    country: {
        type: String,
        default: 'Nigeria',
    },
    // What kind of business this is: a brand advertising itself (CLIENT) or
    // an ad agency booking on behalf of client brands (AGENCY).
    companyType: {
        type: String,
        enum: ['CLIENT', 'AGENCY'],
        default: 'CLIENT',
    },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'],
        default: 'PENDING',
    },
    subscriptionId: {
        type: String,
        default: null,
    },
    timezone: {
        type: String,
        default: 'Africa/Lagos',
    },
    currency: {
        type: String,
        default: 'NGN',
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Company', CompanySchema);