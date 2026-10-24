"use client";

import {
    Search,
    CalendarDays,
    Upload,
    BarChart3,
} from "lucide-react";

import BookingStep from "./BookingStep";
import { bookingSteps } from "./data/bookingSteps";

const icons = [
    <Search key="search" className="h-7 w-7" />,
    <CalendarDays key="calendar" className="h-7 w-7" />,
    <Upload key="upload" className="h-7 w-7" />,
    <BarChart3 key="chart" className="h-7 w-7" />,
];

export default function BookingTimeline() {
    return (
        <div className="relative mt-20 sm:mt-28">
            {/* Horizontal Timeline Bar (Visible on LG screens & up) */}
            

            {/* Step Grid / Row */}
            <div
                className="
                    relative z-10 grid grid-cols-1 justify-items-center gap-8 sm:grid-cols-2
                    lg:flex lg:items-start lg:justify-between lg:gap-6
                "
            >
                {bookingSteps.map((step, index) => (
                    <BookingStep
                        key={step.id}
                        number={step.number}
                        title={step.title}
                        description={step.description}
                        icon={icons[index]}
                    />
                ))}
            </div>
        </div>
    );
}