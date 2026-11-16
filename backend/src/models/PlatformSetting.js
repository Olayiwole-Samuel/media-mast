const mongoose = require('mongoose');

// Small key/value settings an admin can change without a redeploy
// (e.g. key 'settlement': dispute window, confirmation deadline, commission).
const PlatformSettingSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
        value: { type: mongoose.Schema.Types.Mixed, default: {} },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.models.PlatformSetting || mongoose.model('PlatformSetting', PlatformSettingSchema);
