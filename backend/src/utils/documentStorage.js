// ─────────────────────────────────────────────────────────────
// CLIENT DOCUMENT STORAGE (GridFS in the app's MongoDB database)
//
// Each advertiser (company or individual) has cloud space for documents:
// creatives, briefs, contracts, invoices. The plan sets the quota
// (Plan.storageMB). Files live in the "documents" GridFS bucket with the
// owner in their metadata; every read, download and delete is scoped to it.
//
// Uploads are limited to MAX_FILE_BYTES because Vercel functions accept
// request bodies of about 4.5 MB. For larger files, move this module to an
// object store (Cloudflare R2 / S3) behind the same functions.
// ─────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

const BUCKET = 'documents';
const MAX_FILE_BYTES = 4 * 1024 * 1024;

const ALLOWED_TYPES = {
    'application/pdf': ['pdf'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/gif': ['gif'],
    'audio/mpeg': ['mp3'],
    'audio/wav': ['wav'],
    'audio/x-wav': ['wav'],
    'video/mp4': ['mp4'],
    'text/plain': ['txt'],
    'text/csv': ['csv'],
    'application/msword': ['doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'application/vnd.ms-excel': ['xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
    'application/vnd.ms-powerpoint': ['ppt'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
    'application/zip': ['zip'],
};

const bucket = () => {
    if (!mongoose.connection?.db) throw Object.assign(new Error('Database not connected'), { code: 'NO_DB' });
    return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: BUCKET });
};

const filesCollection = () => mongoose.connection.db.collection(`${BUCKET}.files`);

// Owner filter on the files' metadata.
const ownerQuery = (owner) =>
    owner.companyId
        ? { 'metadata.companyId': new mongoose.Types.ObjectId(String(owner.companyId)) }
        : { 'metadata.userId': new mongoose.Types.ObjectId(String(owner.userId)), 'metadata.companyId': null };

const cleanName = (name) => {
    const base = String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001F\u007F"<>|*?:]/g, '').trim();
    return base.slice(0, 150) || 'document';
};

const extensionOf = (name) => (String(name).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';

// Returns an error message, or null when the file can be stored.
const checkFile = ({ name, contentType, size }) => {
    if (!size) return 'The file is empty';
    if (size > MAX_FILE_BYTES) return `Files can be at most ${MAX_FILE_BYTES / (1024 * 1024)} MB`;
    const exts = ALLOWED_TYPES[String(contentType || '').split(';')[0].trim().toLowerCase()];
    if (!exts) return 'This file type is not supported. Upload a PDF, image, audio, video, Office, text, CSV or ZIP file.';
    if (!exts.includes(extensionOf(name))) return `The file name should end in .${exts[0]} for this file type`;
    return null;
};

const storageUsedBytes = async (owner) => {
    if (!mongoose.connection?.db) return 0;
    const rows = await filesCollection()
        .aggregate([{ $match: ownerQuery(owner) }, { $group: { _id: null, total: { $sum: '$length' } } }])
        .toArray();
    return rows[0]?.total || 0;
};

const publicFile = (f) => ({
    _id: f._id,
    name: f.metadata?.name || f.filename,
    contentType: f.metadata?.contentType || 'application/octet-stream',
    size: f.length,
    folder: f.metadata?.folder || null,
    uploadedAt: f.uploadDate,
    uploadedBy: f.metadata?.uploadedBy || null,
});

const listDocuments = async (owner) => {
    const files = await filesCollection().find(ownerQuery(owner)).sort({ uploadDate: -1 }).toArray();
    return files.map(publicFile);
};

const saveDocument = (owner, { name, contentType, buffer, uploadedBy, folder = null }) =>
    new Promise((resolve, reject) => {
        const safeName = cleanName(name);
        const upload = bucket().openUploadStream(safeName, {
            metadata: {
                userId: owner.companyId ? null : new mongoose.Types.ObjectId(String(owner.userId)),
                companyId: owner.companyId ? new mongoose.Types.ObjectId(String(owner.companyId)) : null,
                uploadedBy: uploadedBy ? new mongoose.Types.ObjectId(String(uploadedBy)) : null,
                name: safeName,
                contentType: String(contentType).split(';')[0].trim().toLowerCase(),
                folder: folder ? String(folder).slice(0, 60) : null,
            },
        });
        upload.once('error', reject);
        upload.once('finish', () => resolve({
            _id: upload.id,
            name: safeName,
            contentType: String(contentType).split(';')[0].trim().toLowerCase(),
            size: buffer.length,
            folder,
            uploadedAt: new Date(),
        }));
        upload.end(buffer);
    });

const findDocument = async (owner, id) => {
    if (!mongoose.isValidObjectId(id)) return null;
    return filesCollection().findOne({ _id: new mongoose.Types.ObjectId(String(id)), ...ownerQuery(owner) });
};

const openDownload = (id) => bucket().openDownloadStream(new mongoose.Types.ObjectId(String(id)));

const deleteDocument = async (id) => bucket().delete(new mongoose.Types.ObjectId(String(id)));

module.exports = {
    MAX_FILE_BYTES,
    ALLOWED_TYPES,
    checkFile,
    cleanName,
    storageUsedBytes,
    listDocuments,
    saveDocument,
    findDocument,
    openDownload,
    deleteDocument,
    publicFile,
};
