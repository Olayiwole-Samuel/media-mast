const express = require('express');

const router = express.Router();

const {
    getStations,
    getStationsByType,
    getStation,
    getStationAvailability,
} = require('../../controllers/station.controller');

// Canonical station write handlers (same ones behind /admin/stations).
const {
    createStation,
    updateStation,
    approveStation,
    deactivateStation,
} = require('../../controllers/admin.controller');

const { protect } = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/role');

// ── Public Routes (APPROVED + active stations only, public fields only) ──
router.get('/', getStations);
router.get('/type/:type', getStationsByType);
router.get('/:id/availability', getStationAvailability);
router.get('/:id', getStation);

// ── Legacy admin write routes: compatibility wrappers ──
// Kept for existing consumers; they delegate to the canonical
// /admin/stations handlers so there is a single station lifecycle
// implementation. Legacy DELETE was a soft delete, so it maps to
// deactivate (not the destructive /admin/stations/:id delete).
router.post('/', protect, requireAdmin, createStation);
router.patch('/:id/approve', protect, requireAdmin, approveStation);
router.put('/:id', protect, requireAdmin, updateStation);
router.delete('/:id', protect, requireAdmin, deactivateStation);

module.exports = router;