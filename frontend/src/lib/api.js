import { clearSession } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ── Helper to get auth token ──
const getToken = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token');
};

// ── Error carrying the HTTP status (401 / 403 / 404 / 409 …) ──
export class ApiError extends Error {
    constructor(message, status, data) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

// ── Helper for authenticated requests ──
const authFetch = async (endpoint, options = {}) => {
    const token = getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    let data = null;

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        data = await response.json();
    } else {
        const text = await response.text();

        data = {
            message: text || 'Server returned an unexpected response',
        };
    }

    if (!response.ok) {
        // A rejected token means the session is over: clear it and go to login.
        if (response.status === 401 && token) {
            clearSession();

            if (
                typeof window !== 'undefined' &&
                !window.location.pathname.startsWith('/login')
            ) {
                window.location.assign('/login?reason=expired');
            }
        }

        const message =
            data?.message ||
            (Array.isArray(data?.errors) ? data.errors[0] : null) ||
            'Something went wrong';

        throw new ApiError(message, response.status, data);
    }

    return data;
};

// ── AUTH ──

// Current user (fresh from the server)
export const getMe = async () => {
    return authFetch('/api/v1/auth/me');
};

// ── Password and invitation flows (public, token from an emailed link) ──
const publicPost = async (endpoint, body) => {
    const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
        const message = (Array.isArray(data?.errors) && data.errors[0]) || data?.message || 'Something went wrong. Please try again.';
        throw new ApiError(message, response.status, data);
    }
    return data;
};

export const requestPasswordReset = (email) =>
    publicPost('/api/v1/auth/forgot-password', { email });

export const resetPassword = (token, password) =>
    publicPost('/api/v1/auth/reset-password', { token, password });

export const acceptInvitation = (token, password, name) =>
    publicPost('/api/v1/auth/invite/accept', { token, password, ...(name ? { name } : {}) });

// Signed in: change password. The server ends every session afterwards.
export const changePassword = async (currentPassword, newPassword) => {
    return authFetch('/api/v1/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
    });
};

// ── COMPANY APIS ──

// Get company dashboard data
export const getCompanyDashboard = async () => {
    return authFetch('/api/v1/company/dashboard');
};

// Get company settings
export const getCompanySettings = async () => {
    return authFetch('/api/v1/settings');
};

// Update company settings
export const updateCompanySettings = async (data) => {
    return authFetch('/api/v1/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

// ── TEAM APIS ──

// Get team members
export const getTeamMembers = async () => {
    return authFetch('/api/v1/company/team');
};

// Invite team member
export const inviteTeamMember = async (data) => {
    return authFetch('/api/v1/company/team/invite', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

// Remove team member
export const removeTeamMember = async (id) => {
    return authFetch(`/api/v1/company/team/${id}`, {
        method: 'DELETE',
    });
};

// Permission list + role templates (GET /employees/templates)
export const getPermissionTemplates = async () => {
    return authFetch('/api/v1/employees/templates');
};

// Update team member role
export const updateTeamMemberRole = async (id, data) => {
    return authFetch(`/api/v1/company/team/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

// ── ADMIN: COMPANY OWNER RECORD ──

// Read-only diagnosis of the company owner's owner record
export const checkCompanyOwnerRecord = async (companyId) => {
    return authFetch(`/api/v1/admin/companies/${companyId}/owner-check`);
};

// Safe repair (create or reactivate); anything else is refused with a reason
export const repairCompanyOwnerRecord = async (companyId) => {
    return authFetch(`/api/v1/admin/companies/${companyId}/owner-repair`, {
        method: 'POST',
    });
};

// ── ADMIN PAYMENT APIS ──

// Every payment with per-currency totals (optional status filter)
export const getAdminPayments = async (status) => {
    return authFetch(`/api/v1/admin/payments${status ? `?status=${encodeURIComponent(status)}` : ''}`);
};

// One payment with its bookings and their refunds
export const getAdminPayment = async (id) => {
    return authFetch(`/api/v1/admin/payments/${id}`);
};

// ── ADMIN INDIVIDUAL APIS ──

// Get all individuals
export const getAdminIndividuals = async () => {
    return authFetch('/api/v1/admin/individuals');
};

// Get single individual
export const getAdminIndividual = async (id) => {
    return authFetch(`/api/v1/admin/individuals/${id}`);
};

// Update individual
export const updateAdminIndividual = async (id, data) => {
    return authFetch(`/api/v1/admin/individuals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
};

// Suspend individual
export const suspendAdminIndividual = async (id) => {
    return authFetch(`/api/v1/admin/individuals/${id}/suspend`, {
        method: 'PATCH',
    });
};

// Activate individual
export const activateAdminIndividual = async (id) => {
    return authFetch(`/api/v1/admin/individuals/${id}/activate`, {
        method: 'PATCH',
    });
};

// Reactivate individual
export const reactivateAdminIndividual = async (id) => {
    return authFetch(`/api/v1/admin/individuals/${id}/reactivate`, {
        method: 'PATCH',
    });
};

// Reset individual account
export const resetAdminIndividual = async (id) => {
    return authFetch(`/api/v1/admin/individuals/${id}/reset`, {
        method: 'POST',
    });
};

// Delete individual
export const deleteAdminIndividual = async (id) => {
    return authFetch(`/api/v1/admin/individuals/${id}`, {
        method: 'DELETE',
    });
};

// Get individual campaigns
export const getAdminIndividualCampaigns = async (id) => {
    return authFetch(`/api/v1/admin/individuals/${id}/campaigns`);
};

// Get single individual campaign
export const getAdminIndividualCampaign = async (id, campaignId) => {
    return authFetch(
        `/api/v1/admin/individuals/${id}/campaigns/${campaignId}`
    );
};

// Create campaign for individual
export const createAdminIndividualCampaign = async (id, data) => {
    return authFetch(`/api/v1/admin/individuals/${id}/campaigns`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

// Update individual campaign
export const updateAdminIndividualCampaign = async (
    id,
    campaignId,
    data
) => {
    return authFetch(
        `/api/v1/admin/individuals/${id}/campaigns/${campaignId}`,
        {
            method: 'PUT',
            body: JSON.stringify(data),
        }
    );
};

// Update individual campaign status
export const updateAdminIndividualCampaignStatus = async (
    id,
    campaignId,
    status
) => {
    return authFetch(
        `/api/v1/admin/individuals/${id}/campaigns/${campaignId}/status`,
        {
            method: 'PATCH',
            body: JSON.stringify({
                status: String(status).trim().toUpperCase(),
            }),
        }
    );
};

// Delete individual campaign
export const deleteAdminIndividualCampaign = async (
    id,
    campaignId
) => {
    return authFetch(
        `/api/v1/admin/individuals/${id}/campaigns/${campaignId}`,
        {
            method: 'DELETE',
        }
    );
};

// Get individual bookings
export const getAdminIndividualBookings = async (id) => {
    return authFetch(`/api/v1/admin/individuals/${id}/bookings`);
};

// Get individual activity history
export const getAdminIndividualActivity = async (id) => {
    return authFetch(`/api/v1/admin/individuals/${id}/activity`);
};

// ── ADMIN COMPANY APIS ──

// Get all companies
export const getAdminCompanies = async () => {
    return authFetch('/api/v1/admin/companies');
};

// Get single company
export const getAdminCompany = async (id) => {
    return authFetch(`/api/v1/admin/companies/${id}`);
};

// Create company
export const createAdminCompany = async (data) => {
    return authFetch('/api/v1/admin/companies', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

// Update company
export const updateAdminCompany = async (id, data) => {
    return authFetch(`/api/v1/admin/companies/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
};

// Update company verification
export const updateAdminCompanyVerification = async (id, status) => {
    return authFetch(`/api/v1/admin/companies/${id}/verification`, {
        method: 'PATCH',
        body: JSON.stringify({
            status: String(status).trim().toUpperCase(),
        }),
    });
};

// Suspend company
export const suspendAdminCompany = async (id) => {
    return authFetch(`/api/v1/admin/companies/${id}/suspend`, {
        method: 'PATCH',
    });
};

// Reactivate company
export const reactivateAdminCompany = async (id) => {
    return authFetch(`/api/v1/admin/companies/${id}/reactivate`, {
        method: 'PATCH',
    });
};

// ── ADMIN COMPANY WORKER APIS ──

// Get all workers for a company
export const getAdminCompanyWorkers = async (companyId) => {
    return authFetch(
        `/api/v1/admin/companies/${companyId}/workers`
    );
};

// Get single worker
export const getAdminCompanyWorker = async (
    companyId,
    workerId
) => {
    return authFetch(
        `/api/v1/admin/companies/${companyId}/workers/${workerId}`
    );
};

// Create worker
export const createAdminCompanyWorker = async (
    companyId,
    data
) => {
    return authFetch(
        `/api/v1/admin/companies/${companyId}/workers`,
        {
            method: 'POST',
            body: JSON.stringify(data),
        }
    );
};

// Update worker
export const updateAdminCompanyWorker = async (
    companyId,
    workerId,
    data
) => {
    return authFetch(
        `/api/v1/admin/companies/${companyId}/workers/${workerId}`,
        {
            method: 'PATCH',
            body: JSON.stringify(data),
        }
    );
};

// Activate worker
export const activateAdminCompanyWorker = async (
    companyId,
    workerId
) => {
    return authFetch(
        `/api/v1/admin/companies/${companyId}/workers/${workerId}/activate`,
        {
            method: 'PATCH',
        }
    );
};

// Deactivate worker
export const deactivateAdminCompanyWorker = async (
    companyId,
    workerId
) => {
    return authFetch(
        `/api/v1/admin/companies/${companyId}/workers/${workerId}/deactivate`,
        {
            method: 'PATCH',
        }
    );
};

// Reactivate worker
export const reactivateAdminCompanyWorker = async (
    companyId,
    workerId
) => {
    return authFetch(
        `/api/v1/admin/companies/${companyId}/workers/${workerId}/reactivate`,
        {
            method: 'PATCH',
        }
    );
};

// Remove worker
export const removeAdminCompanyWorker = async (
    companyId,
    workerId
) => {
    return authFetch(
        `/api/v1/admin/companies/${companyId}/workers/${workerId}`,
        {
            method: 'DELETE',
        }
    );
};

// ── CAMPAIGN APIS ──

// Get all campaigns
export const getCampaigns = async () => {
    return authFetch('/api/v1/campaigns');
};

// Get single campaign
export const getCampaign = async (id) => {
    return authFetch(`/api/v1/campaigns/${id}`);
};

// Create campaign
export const createCampaign = async (data) => {
    return authFetch('/api/v1/campaigns', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

// Update campaign
export const updateCampaign = async (id, data) => {
    return authFetch(`/api/v1/campaigns/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

// Delete campaign
export const deleteCampaign = async (id) => {
    return authFetch(`/api/v1/campaigns/${id}`, {
        method: 'DELETE',
    });
};

// Update campaign status (the backend only allows the transitions in
// utils/campaignStatus.js; see lib/status.js for the frontend mirror)
export const updateCampaignStatus = async (id, status) => {
    return authFetch(`/api/v1/campaigns/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
            status: String(status).trim().toUpperCase(),
        }),
    });
};

// ── COMPANY USAGE / DEPARTMENTS ──

// Usage counts (needs ANALYTICS_VIEW)
export const getCompanyUsage = async () => {
    return authFetch('/api/v1/settings/usage');
};

// Departments (needs TEAM_VIEW)
export const getDepartments = async () => {
    return authFetch('/api/v1/departments');
};

// Department with its current members (needs TEAM_VIEW)
export const getDepartment = async (id) => {
    return authFetch(`/api/v1/departments/${id}`);
};

export const createDepartment = async (data) => {
    return authFetch('/api/v1/departments', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

export const updateDepartment = async (id, data) => {
    return authFetch(`/api/v1/departments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

export const deleteDepartment = async (id) => {
    return authFetch(`/api/v1/departments/${id}`, {
        method: 'DELETE',
    });
};

export const assignDepartmentMember = async (employeeId, departmentId) => {
    return authFetch('/api/v1/departments/assign', {
        method: 'POST',
        body: JSON.stringify({ employeeId, departmentId }),
    });
};

// ── BOOKING APIS ──

// Get all bookings
export const getBookings = async () => {
    return authFetch('/api/v1/bookings');
};

// Get single booking
export const getBooking = async (id) => {
    return authFetch(`/api/v1/bookings/${id}`);
};

// Bookings are created through checkout (see checkout below); the direct
// unpaid booking route is disabled on the server.

// Booking status changes are station actions (accept/reject/schedule/
// complete), not available to customers, so there is no status helper.

// Cancel booking (a paid booking is refunded by the server)
export const cancelBooking = async (id) => {
    return authFetch(`/api/v1/bookings/${id}/cancel`, {
        method: 'POST',
    });
};

// Resubmit a booking after the station asked for changes
export const resubmitBooking = async (id) => {
    return authFetch(`/api/v1/bookings/${id}/resubmit`, {
        method: 'PATCH',
    });
};

// ── CHECKOUT / PAYMENT APIS ──

// Pay once for a cart of booking requests on one campaign. Only station,
// slot, date, time and duration are sent: prices come from the server.
export const checkout = async ({ campaignId, items }) => {
    return authFetch('/api/v1/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({
            campaignId,
            items: (items || []).map(({ stationId, slot, date, time, duration, rateId }) => ({
                stationId,
                slot,
                date,
                time,
                duration: Number(duration),
                ...(rateId ? { rateId } : {}),
            })),
        }),
    });
};

export const getPayments = async () => {
    return authFetch('/api/v1/payments');
};

export const getPayment = async (id) => {
    return authFetch(`/api/v1/payments/${id}`);
};

// ── STATION-SIDE BOOKING APIS (company that owns the station) ──

export const getStationBookings = async () => {
    return authFetch('/api/v1/bookings/station');
};

const stationBookingAction = (action) => async (id, body = {}) =>
    authFetch(`/api/v1/bookings/${id}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    });

export const acceptStationBooking = stationBookingAction('accept');
export const rejectStationBooking = stationBookingAction('reject');
export const requestStationBookingChanges = stationBookingAction('request-changes');
export const scheduleStationBooking = stationBookingAction('schedule');
export const completeStationBooking = stationBookingAction('complete');
export const uploadStationBookingProof = (id, proofUrl) => stationBookingAction('proof')(id, { proofUrl });

// ── STATION PORTAL APIS (a station's own account) ──

export const getStationPortalSummary = async () => {
    return authFetch('/api/v1/station-portal/summary');
};

export const getMyStations = async () => {
    return authFetch('/api/v1/station-portal/stations');
};

// Only profile, rate and availability fields; name/type/approval are admin-only.
export const updateMyStation = async (id, data) => {
    return authFetch(`/api/v1/station-portal/stations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
};

// ── STATION RATE CARD (station desk) ──

export const setStationRateCard = async (id, rates) => {
    return authFetch(`/api/v1/station-portal/stations/${id}/rate-card`, {
        method: 'PUT',
        body: JSON.stringify({ rates }),
    });
};

// ── PLANS & SUBSCRIPTIONS ──

// Public: plans and the multi-station discount tiers.
export const getPlans = async () => authFetch('/api/v1/plans');

export const getMySubscription = async () => authFetch('/api/v1/subscriptions/me');

export const subscribeToPlan = async (planCode, interval) =>
    authFetch('/api/v1/subscriptions', { method: 'POST', body: JSON.stringify({ planCode, interval }) });

export const cancelMySubscription = async () =>
    authFetch('/api/v1/subscriptions/me/cancel', { method: 'POST' });

// ── DOCUMENTS (client cloud space) ──

export const getMyDocuments = async () => authFetch('/api/v1/documents');

// The file itself is the request body.
export const uploadDocument = async (file) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const response = await fetch(`${API_URL}/api/v1/documents`, {
        method: 'POST',
        headers: {
            'Content-Type': file.type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(file.name),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: file,
    });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) throw new ApiError(data?.message || 'Upload failed', response.status, data);
    return data;
};

// Downloads with the session token and hands the file to the browser.
export const downloadDocument = async (id, name) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const response = await fetch(`${API_URL}/api/v1/documents/${id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
        let data = null;
        try { data = await response.json(); } catch { data = null; }
        throw new ApiError(data?.message || 'Download failed', response.status, data);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const deleteDocument = async (id) => authFetch(`/api/v1/documents/${id}`, { method: 'DELETE' });

// ── NOTIFICATIONS ──

export const getNotifications = async () => authFetch('/api/v1/notifications');
export const markNotificationRead = async (id) => authFetch(`/api/v1/notifications/${id}/read`, { method: 'POST' });
export const markAllNotificationsRead = async () => authFetch('/api/v1/notifications/read-all', { method: 'POST' });
export const getNotificationPreferences = async () => authFetch('/api/v1/notifications/preferences');
export const updateNotificationPreferences = async (prefs) =>
    authFetch('/api/v1/notifications/preferences', { method: 'PUT', body: JSON.stringify(prefs) });

// ── SPEND INSIGHTS ──

export const getSpendInsights = async () => authFetch('/api/v1/insights/spend');

// ── ADMIN: SUBSCRIPTIONS & PLANS ──

export const getAdminSubscriptions = async () => authFetch('/api/v1/admin/subscriptions');
export const assignAdminSubscription = async (data) =>
    authFetch('/api/v1/admin/subscriptions', { method: 'POST', body: JSON.stringify(data) });
export const getAdminPlans = async () => authFetch('/api/v1/admin/plans');
export const updateAdminPlan = async (code, data) =>
    authFetch(`/api/v1/admin/plans/${code}`, { method: 'PUT', body: JSON.stringify(data) });

// ── STATION CALENDAR (station desk) ──

export const setStationAirtime = async (id, airtimeHours) => {
    return authFetch(`/api/v1/station-portal/stations/${id}/airtime`, {
        method: 'PUT',
        body: JSON.stringify({ airtimeHours }),
    });
};

// A 409 lists bookings inside the period; resend with cancelAffected: true
// to cancel them with a full refund.
export const addStationBlackout = async (id, data) => {
    return authFetch(`/api/v1/station-portal/stations/${id}/blackouts`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

export const removeStationBlackout = async (id, blackoutId) => {
    return authFetch(`/api/v1/station-portal/stations/${id}/blackouts/${blackoutId}`, {
        method: 'DELETE',
    });
};

// Public: weekly airtime and upcoming blocked dates of a station.
export const getStationAvailability = async (id) => {
    return authFetch(`/api/v1/stations/${id}/availability`);
};

// ── CANCELLATION (advertiser) ──

export const getBookingCancellationQuote = async (id) => {
    return authFetch(`/api/v1/bookings/${id}/cancellation-quote`);
};

export const getCampaignCancellationQuote = async (id) => {
    return authFetch(`/api/v1/campaigns/${id}/cancellation-quote`);
};

export const cancelCampaign = async (id) => {
    return authFetch(`/api/v1/campaigns/${id}/cancel`, {
        method: 'POST',
    });
};

// ── ADMIN: STATION MANAGERS ──

export const getStationManagers = async () => {
    return authFetch('/api/v1/admin/station-managers');
};

export const createStationManager = async (data) => {
    return authFetch('/api/v1/admin/station-managers', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

export const updateStationManager = async (id, data) => {
    return authFetch(`/api/v1/admin/station-managers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
};

// ── STATION APIS ──

// Get all stations
export const getStations = async () => {
    return authFetch('/api/v1/stations');
};

// Get station by type
export const getStationsByType = async (type) => {
    return authFetch(`/api/v1/stations/type/${type}`);
};

// ── ADMIN STATION APIS ──

// Get all stations
export const getAdminStations = async () => {
    return authFetch('/api/v1/admin/stations');
};

// Get single station
export const getAdminStation = async (id) => {
    return authFetch(`/api/v1/admin/stations/${id}`);
};

// Create station
export const createAdminStation = async (data) => {
    return authFetch('/api/v1/admin/stations', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

// Update station
export const updateAdminStation = async (id, data) => {
    return authFetch(`/api/v1/admin/stations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
};

// Approve station
export const approveAdminStation = async (id) => {
    return authFetch(
        `/api/v1/admin/stations/${id}/approve`,
        {
            method: 'PATCH',
        }
    );
};

// Reject station
export const rejectAdminStation = async (id) => {
    return authFetch(
        `/api/v1/admin/stations/${id}/reject`,
        {
            method: 'PATCH',
        }
    );
};

// Update station inventory status
export const updateAdminStationInventoryStatus = async (
    id,
    inventoryStatus
) => {
    return authFetch(
        `/api/v1/admin/stations/${id}/inventory-status`,
        {
            method: 'PATCH',
            body: JSON.stringify({
                inventoryStatus: String(inventoryStatus)
                    .trim()
                    .toUpperCase(),
            }),
        }
    );
};

// Activate station
export const activateAdminStation = async (id) => {
    return authFetch(
        `/api/v1/admin/stations/${id}/activate`,
        {
            method: 'PATCH',
        }
    );
};

// Deactivate station
export const deactivateAdminStation = async (id) => {
    return authFetch(
        `/api/v1/admin/stations/${id}/deactivate`,
        {
            method: 'PATCH',
        }
    );
};

// Delete station
export const deleteAdminStation = async (id) => {
    return authFetch(
        `/api/v1/admin/stations/${id}`,
        {
            method: 'DELETE',
        }
    );
};

// ── CREATIVE APIS ──

// Get creatives by campaign
export const getCreatives = async (campaignId) => {
    return authFetch(`/api/v1/creatives/campaign/${campaignId}`);
};

// Upload creative
export const uploadCreative = async (data) => {
    return authFetch('/api/v1/creatives', {
        method: 'POST',
        body: JSON.stringify(data),
    });
};

// Update creative (name / description only — status is changed only by
// the approve / reject endpoints)
export const updateCreative = async (id, { name, description }) => {
    return authFetch(`/api/v1/creatives/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description }),
    });
};

// Delete creative
export const deleteCreative = async (id) => {
    return authFetch(`/api/v1/creatives/${id}`, {
        method: 'DELETE',
    });
};

// Approve creative
export const approveCreative = async (id) => {
    return authFetch(`/api/v1/creatives/${id}/approve`, {
        method: 'PATCH',
    });
};

// Reject creative
export const rejectCreative = async (id) => {
    return authFetch(`/api/v1/creatives/${id}/reject`, {
        method: 'PATCH',
    });
};

export default {
    // ── COMPANY APIS ──
    getCompanyDashboard,
    getCompanySettings,
    updateCompanySettings,

    // ── TEAM APIS ──
    getTeamMembers,
    inviteTeamMember,
    removeTeamMember,
    updateTeamMemberRole,

    // ── CAMPAIGN APIS ──
    getCampaigns,
    getCampaign,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    updateCampaignStatus,

    // ── ADMIN COMPANY APIS ──
    getAdminCompanies,
    getAdminCompany,
    createAdminCompany,
    updateAdminCompany,
    updateAdminCompanyVerification,
    suspendAdminCompany,
    reactivateAdminCompany,

    // ── ADMIN COMPANY WORKER APIS ──
    getAdminCompanyWorkers,
    getAdminCompanyWorker,
    createAdminCompanyWorker,
    updateAdminCompanyWorker,
    activateAdminCompanyWorker,
    deactivateAdminCompanyWorker,
    reactivateAdminCompanyWorker,
    removeAdminCompanyWorker,

    // ── BOOKING APIS ──
    getBookings,
    getBooking,
    cancelBooking,

    // ── STATION APIS ──
    getStations,
    getStationsByType,

    // ── ADMIN STATION APIS ──
    getAdminStations,
    getAdminStation,
    createAdminStation,
    updateAdminStation,
    approveAdminStation,
    rejectAdminStation,
    updateAdminStationInventoryStatus,
    activateAdminStation,
    deactivateAdminStation,
    deleteAdminStation,

    // ── CREATIVE APIS ──
    getCreatives,
    uploadCreative,
    approveCreative,
    rejectCreative,

    // ── ADMIN INDIVIDUAL APIS ──
    getAdminIndividuals,
    getAdminIndividual,
    updateAdminIndividual,
    suspendAdminIndividual,
    activateAdminIndividual,
    reactivateAdminIndividual,
    resetAdminIndividual,
    deleteAdminIndividual,

    // ── ADMIN INDIVIDUAL CAMPAIGN APIS ──
    getAdminIndividualCampaigns,
    getAdminIndividualCampaign,
    createAdminIndividualCampaign,
    updateAdminIndividualCampaign,
    updateAdminIndividualCampaignStatus,
    deleteAdminIndividualCampaign,

    // ── ADMIN INDIVIDUAL BOOKING APIS ──
    getAdminIndividualBookings,

    // ── ADMIN INDIVIDUAL ACTIVITY APIS ──
    getAdminIndividualActivity,
};