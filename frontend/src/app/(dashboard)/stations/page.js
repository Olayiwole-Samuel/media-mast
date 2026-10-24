"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Radio } from "lucide-react";
import StationCatalogue from "@/components/stations/StationCatalogue";
import BookingRequestModal from "@/components/bookings/BookingRequestModal";

// Individuals browse the station catalogue and add spots to their cart.
export default function StationsPage() {
    const [station, setStation] = useState(null);

    return (
        <div>
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <Radio className="h-6 w-6 text-emerald-500" />
                    Stations
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Browse TV, radio, press, billboard and digital media across Nigeria, add the spots you want, and pay once.
                </p>
            </motion.div>

            <StationCatalogue onRequestBooking={setStation} />

            <BookingRequestModal open={!!station} station={station} onClose={() => setStation(null)} />
        </div>
    );
}
