const Verification = require('../models/Verification');
const uploads = require('../utils/fileUploads');

// POST /uploads — start a file upload (sent in parts; see utils/fileUploads.js).
//   CREATIVE / ARCON: an approved advertiser's advert and its ARCON certificate
//   VERIFICATION: a business's own verification documents (also while PENDING)

const ADVERTISER_TYPES = ['COMPANY', 'EMPLOYEE', 'INDIVIDUAL'];

const mayUpload = async (user, purpose) => {
    if (purpose === 'VERIFICATION') {
        return !!(await Verification.exists({ userId: user._id }));
    }
    return user.status === 'ACTIVE' && ADVERTISER_TYPES.includes(user.accountType);
};

const startUpload = async (req, res) => {
    try {
        const { purpose, name, contentType, size } = req.body || {};
        const purposeKey = String(purpose || '').toUpperCase();

        const problem = uploads.checkUpload({ purpose: purposeKey, name, contentType, size });
        if (problem) return res.status(400).json({ success: false, message: problem });

        if (!(await mayUpload(req.user, purposeKey))) {
            return res.status(403).json({ success: false, message: 'You cannot upload this kind of file.' });
        }

        const started = await uploads.startUpload({ user: req.user, purpose: purposeKey, name, contentType, size });
        return res.status(201).json({ success: true, data: started });
    } catch (error) {
        console.error('❌ Start upload error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Could not start the upload' });
    }
};

const uploadPart = async (req, res) => {
    try {
        const session = await uploads.findOwnSession(req.user, req.params.id);
        if (!session) return res.status(404).json({ success: false, message: 'Upload not found' });

        const problem = await uploads.writePart(session, Number(req.params.index), req.body);
        if (problem) return res.status(400).json({ success: false, message: problem });
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Upload part error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Part upload failed. Please retry.' });
    }
};

const completeUpload = async (req, res) => {
    try {
        const session = await uploads.findOwnSession(req.user, req.params.id);
        if (!session) return res.status(404).json({ success: false, message: 'Upload not found' });

        const result = await uploads.finishUpload(session);
        if (result.error) return res.status(400).json({ success: false, message: result.error });
        return res.json({ success: true, data: result.file });
    } catch (error) {
        console.error('❌ Complete upload error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Could not finish the upload' });
    }
};

const cancelUpload = async (req, res) => {
    try {
        const session = await uploads.findOwnSession(req.user, req.params.id);
        if (session) await uploads.abortUpload(session);
        return res.json({ success: true });
    } catch (error) {
        console.error('❌ Cancel upload error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Could not cancel the upload' });
    }
};

module.exports = { startUpload, uploadPart, completeUpload, cancelUpload };
