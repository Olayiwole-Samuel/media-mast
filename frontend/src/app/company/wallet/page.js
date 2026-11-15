"use client";

import { Suspense } from "react";
import WalletView from "@/components/wallet/WalletView";

export default function CompanyWalletPage() {
    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <Suspense fallback={null}>
                <WalletView />
            </Suspense>
        </div>
    );
}
