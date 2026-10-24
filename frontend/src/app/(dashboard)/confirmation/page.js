"use client";

import { Suspense } from "react";
import ConfirmationView from "@/components/cart/ConfirmationView";
import { PageLoading } from "@/components/common/PageState";

export default function ConfirmationPage() {
    return (
        <Suspense fallback={<PageLoading label="Loading your confirmation…" />}>
            <ConfirmationView />
        </Suspense>
    );
}
