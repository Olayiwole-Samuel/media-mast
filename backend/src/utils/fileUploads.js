// ─────────────────────────────────────────────────────────────
// LARGE FILE UPLOADS (in parts, stored in GridFS)
//
// Vercel functions accept request bodies of about 4.5 MB, but advert videos
// are much bigger. The browser therefore sends a file in parts of PART_SIZE
// bytes; each part is split into GridFS chunks and written straight into
// "<bucket>.chunks". When every part has arrived, "complete" writes the
// "<bucket>.files" record, after which the file is an ordinary GridFS file
// (streamed with GridFSBucket.openDownloadStream).
//
//   POST /uploads              → { uploadId, partSize, parts }
//   PUT  /uploads/:id/parts/:n → raw bytes of part n (0-based)
//   POST /uploads/:id/complete → { fileId, name, size, contentType }
//
// A finished upload belongs to the user who made it and is attached once,
// to a creative or a verification document (claimUpload).
// ─────────────────────────────────────────────────────────────

const mongoose = require('mongoose');

const CHUNK_SIZE = 256 * 1024;
const CHUNKS_PER_PART = 14;
const PART_SIZE = CHUNK_SIZE * CHUNKS_PER_PART; // 3.5 MB: under Vercel's body limit

const MB = 1024 * 1024;

const MEDIA_TYPES = {
    'video/mp4': ['mp4', 'm4v'],
    'video/quicktime': ['mov'],
    'video/webm': ['webm'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/gif': ['gif'],
    'audio/mpeg': ['mp3'],
    'audio/mp4': ['m4a'],
    'audio/x-m4a': ['m4a'],
    'audio/wav': ['wav'],
    'audio/x-wav': ['wav'],
    'audio/aac': ['aac'],
};

const PAPER_TYPES = {
    'application/pdf': ['pdf'],
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
};

const RATE_CARD_TYPES = {
    ...PAPER_TYPES,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
    'application/vnd.ms-excel': ['xls'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'application/msword': ['doc'],
};

// What each kind of upload may be, and where it is stored.
const PURPOSES = {
    CREATIVE: { bucket: 'creatives', maxBytes: 100 * MB, types: MEDIA_TYPES, label: 'an advert (video, image or audio)' },
    ARCON: { bucket: 'creatives', maxBytes: 10 * MB, types: PAPER_TYPES, label: 'an ARCON certificate (PDF or image)' },
    VERIFICATION: { bucket: 'verification', maxBytes: 10 * MB, types: RATE_CARD_TYPES, label: 'a document (PDF, image, Word or Excel)' },
};

const sessions = () => mongoose.connection.db.collection('uploadsessions');
const chunks = (bucket) => mongoose.connection.db.collection(`${bucket}.chunks`);
const files = (bucket) => mongoose.connection.db.collection(`${bucket}.files`);

const oid = (v) => new mongoose.Types.ObjectId(String(v));

const cleanName = (name) => {
    const base = String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001F\u007F"<>|*?:]/g, '').trim();
    return base.slice(0, 150) || 'file';
};
const extensionOf = (name) => (String(name).match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
const baseType = (t) => String(t || '').split(';')[0].trim().toLowerCase();

// Returns an error message, or null when the file is acceptable.
const checkUpload = ({ purpose, name, contentType, size }) => {
    const rule = PURPOSES[purpose];
    if (!rule) return 'Unknown upload type';
    const n = Number(size);
    if (!Number.isInteger(n) || n <= 0) return 'The file is empty';
    if (n > rule.maxBytes) return `This file is too large: the limit is ${rule.maxBytes / MB} MB`;
    const exts = rule.types[baseType(contentType)];
    if (!exts) return `This file type is not supported here. Upload ${rule.label}.`;
    if (!exts.includes(extensionOf(name))) return `The file name should end in .${exts[0]} for this file type`;
    return null;
};

const partCount = (size) => Math.ceil(size / PART_SIZE);
const partLength = (size, index) => (index < partCount(size) - 1 ? PART_SIZE : size - index * PART_SIZE);

const startUpload = async ({ user, purpose, name, contentType, size }) => {
    const rule = PURPOSES[purpose];
    const now = new Date();
    const doc = {
        ownerUserId: oid(user._id || user.id),
        companyId: user.companyId ? oid(user.companyId) : null,
        purpose,
        bucket: rule.bucket,
        name: cleanName(name),
        contentType: baseType(contentType),
        size: Number(size),
        partSize: PART_SIZE,
        chunkSize: CHUNK_SIZE,
        parts: partCount(Number(size)),
        partsReceived: [],
        fileId: new mongoose.Types.ObjectId(),
        completedAt: null,
        claimedAt: null,
        createdAt: now,
    };
    const { insertedId } = await sessions().insertOne(doc);
    return { uploadId: insertedId, partSize: PART_SIZE, parts: doc.parts };
};

const findOwnSession = async (user, uploadId) => {
    if (!mongoose.isValidObjectId(uploadId)) return null;
    return sessions().findOne({ _id: oid(uploadId), ownerUserId: oid(user._id || user.id) });
};

// Writes one part. Safe to retry: the part's chunks are replaced.
const writePart = async (session, index, buffer) => {
    if (session.completedAt) return 'This upload is already finished';
    if (!Number.isInteger(index) || index < 0 || index >= session.parts) return 'Invalid part number';
    const expected = partLength(session.size, index);
    if (!Buffer.isBuffer(buffer) || buffer.length !== expected) {
        return `Part ${index + 1} should be ${expected} bytes`;
    }
    const firstN = index * CHUNKS_PER_PART;
    const docs = [];
    for (let offset = 0, j = 0; offset < buffer.length; offset += CHUNK_SIZE, j++) {
        docs.push({
            files_id: session.fileId,
            n: firstN + j,
            data: new mongoose.mongo.Binary(buffer.subarray(offset, offset + CHUNK_SIZE)),
        });
    }
    const col = chunks(session.bucket);
    await col.deleteMany({ files_id: session.fileId, n: { $gte: firstN, $lt: firstN + CHUNKS_PER_PART } });
    await col.insertMany(docs, { ordered: true });
    await sessions().updateOne({ _id: session._id }, { $addToSet: { partsReceived: index } });
    return null;
};

const finishUpload = async (session) => {
    if (session.completedAt) return { file: publicUpload(session) };
    const missing = [];
    for (let i = 0; i < session.parts; i++) if (!session.partsReceived.includes(i)) missing.push(i + 1);
    if (missing.length) return { error: `Parts still missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}` };

    const expectedChunks = Math.ceil(session.size / CHUNK_SIZE);
    const stored = await chunks(session.bucket).countDocuments({ files_id: session.fileId });
    if (stored !== expectedChunks) return { error: 'The upload is incomplete. Please try again.' };

    await files(session.bucket).insertOne({
        _id: session.fileId,
        length: session.size,
        chunkSize: CHUNK_SIZE,
        uploadDate: new Date(),
        filename: session.name,
        metadata: {
            ownerUserId: session.ownerUserId,
            companyId: session.companyId,
            purpose: session.purpose,
            name: session.name,
            contentType: session.contentType,
        },
    });
    const completedAt = new Date();
    await sessions().updateOne({ _id: session._id }, { $set: { completedAt } });
    return { file: publicUpload({ ...session, completedAt }) };
};

const publicUpload = (s) => ({
    uploadId: s._id,
    fileId: s.fileId,
    name: s.name,
    contentType: s.contentType,
    size: s.size,
    purpose: s.purpose,
});

// Attach a finished upload (made by this user, for this purpose) exactly once.
// Returns the file info, or { error }.
const claimUpload = async (user, uploadId, purpose) => {
    if (!mongoose.isValidObjectId(uploadId)) return { error: 'Upload the file first' };
    const claimed = await sessions().findOneAndUpdate(
        { _id: oid(uploadId), ownerUserId: oid(user._id || user.id), purpose, completedAt: { $ne: null }, claimedAt: null },
        { $set: { claimedAt: new Date() } },
        { returnDocument: 'after' }
    );
    const doc = claimed && (claimed.value !== undefined ? claimed.value : claimed);
    if (!doc || !doc._id) return { error: 'That file upload was not found or is already in use. Upload it again.' };
    return { file: publicUpload(doc) };
};

// Cancel an unfinished upload: drop its parts.
const abortUpload = async (session) => {
    if (session.completedAt) return;
    await chunks(session.bucket).deleteMany({ files_id: session.fileId });
    await sessions().deleteOne({ _id: session._id });
};

const bucketFor = (bucketName) => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });

const fileInfo = async (bucketName, fileId) => {
    if (!fileId || !mongoose.isValidObjectId(fileId)) return null;
    return files(bucketName).findOne({ _id: oid(fileId) });
};

const openFile = (bucketName, fileId) => bucketFor(bucketName).openDownloadStream(oid(fileId));

const deleteFile = async (bucketName, fileId) => {
    try {
        await bucketFor(bucketName).delete(oid(fileId));
    } catch (error) {
        if (!/FileNotFound|File not found/i.test(String(error.message))) throw error;
    }
};

// Streams a stored file to the response (inline, so videos play in the browser).
const sendFile = async (res, bucketName, fileId, { download = false } = {}) => {
    const info = await fileInfo(bucketName, fileId);
    if (!info) {
        res.status(404).json({ success: false, message: 'File not found' });
        return;
    }
    const name = info.metadata?.name || info.filename || 'file';
    res.setHeader('Content-Type', info.metadata?.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', String(info.length));
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${name.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    openFile(bucketName, fileId)
        .on('error', () => { if (!res.headersSent) res.status(500).end(); else res.end(); })
        .pipe(res);
};

module.exports = {
    PURPOSES,
    PART_SIZE,
    CHUNK_SIZE,
    checkUpload,
    startUpload,
    findOwnSession,
    writePart,
    finishUpload,
    claimUpload,
    abortUpload,
    fileInfo,
    openFile,
    deleteFile,
    sendFile,
};
