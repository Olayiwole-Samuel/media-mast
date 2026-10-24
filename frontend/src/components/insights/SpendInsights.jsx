"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, ExternalLink } from "lucide-react";
import { getSpendInsights } from "@/lib/api";
import { formatMoney } from "@/lib/status";
import { PageLoading, ApiErrorState } from "@/components/common/PageState";

// Industry spend estimates (published figures, each with its source) next to
// real spend on Media Masters by channel, station and state.

const TYPE_LABEL = { RADIO: "Radio", TV: "TV", PRESS: "Press", BILLBOARD: "Billboard", DIGITAL: "Digital" };
const fmtUsd = (amount, unit) => (unit === "USD billion" ? `US$${amount}bn` : unit === "USD million" ? `US$${amount}m` : unit === "NGN billion" ? `₦${amount}bn` : `${amount} ${unit}`);

function Bars({ rows, value, label, format }) {
    const max = Math.max(...rows.map(value), 1);
    return (
        <ul className="space-y-3">
            {rows.map((row) => (
                <li key={label(row)}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{label(row)}</span>
                        <span className="tabular-nums text-slate-600 dark:text-slate-300">{format(row)}</span>
                    </div>
                    <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(value(row) / max) * 100}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}

export default function SpendInsights() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await getSpendInsights();
            setData(res?.data || null);
        } catch (err) {
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        load();
    }, [load]);

    if (loading) return <PageLoading label="Loading spend insights…" />;
    if (error) return <ApiErrorState error={error} what="spend insights" onRetry={load} />;

    const industry = data?.industry;
    const platform = data?.platform;
    const card = "rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900";

    return (
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
                    <TrendingUp className="h-6 w-6 text-emerald-500" /> Spend insights
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">How Nigerian advertisers spend by channel, and what is being booked on Media Masters.</p>
            </motion.div>

            {industry && (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {industry.totals.map((t) => (
                            <div key={t.label} className={card}>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{t.label} · {t.year}</p>
                                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{fmtUsd(t.amount, t.unit)}</p>
                                {t.note && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.note}</p>}
                                <a href={t.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline dark:text-emerald-400">
                                    {t.source} <ExternalLink className="h-3 w-3" />
                                </a>
                            </div>
                        ))}
                    </div>

                    <div className={card}>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Industry ad spend by channel</h2>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Published estimates in US dollars; each bar shows its year. Sources below.</p>
                        <div className="mt-5">
                            <Bars
                                rows={industry.byMedium}
                                value={(m) => m.amount}
                                label={(m) => m.label}
                                format={(m) => `${fmtUsd(m.amount, m.unit)} (${m.year})`}
                            />
                        </div>
                        <ul className="mt-5 space-y-1 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                            {industry.byMedium.map((m) => (
                                <li key={m.medium}>
                                    {m.label}: <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline dark:text-emerald-400">{m.source}</a>{m.note ? ` — ${m.note}` : ""}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className={card}>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Marketing communications share, {industry.marketingShare.period}</h2>
                        <div className="mt-5">
                            <Bars rows={industry.marketingShare.shares} value={(s) => s.percent} label={(s) => s.label} format={(s) => `${s.percent}%`} />
                        </div>
                        <a href={industry.marketingShare.url} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline dark:text-emerald-400">
                            {industry.marketingShare.source} <ExternalLink className="h-3 w-3" />
                        </a>
                    </div>
                </>
            )}

            {platform && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div className={card}>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">On Media Masters: spend by channel</h2>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {formatMoney(platform.total, platform.currency)} across {platform.bookings} paid booking{platform.bookings === 1 ? "" : "s"}, all advertisers.
                        </p>
                        <div className="mt-5">
                            {platform.byChannel.length ? (
                                <Bars rows={platform.byChannel} value={(c) => c.amount} label={(c) => TYPE_LABEL[c.type] || c.type} format={(c) => `${formatMoney(c.amount, platform.currency)} · ${c.bookings}`} />
                            ) : <p className="text-sm text-slate-500 dark:text-slate-400">No paid bookings yet.</p>}
                        </div>
                    </div>
                    <div className={card}>
                        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Top stations by booked value</h2>
                        <div className="mt-5">
                            {platform.topStations.length ? (
                                <Bars rows={platform.topStations} value={(s) => s.amount} label={(s) => `${s.name}${s.state ? ` · ${s.state}` : ""}`} format={(s) => formatMoney(s.amount, platform.currency)} />
                            ) : <p className="text-sm text-slate-500 dark:text-slate-400">No paid bookings yet.</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
