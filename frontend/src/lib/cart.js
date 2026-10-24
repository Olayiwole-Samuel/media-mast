"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useSession } from "@/lib/auth";

// ─────────────────────────────────────────────────────────────
// Booking cart (kept on this device, per signed-in user).
//
// An item is one spot on one station for one campaign. The price stored
// here is only what the station catalogue showed; the server prices every
// item again at checkout and that total is what is charged.
// ─────────────────────────────────────────────────────────────

export const MAX_CART_ITEMS = 20; // same limit as the checkout endpoint

const newId = () =>
    (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const useCartStore = create(
    persist(
        (set) => ({
            byUser: {},

            addItem: (userId, item) =>
                set((state) => {
                    const items = state.byUser[userId] || [];
                    return { byUser: { ...state.byUser, [userId]: [...items, { ...item, id: newId() }] } };
                }),

            removeItem: (userId, id) =>
                set((state) => ({
                    byUser: { ...state.byUser, [userId]: (state.byUser[userId] || []).filter((i) => i.id !== id) },
                })),

            // After a successful checkout: drop that campaign's items only.
            clearCampaign: (userId, campaignId) =>
                set((state) => ({
                    byUser: {
                        ...state.byUser,
                        [userId]: (state.byUser[userId] || []).filter((i) => i.campaignId !== campaignId),
                    },
                })),
        }),
        {
            name: "mm-cart",
            storage: createJSONStorage(() => localStorage),
            version: 1,
        }
    )
);

const EMPTY = [];

export function useCart() {
    const { user } = useSession();
    const userId = user?._id || user?.id || null;
    const items = useCartStore((s) => (userId ? s.byUser[userId] || EMPTY : EMPTY));
    const addItem = useCartStore((s) => s.addItem);
    const removeItem = useCartStore((s) => s.removeItem);
    const clearCampaign = useCartStore((s) => s.clearCampaign);

    return useMemo(() => ({
        userId,
        items,
        count: items.length,
        isFull: items.length >= MAX_CART_ITEMS,
        addItem: (item) => userId && addItem(userId, item),
        removeItem: (id) => userId && removeItem(userId, id),
        clearCampaign: (campaignId) => userId && clearCampaign(userId, campaignId),
    }), [userId, items, addItem, removeItem, clearCampaign]);
}

// Items grouped by campaign (one checkout = one campaign).
export const groupByCampaign = (items) => {
    const groups = new Map();
    for (const item of items) {
        if (!groups.has(item.campaignId)) {
            groups.set(item.campaignId, { campaignId: item.campaignId, campaignName: item.campaignName, items: [] });
        }
        groups.get(item.campaignId).items.push(item);
    }
    return [...groups.values()];
};

// Where this account's advertiser pages live.
export const advertiserPaths = (user) => {
    const base = user?.accountType === "INDIVIDUAL" ? "" : "/company";
    return {
        stations: `${base}/stations`,
        campaigns: `${base}/campaigns`,
        bookings: `${base}/bookings`,
        cart: `${base}/cart`,
        checkout: `${base}/checkout`,
        confirmation: `${base}/confirmation`,
        subscription: `${base}/subscription`,
        documents: `${base}/documents`,
        insights: `${base}/insights`,
    };
};
