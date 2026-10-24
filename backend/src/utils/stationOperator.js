// ─────────────────────────────────────────────────
// STATION OPERATOR SCOPE
//
// Which stations the caller may run, for routes guarded by
// requireStationOperator (middleware/role.js):
//   STATION  stations this manager is assigned to (managerIds).
//   ADMIN    every station.
//   COMPANY  stations owned by this company (transition).
// ─────────────────────────────────────────────────

const stationOwnerFilter = (req) => {
    const operator = req.stationOperator;

    if (!operator) {
        // A route that forgot requireStationOperator must fail closed.
        throw new Error('stationOwnerFilter used without requireStationOperator');
    }

    if (operator.kind === 'ADMIN') return {};
    if (operator.kind === 'STATION') return { managerIds: operator.userId };
    return { companyId: operator.companyId };
};

const ownsStation = (req, station) => {
    if (!station) return false;
    const operator = req.stationOperator;

    if (!operator) throw new Error('ownsStation used without requireStationOperator');
    if (operator.kind === 'ADMIN') return true;
    if (operator.kind === 'STATION') {
        return Array.isArray(station.managerIds) && station.managerIds.some((id) => String(id) === String(operator.userId));
    }
    return station.companyId != null && String(station.companyId) === String(operator.companyId);
};

module.exports = {
    stationOwnerFilter,
    ownsStation,
};
