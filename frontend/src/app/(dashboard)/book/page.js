"use client";

import { Suspense } from "react";
import BookingPage from "@/components/bookings/BookingPage";

export default function BookPage() {
    return (
        <Suspense fallback={null}>
            <BookingPage />
        </Suspense>
    );
}
