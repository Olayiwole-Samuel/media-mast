"use client";

import { useEffect, useState } from "react";
import { startSupportSession, homeRouteFor } from "@/lib/auth";

// Opened by an admin in a new tab: stores the read-only session for this tab
// only (the admin stays signed in everywhere else) and opens their home page.
export default function SupportViewPage() {
    const [error, setError] = useState("");
    useEffect(() => {
        try {
            const raw = decodeURIComponent(window.location.hash.slice(1));
            const { token, user } = JSON.parse(atob(raw));
            if (!token || !user) throw new Error("missing");
            startSupportSession(token, user);
            window.history.replaceState(null, "", "/support-view");
            window.location.replace(homeRouteFor({ ...user, status: user.status === "PENDING" ? "PENDING" : "ACTIVE" }));
        } catch {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setError("This support link is not valid. Open it again from Admin → Support view.");
        }
    }, []);
    return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-slate-600">{error || "Opening the support view…"}</div>;
}
