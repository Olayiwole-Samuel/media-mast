"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

// ─────────────────────────────────────────────────────────────
// Session helpers (token + cached user in localStorage).
//
// Everything here is UX only: the backend decides what each account may
// actually do. Pages must still handle 401 / 403 responses.
// ─────────────────────────────────────────────────────────────

const AUTH_EVENT = "mm-auth-change";

export const ACCOUNT_HOME = {
    ADMIN: "/admin/dashboard",
    COMPANY: "/company/dashboard",
    EMPLOYEE: "/company/workspace",
    INDIVIDUAL: "/dashboard",
    STATION: "/station",
};

export const homeRouteFor = (user) =>
    ACCOUNT_HOME[user?.accountType] || "/login";

// A COMPANY account is the company owner. Employees (EMPLOYEE accounts) get
// access through their permissions, which the backend enforces.
export const isCompanyOwner = (user) => user?.accountType === "COMPANY";

export const saveSession = (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    window.dispatchEvent(new Event(AUTH_EVENT));
};

export const clearSession = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.dispatchEvent(new Event(AUTH_EVENT));
};

// Best-effort server logout (records the event), then clear locally.
export const signOut = async () => {
    const token = localStorage.getItem("token");
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

    if (token) {
        try {
            await fetch(`${API_URL}/api/v1/auth/logout`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
            });
        } catch {
            // Logging out locally must never depend on the network.
        }
    }

    clearSession();
    window.location.assign("/login");
};

// ── Reactive read of the stored session ──
const subscribe = (callback) => {
    window.addEventListener("storage", callback);
    window.addEventListener(AUTH_EVENT, callback);
    return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener(AUTH_EVENT, callback);
    };
};

// A string snapshot keeps useSyncExternalStore stable between renders.
const getSnapshot = () =>
    `${localStorage.getItem("token") ? "1" : "0"}|${localStorage.getItem("user") || ""}`;

// null on the server / during hydration = "not known yet"
const getServerSnapshot = () => null;

export function useSession() {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    return useMemo(() => {
        if (snapshot === null) return { ready: false, user: null, hasToken: false };

        const [tokenFlag, rawUser] = [snapshot[0], snapshot.slice(2)];
        let user = null;

        try {
            user = rawUser ? JSON.parse(rawUser) : null;
        } catch {
            user = null;
        }

        return { ready: true, user, hasToken: tokenFlag === "1" };
    }, [snapshot]);
}

// ── Route guard for a dashboard area ──
// Sends signed-out users to /login and other account types to their own home.
export function useAuthGuard(allowedAccountTypes) {
    const router = useRouter();
    const { ready, user, hasToken } = useSession();

    const signedIn = ready && hasToken && !!user;
    // An account whose password was set by an admin must replace it first.
    const mustChangePassword = signedIn && user.mustChangePassword === true;
    const allowed = signedIn && !mustChangePassword && allowedAccountTypes.includes(user.accountType);

    useEffect(() => {
        if (!ready) return;

        if (!signedIn) {
            clearSession();
            router.replace("/login");
            return;
        }

        if (mustChangePassword) {
            router.replace("/change-password");
            return;
        }

        if (!allowed) {
            router.replace(homeRouteFor(user));
        }
    }, [ready, signedIn, mustChangePassword, allowed, user, router]);

    return { ready, user, allowed };
}
