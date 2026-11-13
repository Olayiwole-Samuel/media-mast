"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Radio } from "lucide-react";
import StationCatalogue from "@/components/stations/StationCatalogue";
import { useSession } from "@/lib/auth";
import { advertiserPaths } from "@/lib/cart";

export default function CompanyStationsPage() {
    const router = useRouter();
    const { user } = useSession();
    const paths = advertiserPaths(user);
    const book = (station) => router.push(`${paths.book}?station=${encodeURIComponent(station._id)}`);

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <Radio className="h-6 w-6 text-emerald-500" />
                    Stations
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Find a station and send it a booking request for one of your campaigns.
                </p>
            </motion.div>

            <StationCatalogue onRequestBooking={book} />
        </div>
    );
}
