const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Department name is required'],
        trim: true,
        maxlength: [50, 'Department name cannot exceed 50 characters'],
    },
    description: {
        type: String,
        default: null,
        trim: true,
        maxlength: [200, 'Description cannot exceed 200 characters'],
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
    },
    managerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

// ── Indexes ──
DepartmentSchema.index({ companyId: 1, name: 1 }, { unique: true });
DepartmentSchema.index({ companyId: 1, isActive: 1 });

module.exports = mongoose.model('Department', DepartmentSchema);