// Display names for the backend permission strings (backend/src/utils/permissions.js).
// The values themselves come from GET /employees/templates; nothing here grants access.

export const PERMISSION_LABELS = {
    CAMPAIGN_VIEW: "View campaigns",
    CAMPAIGN_CREATE: "Create campaigns",
    CAMPAIGN_EDIT: "Edit campaigns",
    CAMPAIGN_DELETE: "Delete campaigns",
    CAMPAIGN_SUBMIT: "Submit or cancel campaigns",
    CAMPAIGN_APPROVE: "Approve campaigns",
    BOOKING_VIEW: "View bookings",
    BOOKING_CREATE: "Request bookings",
    BOOKING_APPROVE: "Approve bookings",
    BOOKING_CANCEL: "Cancel bookings",
    TEAM_VIEW: "View team and departments",
    TEAM_INVITE: "Invite team members",
    TEAM_EDIT: "Edit team members",
    TEAM_REMOVE: "Remove team members",
    CREATIVE_VIEW: "View creatives",
    CREATIVE_UPLOAD: "Add and edit creatives",
    CREATIVE_APPROVE: "Approve or reject creatives",
    CREATIVE_DELETE: "Delete creatives",
    ANALYTICS_VIEW: "View dashboard and analytics",
    ANALYTICS_EXPORT: "Export analytics",
    PAYMENTS_VIEW: "View payments",
    PAYMENTS_APPROVE: "Approve payments",
};

// Never offered when inviting or editing an employee:
//   ALL_ACCESS   — reserved for the Company Owner (the backend rejects it)
//   ADMIN_ACCESS — not used by the backend, so it would grant nothing
export const HIDDEN_PERMISSIONS = ["ALL_ACCESS", "ADMIN_ACCESS"];

export const TEMPLATE_LABELS = {
    CAMPAIGN_MANAGER: "Campaign manager",
    CREATIVE_TEAM: "Creative team",
    ANALYST: "Analyst",
    TEAM_LEAD: "Team lead",
    VIEWER: "Viewer (read only)",
};

export const permissionLabel = (p) => PERMISSION_LABELS[p] || p;

export const permissionGroup = (p) => {
    const prefix = String(p).split("_")[0];
    return { CAMPAIGN: "Campaigns", BOOKING: "Bookings", TEAM: "Team", CREATIVE: "Creatives", ANALYTICS: "Analytics", PAYMENTS: "Payments" }[prefix] || "Other";
};
