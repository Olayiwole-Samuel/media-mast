const AuditLog = require('../models/AuditLog');
const documentStorage = require('../utils/documentStorage');
const { getAccess, subscriptionOwner } = require('../utils/subscriptions');

// ─────────────────────────────────────────────────────────────
// CLIENT DOCUMENTS (advertiser's cloud space)
// Upload: POST /api/v1/documents with the raw file as the body,
// Content-Type = the file's type and X-File-Name = its name (URI-encoded).
// Storage space comes with the subscription plan (Plan.storageMB).
// ─────────────────────────────────────────────────────────────

const MB = 1024 * 1024;

const audit = async (req, action, entityId, metadata) => {
    try {
        await AuditLog.create({
            userId: req.user.id,
            companyId: req.user.companyId || null,
            action,
            entityType: 'DOCUMENT',
            entityId,
            metadata,
        });
    } catch (error) {
        console.error('⚠️ Audit log error:', error.name, error.message);
    }
};

const quotaFor = (plan) => Math.max(0, Number(plan?.storageMB) || 0) * MB;

const listMyDocuments = async (req, res) => {
    try {
        const owner = subscriptionOwner(req);
        const [{ plan }, files, used] = await Promise.all([
            getAccess(owner),
            documentStorage.listDocuments(owner),
            documentStorage.storageUsedBytes(owner),
        ]);
        return res.json({
            success: true,
            data: files,
            storage: { usedBytes: used, quotaBytes: quotaFor(plan), planName: plan?.name || null, maxFileBytes: documentStorage.MAX_FILE_BYTES },
        });
    } catch (error) {
        console.error('❌ List documents error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to load your documents' });
    }
};

const uploadDocument = async (req, res) => {
    try {
        const owner = subscriptionOwner(req);
        const buffer = Buffer.isBuffer(req.body) ? req.body : null;
        let name = '';
        try {
            name = decodeURIComponent(String(req.get('x-file-name') || ''));
        } catch {
            name = '';
        }
        const contentType = req.get('content-type') || '';
        const folder = req.get('x-folder') ? String(req.get('x-folder')).slice(0, 60) : null;

        if (!buffer || !name) {
            return res.status(400).json({ success: false, message: 'Send the file as the request body with an X-File-Name header' });
        }
        const problem = documentStorage.checkFile({ name, contentType, size: buffer.length });
        if (problem) return res.status(400).json({ success: false, message: problem });

        const { plan } = await getAccess(owner);
        const quota = quotaFor(plan);
        if (!quota) {
            return res.status(403).json({
                success: false,
                code: 'SUBSCRIPTION_REQUIRED',
                message: 'Document storage comes with a subscription. Choose a plan to get cloud space.',
            });
        }
        const used = await documentStorage.storageUsedBytes(owner);
        if (used + buffer.length > quota) {
            return res.status(403).json({
                success: false,
                code: 'STORAGE_FULL',
                message: `Not enough space: your ${plan.name} plan includes ${Math.round(quota / MB)} MB and ${Math.round((quota - used) / MB * 10) / 10} MB is free. Delete files or upgrade your plan.`,
            });
        }

        const saved = await documentStorage.saveDocument(owner, { name, contentType, buffer, uploadedBy: req.user.id, folder });
        await audit(req, 'UPLOAD_DOCUMENT', saved._id, { name: saved.name, size: saved.size, contentType: saved.contentType });
        return res.status(201).json({ success: true, message: 'Document uploaded', data: saved });
    } catch (error) {
        console.error('❌ Upload document error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Upload failed' });
    }
};

const downloadDocument = async (req, res) => {
    try {
        const owner = subscriptionOwner(req);
        const file = await documentStorage.findDocument(owner, req.params.id);
        if (!file) return res.status(404).json({ success: false, message: 'Document not found' });

        const doc = documentStorage.publicFile(file);
        res.setHeader('Content-Type', doc.contentType);
        res.setHeader('Content-Length', String(doc.size));
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const stream = documentStorage.openDownload(file._id);
        stream.on('error', (error) => {
            console.error('❌ Download stream error:', error.name, error.message);
            if (!res.headersSent) res.status(500).json({ success: false, message: 'Download failed' });
            else res.end();
        });
        return stream.pipe(res);
    } catch (error) {
        console.error('❌ Download document error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Download failed' });
    }
};

const deleteMyDocument = async (req, res) => {
    try {
        const owner = subscriptionOwner(req);
        const file = await documentStorage.findDocument(owner, req.params.id);
        if (!file) return res.status(404).json({ success: false, message: 'Document not found' });
        await documentStorage.deleteDocument(file._id);
        await audit(req, 'DELETE_DOCUMENT', file._id, { name: file.metadata?.name || file.filename });
        return res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('❌ Delete document error:', error.name, error.message);
        return res.status(500).json({ success: false, message: 'Failed to delete the document' });
    }
};

module.exports = {
    listMyDocuments,
    uploadDocument,
    downloadDocument,
    deleteMyDocument,
};
