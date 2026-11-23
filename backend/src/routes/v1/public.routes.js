const express = require('express');
const ops = require('../../controllers/operations.controller');

// No login: a client reviewing a plan their agency shared with them.
const router = express.Router();
const hits = new Map();
// Small per-IP limit on responses (the links are unguessable; this stops floods).
const limit = (req, res, next) => {
    const key = req.ip || 'x';
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < 10 * 60000);
    if (list.length >= 20) return res.status(429).json({ success: false, message: 'Too many attempts. Try again later.' });
    list.push(now);
    hits.set(key, list);
    return next();
};

router.get('/plan-shares/:token', ops.viewShare);
router.post('/plan-shares/:token/respond', limit, ops.respondShare);

module.exports = router;
