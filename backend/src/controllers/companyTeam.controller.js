const Employee = require('../models/Employee');

// ── GET COMPANY TEAM MEMBERS ──
const getTeamMembers = async (req, res) => {
    try {
        const companyId = req.user.companyId;

        if (!companyId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Company account required.',
            });
        }

        const employees = await Employee.find({
            companyId,
        })
            .populate('userId', 'name email image')
            .populate('departmentId', 'name')
            .sort({ createdAt: -1 });

        return res.json({
            success: true,
            data: employees,
        });
    } catch (error) {
        console.error('❌ Get company team error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to load team members',
        });
    }
};

module.exports = {
    getTeamMembers,
};