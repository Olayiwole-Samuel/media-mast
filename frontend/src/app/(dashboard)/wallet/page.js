"use client";

import { Suspense } from "react";
import WalletView from "@/components/wallet/WalletView";

export default function WalletPage() {
    return (
        <Suspense fallback={null}>
            <WalletView />
        </Suspense>
    );
}
