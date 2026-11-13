"use client";

import { Suspense } from "react";
import BookingPage from "@/components/bookings/BookingPage";

export default function CompanyBookPage() {
    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <Suspense fallback={null}>
                <BookingPage />
            </Suspense>
        </div>
    );
}
