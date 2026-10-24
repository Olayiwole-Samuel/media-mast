"use client";

import { useRef } from "react";
import BookingHeader from "./BookingHeader";
import BookingTimeline from "./BookingTimeline";
import useBookingAnimation from "./hooks/useBookingAnimation";

export default function BookingProcess() {
    const sectionRef = useRef(null);

    useBookingAnimation(sectionRef);

    return (
        <section
            ref={sectionRef}
            id="booking-process"
            className="
                relative overflow-hidden
                bg-white px-6 py-28 sm:py-36
                lg:px-12 xl:px-20
            "
        >
            {/* Light ambient backdrop blur */}
            <div className="pointer-events-none absolute left-1/2 top-0 h-[380px] w-[650px] -translate-x-1/2 rounded-full bg-emerald-50/70 blur-[100px]" />

            <div className="relative z-10 mx-auto max-w-7xl space-y-16 sm:space-y-24">
                <BookingHeader />
                <BookingTimeline />
            </div>
        </section>
    );
}