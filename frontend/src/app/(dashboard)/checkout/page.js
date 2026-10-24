"use client";

import { Suspense } from "react";
import CheckoutView from "@/components/cart/CheckoutView";
import { PageLoading } from "@/components/common/PageState";

export default function CheckoutPage() {
    return (
        <Suspense fallback={<PageLoading label="Loading checkout…" />}>
            <CheckoutView />
        </Suspense>
    );
}
