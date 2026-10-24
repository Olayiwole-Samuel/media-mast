"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Radio, Tv, Newspaper, Monitor, Image as BillboardIcon, Search, MapPin, Star, Users } from "lucide-react";
import { getStations } from "@/lib/api";
import { formatMoney, stationInventoryStatus } from "@/lib/status";
import { PageLoading, ApiErrorState, EmptyState } from "@/components/common/PageState";

// Real public station catalogue (GET /api/v1/stations: approved + active
// stations, public fields only). Prices come from the station; they are
// shown for information and are always set by the server on booking.

const TYPES = [
    { value: "ALL", label: "All media" },
    { value: "TV", label: "TV" },
    { value: "RADIO", label: "Radio" },
    { value: "PRESS", label: "Press" },
    { value: "BILLBOARD", label: "Billboards" },
    { value: "DIGITAL", label: "Digital" },
];

const UNIT_LABEL = {
    DAY: "per day",
    WEEK: "per week",
    MONTH: "per month",
    CAMPAIGN: "per campaign",
    SPOT: "per spot",
    IMPRESSION: "per impression",
    CUSTOM: "",
};

function TypeIcon({ type, className }) {
    switch (type) {
        case "TV":
            return <Tv className={className} />;
        case "PRESS":
            return <Newspaper className={className} />;
        case "BILLBOARD":
            return <BillboardIcon className={className} />;
        case "DIGITAL":
            return <Monitor className={className} />;
        default:
            return <Radio className={className} />;
    }
}

function StationCard({ station, onRequestBooking }) {
    const inventory = stationInventoryStatus(station.inventoryStatus);
    const place = [station.location?.city, station.location?.state].filter(Boolean).join(", ");
    const hasPrice = Number(station.pricing?.amount) > 0;
    const image = station.coverImage || station.logo;

    return (
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
            <div className="relative flex h-32 items-center justify-center bg-gradient-to-br from-emerald-500/10 to-slate-100 dark:from-emerald-500/10 dark:to-slate-800">
                {image ? (
                    // Station images are external URLs entered by admins.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt={station.name} className="h-full w-full object-cover" />
                ) : (
                    <TypeIcon type={station.type} className="h-10 w-10 text-emerald-500/70" />
                )}
                <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-medium ${inventory.className}`}>
                    {inventory.label}
                </span>
            </div>

            <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">{station.name}</h3>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <TypeIcon type={station.type} className="h-3.5 w-3.5" />
                            {TYPES.find((t) => t.value === station.type)?.label || station.type}
                            {place && (
                                <>
                                    <span className="mx-1">·</span>
                                    <MapPin className="h-3.5 w-3.5" />
                                    <span className="truncate">{place}</span>
                                </>
                            )}
                        </p>
                    </div>
                    {Number(station.rating) > 0 && (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                            <Star className="h-3.5 w-3.5 fill-current" />
                            {Number(station.rating).toFixed(1)}
                        </span>
                    )}
                </div>

                {station.description && (
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{station.description}</p>
                )}

                {station.reach && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <Users className="h-3.5 w-3.5" />
                        Reach: {station.reach}
                    </p>
                )}

                {Array.isArray(station.features) && station.features.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {station.features.slice(0, 3).map((feature) => (
                            <span key={feature} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {feature}
                            </span>
                        ))}
                    </div>
                )}

                <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                    <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">Station price</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            {hasPrice ? (
                                <>
                                    {formatMoney(station.pricing.amount, station.pricing.currency)}{" "}
                                    <span className="font-normal text-slate-500">{UNIT_LABEL[station.pricing.unit] || ""}</span>
                                </>
                            ) : (
                                <span className="font-normal text-slate-500">Price not listed yet</span>
                            )}
                        </p>
                    </div>

                    {onRequestBooking && (
                        <button
                            type="button"
                            onClick={() => onRequestBooking(station)}
                            disabled={!hasPrice}
                            title={hasPrice ? undefined : "This station has not set a price yet"}
                            className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Add to cart
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function StationCatalogue({ onRequestBooking, note }) {
    const [stations, setStations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [type, setType] = useState("ALL");
    const [query, setQuery] = useState("");
    const [region, setRegion] = useState("ALL");

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getStations();
            setStations(Array.isArray(result?.data) ? result.data : []);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Fetch on mount; state updates happen after the await.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    const regions = useMemo(
        () => [...new Set(stations.map((s) => s.location?.state).filter(Boolean))].sort(),
        [stations]
    );

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return stations.filter((s) => {
            if (type !== "ALL" && s.type !== type) return false;
            if (region !== "ALL" && s.location?.state !== region) return false;
            if (!q) return true;
            return [s.name, s.location?.city, s.location?.state, s.description]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q));
        });
    }, [stations, type, region, query]);

    if (loading) return <PageLoading label="Loading stations…" />;
    if (error) return <ApiErrorState error={error} what="stations" onRetry={load} />;

    return (
        <div className="space-y-5">
            {note && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {note}
                </div>
            )}

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                    {TYPES.map((t) => (
                        <button
                            key={t.value}
                            type="button"
                            onClick={() => setType(t.value)}
                            className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                type === t.value
                                    ? "bg-emerald-500 text-white"
                                    : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <div className="flex flex-1 flex-col gap-3 sm:flex-row lg:justify-end">
                    <label className="relative block sm:w-64">
                        <span className="sr-only">Search stations</span>
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search by name or city"
                            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                    </label>

                    {regions.length > 0 && (
                        <select
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            aria-label="Filter by state"
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            <option value="ALL">All states</option>
                            {regions.map((r) => (
                                <option key={r} value={r}>
                                    {r}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {stations.length === 0 ? (
                <EmptyState
                    icon={Radio}
                    title="No stations available yet"
                    message="Stations appear here once they have been approved by the Media Masters team."
                />
            ) : visible.length === 0 ? (
                <EmptyState icon={Search} title="No stations match your search" message="Try a different media type, state or search term." />
            ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                    {visible.map((station) => (
                        <StationCard key={station._id} station={station} onRequestBooking={onRequestBooking} />
                    ))}
                </div>
            )}
        </div>
    );
}
