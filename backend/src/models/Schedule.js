const mongoose = require('mongoose');

const ScheduleSchema = new mongoose.Schema({
    stationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Station',
        required: true,
    },
    day: {
        type: String,
        required: true,
        enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
    },
    startTime: {
        type: String,
        required: true,
        match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/,
    },
    endTime: {
        type: String,
        required: true,
        match: /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/,
    },
    slot: {
        type: String,
        required: true,
        enum: ['MORNING', 'AFTERNOON', 'PRIME_TIME', 'LATE_NIGHT'],
    },
    isAvailable: {
        type: Boolean,
        default: true,
    },
    price: {
        type: Number,
        default: null,
    },
}, {
    timestamps: true,
});

// Indexes
ScheduleSchema.index({ stationId: 1, day: 1 });

module.exports = mongoose.model('Schedule', ScheduleSchema);