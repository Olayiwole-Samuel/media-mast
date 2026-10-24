"use client";

import { useEffect, useState } from "react";
import { getPlans, getMySubscription } from "@/lib/api";

// The checkout discount the cart can expect: the multi-station tiers (from
// the server's plans endpoint) plus the advertiser's plan discount. The
// server works it out again at checkout; this is only the estimate.

const DEFAULT_TIERS = [
    { minStations: 3, percent: 5 },
    { minStations: 5, percent: 10 },
];
const MAX_PERCENT = 30;

export const discountPercentFor = (stationCount, { tiers = DEFAULT_TIERS, planPercent = 0 } = {}) => {
    const multi = tiers.reduce((best, t) => (stationCount >= t.minStations ? Math.max(best, t.percent) : best), 0);
    return { percent: Math.min(MAX_PERCENT, Math.round((multi + (Number(planPercent) || 0)) * 100) / 100), multi, plan: Number(planPercent) || 0 };
};

export function useCheckoutDiscount() {
    const [state, setState] = useState({ tiers: DEFAULT_TIERS, planPercent: 0, planName: null, hasPlan: null, required: true });

    useEffect(() => {
        let live = true;
        Promise.all([getPlans().catch(() => null), getMySubscription().catch(() => null)]).then(([plans, mine]) => {
            if (!live) return;
            setState({
                tiers: plans?.data?.discountTiers || DEFAULT_TIERS,
                planPercent: Number(mine?.data?.plan?.discountPercent) || 0,
                planName: mine?.data?.plan?.name || null,
                hasPlan: mine ? !!mine.data?.subscription : null,
                required: plans?.data?.subscriptionRequired !== false,
            });
        });
        return () => { live = false; };
    }, []);

    return state;
}
