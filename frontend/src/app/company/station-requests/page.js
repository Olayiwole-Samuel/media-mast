"use client";

// Transition: companies an admin linked to a station before station accounts
// existed. New stations use their own account and the /station dashboard.
import StationRequests from "@/components/station/StationRequests";

export default function CompanyStationRequestsPage() {
    return <StationRequests />;
}
