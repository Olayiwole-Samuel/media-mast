"use client";

import { useCallback, useEffect, useState } from "react";
import { getWallet } from "@/lib/api";
import { DATA_CHANGED, announceDataChanged } from "@/lib/events";

// The signed-in advertiser's wallet. Refreshes when anything announces a
// data change (a top-up, a checkout), so every open view shows one balance.
export function useWallet() {
    const [state, setState] = useState({ loading: true, error: null, data: null });

    const load = useCallback(async () => {
        try {
            const res = await getWallet();
            setState({ loading: false, error: null, data: res?.data || null });
        } catch (error) {
            setState((s) => ({ loading: false, error, data: s.data }));
        }
    }, []);

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener(DATA_CHANGED, onChange);
        return () => window.removeEventListener(DATA_CHANGED, onChange);
    }, [load]);

    const wallet = state.data?.wallet || null;
    return { ...state, wallet, balance: wallet ? wallet.balance : null, reload: load };
}

export const walletChanged = announceDataChanged;
