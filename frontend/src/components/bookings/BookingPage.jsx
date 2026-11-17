"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    Loader2, ShieldCheck, Search, Tv, Radio, Newspaper, Monitor, Image as BillboardIcon,
    ChevronDown, ChevronUp, CalendarDays, AlertTriangle, MapPin, Wallet as WalletIcon, Trash2, CheckCircle2, ListChecks,
} from "lucide-react";
import { getCampaigns, getStations, getCreatives, quoteMediaPlan, checkoutMediaPlan } from "@/lib/api";
import { formatMoney } from "@/lib/status";
import { useSession } from "@/lib/auth";
import { advertiserPaths } from "@/lib/cart";
import { useWallet, walletChanged } from "@/lib/wallet";
import { daysLabel, groupRates, cardLengths, groupWhen, programmeKey } from "@/lib/rates";

// ─────────────────────────────────────────────────────────────
// Book airtime = build a media plan for the campaign's whole period.
//
//   1. Campaign (its start and end dates) and the advert.
//   2. Tick slots on as many media houses as you like (rate card grids).
//   3. For each line: the days it airs (e.g. Thursdays) and spots per day,
//      across the campaign, or a shorter range inside it.
//   4. The plan is priced like an agency plan: rate card − volume discount −
//      15% agency commission (agencies) = net + 7.5% VAT; the whole plan is
//      held in the wallet and each media house is paid as its spots air.
// ─────────────────────────────────────────────────────────────

const CLOSED_CAMPAIGN = ["CANCELLED", "COMPLETED", "EXPIRED", "REFUNDED", "FAILED", "REJECTED"];
const TYPES = [
    { value: "ALL", label: "All media" },
    { value: "TV", label: "TV" },
    { value: "RADIO", label: "Radio" },
    { value: "PRESS", label: "Press" },
    { value: "BILLBOARD", label: "Billboards" },
    { value: "DIGITAL", label: "Digital" },
];
const DAY_CHIPS = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");
const prettyDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const isBookableAdvert = (c) => c.status === "APPROVED" && c.fileId && c.arcon?.fileId;
const activeRates = (s) => (s.rateCard || []).filter((r) => r && r.isActive !== false && Number(r.price) > 0);
const selectClass = "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
const smallInput = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white";

function TypeIcon({ type, className }) {
    if (type === "TV") return <Tv className={className} />;
    if (type === "PRESS") return <Newspaper className={className} />;
    if (type === "BILLBOARD") return <BillboardIcon className={className} />;
    if (type === "DIGITAL") return <Monitor className={className} />;
    return <Radio className={className} />;
}

// One media house: its rate card as tick boxes (a tick adds a plan line).
function StationRates({ station, lines, onToggle, open, onOpenChange, advertSeconds }) {
    const rates = activeRates(station);
    const groups = groupRates(rates);
    const lengths = cardLengths(rates);
    const singles = groups.some((g) => g.options.some((o) => !o.spotSeconds));
    const currency = station.pricing?.currency || "NGN";
    const fromPrice = rates.length ? Math.min(...rates.map((r) => Number(r.price))) : null;
    const place = [station.location?.city, station.location?.state].filter(Boolean).join(", ");
    const mine = lines.filter((l) => l.stationId === station._id);
    const pickedRate = new Set(mine.map((l) => l.rateId));
    const pickedProgramme = new Map(mine.map((l) => [l.programme, l.rateId]));

    const cell = (rate) => {
        if (!rate) return <span className="text-slate-300 dark:text-slate-600">—</span>;
        const checked = pickedRate.has(rate._id);
        const other = !checked && pickedProgramme.has(programmeKey(rate));
        return (
            <label title={other ? "One spot length per programme: untick the other length first" : undefined}
                className={`inline-flex min-w-[6.5rem] cursor-pointer items-center justify-end gap-2 rounded-lg border px-2 py-1.5 transition-colors ${other ? "cursor-not-allowed border-transparent opacity-40" : checked ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10" : "border-slate-200 hover:border-emerald-300 dark:border-slate-700"}`}>
                <span className={`text-xs font-medium ${checked ? "text-emerald-800 dark:text-emerald-200" : "text-slate-700 dark:text-slate-200"}`}>{other ? "—" : formatMoney(rate.price, currency)}</span>
                <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={checked} disabled={other} onChange={() => onToggle(station, rate)} />
            </label>
        );
    };

    return (
        <div className={`overflow-hidden rounded-2xl border bg-white dark:bg-slate-900 ${mine.length ? "border-emerald-400 dark:border-emerald-500/60" : "border-slate-200 dark:border-slate-800"}`}>
            <button type="button" onClick={() => onOpenChange(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" aria-expanded={open}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-500/10">
                    {station.logo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={station.logo} alt="" className="h-full w-full object-cover" />
                        : <TypeIcon type={station.type} className="h-5 w-5 text-emerald-600" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900 dark:text-white">{station.name}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                        {station.type}{place ? ` · ${place}` : ""} · {groups.length} slot{groups.length === 1 ? "" : "s"}
                        {lengths.length ? ` · ${lengths.map((l) => `${l}s`).join("/")}` : ""}
                        {fromPrice != null ? ` · from ${formatMoney(fromPrice, currency)}` : ""}
                    </span>
                </span>
                {mine.length > 0 && <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-semibold text-white">{mine.length} in plan</span>}
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {open ? <>Hide rates <ChevronUp className="h-4 w-4" /></> : <>See rates <ChevronDown className="h-4 w-4" /></>}
                </span>
            </button>
            {open && (
                <div className="border-t border-slate-100 dark:border-slate-800">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[560px] text-left text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                                <tr>
                                    <th className="px-4 py-2 font-medium">{station.type === "PRESS" ? "Placement" : "Belt / programme"}</th>
                                    <th className="px-3 py-2 font-medium">When</th>
                                    {lengths.map((l) => (
                                        <th key={l} className={`px-3 py-2 text-right font-medium ${advertSeconds && l === advertSeconds ? "text-emerald-700 dark:text-emerald-300" : ""}`}>{l}s{advertSeconds && l === advertSeconds ? " · your advert" : ""}</th>
                                    ))}
                                    {(singles || !lengths.length) && <th className="px-3 py-2 text-right font-medium">{station.type === "PRESS" ? "Per insertion" : "Price"}</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {groups.map((g) => {
                                    const days = daysLabel(g.days);
                                    return (
                                        <tr key={g.key}>
                                            <td className="px-4 py-2 text-slate-800 dark:text-slate-100">{g.name}</td>
                                            <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{groupWhen(g)}{days ? ` · ${days} only` : ""}</td>
                                            {lengths.map((l) => <td key={l} className="px-3 py-1.5 text-right">{cell(g.options.find((o) => o.spotSeconds === l))}</td>)}
                                            {(singles || !lengths.length) && <td className="px-3 py-1.5 text-right">{cell(g.options.find((o) => !o.spotSeconds))}</td>}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="px-4 py-2 text-xs text-slate-400">Rate card prices per {station.type === "PRESS" ? "insertion" : "spot"}. Tick a slot to add it to your plan, then choose its days below.</p>
                </div>
            )}
        </div>
    );
}

// One plan line: days it airs, spots per day, optional date range; its price from the quote.
function PlanLine({ line, quote, error, campaignStart, campaignEnd, onChange, onRemove }) {
    const soldDays = line.rateDays?.length ? new Set(line.rateDays) : null;
    const toggleDay = (d) => onChange({ days: line.days.includes(d) ? line.days.filter((x) => x !== d) : [...line.days, d] });
    return (
        <li className={`rounded-xl border p-3 ${error ? "border-red-300 dark:border-red-500/40" : "border-slate-200 dark:border-slate-800"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">{line.stationName} · {line.rateName}{line.spotSeconds ? ` · ${line.spotSeconds}s` : ""}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{line.when}{soldDays ? ` · sold ${daysLabel(line.rateDays)} only` : ""}</p>
                </div>
                <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {DAY_CHIPS.map(([d, label]) => {
                    const off = soldDays && !soldDays.has(d);
                    const on = line.days.includes(d);
                    return (
                        <button key={d} type="button" disabled={off} onClick={() => toggleDay(d)}
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${off ? "cursor-not-allowed bg-slate-50 text-slate-300 dark:bg-slate-800 dark:text-slate-600" : on ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                            {label}
                        </button>
                    );
                })}
                <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <input type="number" min={1} max={20} value={line.spotsPerDay} onChange={(e) => onChange({ spotsPerDay: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} className={`${smallInput} w-16`} />
                    spot{line.spotsPerDay === 1 ? "" : "s"} a day
                </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span>From</span>
                <input type="date" value={line.startDate || ""} min={campaignStart} max={campaignEnd} onChange={(e) => onChange({ startDate: e.target.value })} className={smallInput} />
                <span>to</span>
                <input type="date" value={line.endDate || ""} min={campaignStart} max={campaignEnd} onChange={(e) => onChange({ endDate: e.target.value })} className={smallInput} />
                {(line.startDate || line.endDate) && <button type="button" onClick={() => onChange({ startDate: "", endDate: "" })} className="text-emerald-600 hover:underline">whole campaign</button>}
            </div>
            {error ? (
                <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
            ) : quote ? (
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                    <span className="font-semibold text-slate-900 dark:text-white">{quote.spots} spots</span> ({quote.airingDays} day{quote.airingDays === 1 ? "" : "s"}, {prettyDate(quote.firstDate)} to {prettyDate(quote.lastDate)})
                    {" · "}{formatMoney(quote.unit.gross)} − {quote.unit.volumeDiscountPercent}% vol.{quote.unit.agencyCommissionPercent ? ` − ${quote.unit.agencyCommissionPercent}% agency` : ""} = <span className="font-semibold">{formatMoney(quote.unit.net)}</span> net + VAT
                    {" · "}<span className="font-semibold text-slate-900 dark:text-white">{formatMoney(quote.totals.total)}</span>
                    {quote.skippedCount > 0 && <span className="block text-amber-700 dark:text-amber-300">{quote.skippedCount} date{quote.skippedCount === 1 ? "" : "s"} skipped (media house unavailable).</span>}
                </div>
            ) : null}
        </li>
    );
}

export default function BookingPage() {
    const params = useSearchParams();
    const { user } = useSession();
    const paths = advertiserPaths(user);
    const { balance } = useWallet();

    const [campaigns, setCampaigns] = useState(null);
    const [stations, setStations] = useState([]);
    const [loadError, setLoadError] = useState("");
    const [campaignId, setCampaignId] = useState(params.get("campaign") || "");
    const [creatives, setCreatives] = useState(null);
    const [creativeId, setCreativeId] = useState("");
    const [lines, setLines] = useState([]);
    const [openIds, setOpenIds] = useState(() => new Set(params.get("station") ? [params.get("station")] : []));
    const [type, setType] = useState("ALL");
    const [region, setRegion] = useState("ALL");
    const [query, setQuery] = useState("");
    const [onlyPicked, setOnlyPicked] = useState(false);
    const [quote, setQuote] = useState(null);
    const [quoting, setQuoting] = useState(false);
    const [error, setError] = useState("");
    const [booking, setBooking] = useState(false);
    const [done, setDone] = useState(null);

    useEffect(() => {
        let live = true;
        Promise.all([getCampaigns(), getStations()])
            .then(([c, s]) => {
                if (!live) return;
                setCampaigns((c?.data || []).filter((x) => !CLOSED_CAMPAIGN.includes(x.status)));
                setStations((s?.data || []).filter((x) => activeRates(x).length > 0));
            })
            .catch((err) => live && setLoadError(err?.status === 403 ? "You don't have permission to book for this account." : err?.message || "We couldn't load your campaigns and the media houses."));
        return () => { live = false; };
    }, []);

    const campaign = useMemo(() => (campaigns || []).find((c) => c._id === campaignId) || null, [campaigns, campaignId]);
    const start = dateOnly(campaign?.startDate);
    const end = dateOnly(campaign?.endDate) || start;
    const today = new Date().toISOString().slice(0, 10);
    const ended = !!end && end < today;

    useEffect(() => {
        if (!campaignId) return undefined;
        let live = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCreatives(null);
        setCreativeId("");
        setDone(null);
        getCreatives(campaignId)
            .then((r) => {
                if (!live) return;
                const list = r?.data || [];
                setCreatives(list);
                const ready = list.filter(isBookableAdvert);
                if (ready.length === 1) setCreativeId(ready[0]._id);
            })
            .catch(() => live && setCreatives([]));
        return () => { live = false; };
    }, [campaignId]);

    const creative = (creatives || []).find((c) => c._id === creativeId && isBookableAdvert(c)) || null;
    const readyAdverts = (creatives || []).filter(isBookableAdvert);
    const notReady = (creatives || []).filter((c) => !isBookableAdvert(c));
    const ready = !!campaign && !!start && !ended;

    // Live price from the server (same rules as checkout).
    const payload = useMemo(() => (campaign && lines.length ? {
        campaignId: campaign._id,
        creativeId: creativeId || undefined,
        lines: lines.map((l) => ({ stationId: l.stationId, rateId: l.rateId, days: l.days, spotsPerDay: l.spotsPerDay, startDate: l.startDate || undefined, endDate: l.endDate || undefined })),
    } : null), [campaign, lines, creativeId]);
    const seq = useRef(0);
    useEffect(() => {
        if (!payload) { setQuote(null); return undefined; } // eslint-disable-line react-hooks/set-state-in-effect
        const my = ++seq.current;
        setQuoting(true);
        const t = setTimeout(() => {
            quoteMediaPlan(payload)
                .then((r) => { if (my === seq.current) setQuote(r?.data || null); })
                .catch((err) => { if (my === seq.current) { setQuote(null); setError(err?.message || "We couldn't price the plan."); } })
                .finally(() => { if (my === seq.current) setQuoting(false); });
        }, 400);
        return () => clearTimeout(t);
    }, [payload]);

    const regions = useMemo(() => [...new Set(stations.map((s) => s.location?.state).filter(Boolean))].sort(), [stations]);
    const pickedStations = useMemo(() => new Set(lines.map((l) => l.stationId)), [lines]);
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return stations.filter((s) =>
            (type === "ALL" || s.type === type)
            && (region === "ALL" || s.location?.state === region)
            && (!onlyPicked || pickedStations.has(s._id))
            && (!q || [s.name, s.location?.city, s.location?.state].filter(Boolean).join(" ").toLowerCase().includes(q)));
    }, [stations, type, region, query, onlyPicked, pickedStations]);

    const toggle = (station, rate) => {
        setError("");
        setDone(null);
        if (!ready) { setError(!campaign ? "Choose the campaign first." : !start ? "Give the campaign a start and end date first." : "This campaign has ended. Change its dates first."); return; }
        setLines((prev) => {
            if (prev.some((l) => l.rateId === rate._id)) return prev.filter((l) => l.rateId !== rate._id);
            const rateDays = rate.days || [];
            return [...prev, {
                key: `${station._id}-${rate._id}`,
                stationId: station._id,
                stationName: station.name,
                rateId: rate._id,
                rateName: rate.name,
                spotSeconds: rate.spotSeconds || null,
                programme: programmeKey(rate),
                rateDays,
                when: groupWhen({ kind: rate.kind, startTime: rate.startTime, endTime: rate.endTime, size: rate.size, colour: rate.colour }),
                // Default: every day it's sold (a Thursday-only programme starts on Thursdays).
                days: rateDays.length ? [...rateDays] : [1, 2, 3, 4, 5, 6, 0],
                spotsPerDay: 1,
                startDate: "",
                endDate: "",
            }];
        });
    };
    const updateLine = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));
    const setOpen = (id, open) => setOpenIds((prev) => { const next = new Set(prev); if (open) next.add(id); else next.delete(id); return next; });

    const totals = quote?.totals || null;
    const lineErrors = new Map((quote?.errors || []).filter((e) => e.line != null).map((e) => [e.line, e.message]));
    const planErrors = (quote?.errors || []).filter((e) => e.line == null);
    const shortfall = totals && balance != null ? Math.max(0, Math.round((totals.total - balance) * 100) / 100) : 0;
    const canBook = ready && !!creative && !!totals && !quoting && !(quote?.errors || []).length && shortfall === 0 && !booking;

    const book = async () => {
        setError("");
        setBooking(true);
        try {
            const res = await checkoutMediaPlan(payload);
            walletChanged();
            setDone({ message: res?.message, spots: res?.data?.spots });
            setLines([]);
        } catch (err) {
            setError(err?.message || "The plan could not be booked. You have not been charged.");
        } finally {
            setBooking(false);
        }
    };

    if (loadError) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">{loadError}</div>;
    if (campaigns === null) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;

    return (
        <div>
            <div className="mb-6">
                <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white"><CalendarDays className="h-6 w-6 text-emerald-500" /> Book airtime</h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                    Build your media plan for the whole campaign: tick slots on any media houses, choose the days they air and how many spots a day. The whole plan is held in your wallet and each media house is paid as its spots air.
                </p>
            </div>

            {done && (
                <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                    <p className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> {done.message}</p>
                    <Link href={`${paths.campaigns}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"><ListChecks className="h-4 w-4" /> Track the campaign</Link>
                </div>
            )}

            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                {campaigns.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        You need a campaign first. <Link href={paths.campaigns} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Create a campaign</Link> with its start and end dates.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">1. Campaign</span>
                            <select value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setLines([]); }} className={selectClass}>
                                <option value="">Choose a campaign</option>
                                {campaigns.map((c) => <option key={c._id} value={c._id}>{c.name}{c.clientBrand ? ` (${c.clientBrand})` : ""}</option>)}
                            </select>
                        </label>
                        <div>
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">2. Campaign period</span>
                            {!campaign ? (
                                <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm text-slate-400 dark:bg-slate-800">From your campaign</p>
                            ) : !start ? (
                                <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">No dates yet. <Link href={paths.campaigns} className="font-medium underline">Add the start and end dates</Link>.</p>
                            ) : ended ? (
                                <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">This campaign ended on {prettyDate(end)}. <Link href={paths.campaigns} className="font-medium underline">Change its dates</Link>.</p>
                            ) : (
                                <p className="rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm font-medium text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">{prettyDate(start)} to {prettyDate(end)}</p>
                            )}
                        </div>
                        <div>
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">3. Advert to air</span>
                            {!campaign ? (
                                <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm text-slate-400 dark:bg-slate-800">Choose the campaign first</p>
                            ) : creatives === null ? (
                                <p className="px-1 py-2.5 text-sm text-slate-500"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading adverts…</p>
                            ) : readyAdverts.length === 0 ? (
                                <p className="rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                                    {notReady.length ? "Your advert is waiting for approval or its ARCON certificate. " : "No advert yet. "}
                                    <Link href={paths.campaigns} className="font-medium underline">Upload it with its ARCON certificate</Link>.
                                </p>
                            ) : (
                                <>
                                    <select value={creativeId} onChange={(e) => setCreativeId(e.target.value)} className={selectClass}>
                                        <option value="">Choose the advert</option>
                                        {readyAdverts.map((c) => <option key={c._id} value={c._id}>{c.name}{c.durationSeconds ? ` · ${c.durationSeconds}s` : ""}</option>)}
                                    </select>
                                    {creative && <span className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> ARCON {creative.arcon?.certificateNumber}</span>}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </section>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                <section className="xl:col-span-3">
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Tick slots <span className="text-sm font-normal text-slate-500">({visible.length} media house{visible.length === 1 ? "" : "s"})</span></h2>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search media houses" aria-label="Search media houses" className="w-48 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
                            </div>
                            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Media type" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                            {regions.length > 1 && (
                                <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="State" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                                    <option value="ALL">All states</option>
                                    {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                            )}
                            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" className="accent-emerald-600" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} /> In plan</label>
                        </div>
                    </div>
                    {visible.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500 dark:border-slate-700"><MapPin className="mx-auto mb-2 h-6 w-6 text-slate-300" /> No media houses match.</p>
                    ) : (
                        <div className="space-y-3">
                            {visible.map((s) => (
                                <StationRates key={s._id} station={s} lines={lines} onToggle={toggle} open={openIds.has(s._id)} onOpenChange={(o) => setOpen(s._id, o)} advertSeconds={creative?.durationSeconds || null} />
                            ))}
                        </div>
                    )}
                </section>

                <aside className="xl:col-span-2">
                    <div className="sticky top-20 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                            5. Your plan {quoting && <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />}
                        </h2>
                        {lines.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">Tick slots on the left. Each becomes a line here, where you choose its days (e.g. Thursdays) and spots per day for the campaign period.</p>
                        ) : (
                            <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                                {lines.map((l, i) => (
                                    <PlanLine key={l.key} line={l} quote={quote?.lines?.find((q) => q.index === i)} error={lineErrors.get(i)} campaignStart={start} campaignEnd={end}
                                        onChange={(patch) => updateLine(l.key, patch)} onRemove={() => removeLine(l.key)} />
                                ))}
                            </ul>
                        )}

                        {totals && (
                            <dl className="space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
                                <div className="flex justify-between text-slate-600 dark:text-slate-300"><dt>{totals.spots.toLocaleString()} spots · {totals.stations} media house{totals.stations === 1 ? "" : "s"}</dt><dd>{formatMoney(totals.gross)}</dd></div>
                                <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><dt>Volume discount</dt><dd>−{formatMoney(totals.volumeDiscount)}</dd></div>
                                {totals.agencyCommission > 0 && <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><dt>Agency commission {totals.agencyCommissionPercent}%</dt><dd>−{formatMoney(totals.agencyCommission)}</dd></div>}
                                <div className="flex justify-between text-slate-600 dark:text-slate-300"><dt>Net</dt><dd>{formatMoney(totals.net)}</dd></div>
                                <div className="flex justify-between text-slate-600 dark:text-slate-300"><dt>VAT {totals.vatPercent}%</dt><dd>{formatMoney(totals.vat)}</dd></div>
                                <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold text-slate-900 dark:border-slate-800 dark:text-white"><dt>Total (held in your wallet)</dt><dd>{formatMoney(totals.total)}</dd></div>
                                <p className="text-xs text-slate-400">{prettyDate(totals.firstDate)} to {prettyDate(totals.lastDate)} · you save {formatMoney(totals.savings)}</p>
                            </dl>
                        )}

                        {planErrors.map((e) => <p key={e.message} className="text-sm text-red-600 dark:text-red-400">{e.message}</p>)}
                        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                        {!creative && lines.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-300">Choose the advert to air (step 3).</p>}

                        {totals && balance != null && (shortfall > 0 ? (
                            <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                                <p className="flex items-center gap-1.5 font-medium"><AlertTriangle className="h-4 w-4" /> Your wallet has {formatMoney(balance)}: you&apos;re {formatMoney(shortfall)} short.</p>
                                <Link href={`${paths.wallet}?fund=${Math.ceil(shortfall)}`} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 font-medium text-white hover:bg-red-600"><WalletIcon className="h-4 w-4" /> Fund wallet</Link>
                            </div>
                        ) : (
                            <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><WalletIcon className="h-3.5 w-3.5 text-emerald-500" /> Wallet {formatMoney(balance)} · left after booking {formatMoney(balance - totals.total)}</p>
                        ))}

                        <button type="button" disabled={!canBook} onClick={book} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40">
                            {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletIcon className="h-4 w-4" />}
                            {totals ? `Book plan: ${formatMoney(totals.total)} from wallet` : "Book plan"}
                        </button>
                        <p className="text-xs text-slate-400">Each media house confirms its order. Money for each spot is paid only once it airs; anything that doesn&apos;t air comes back to your wallet.</p>
                    </div>
                </aside>
            </div>
        </div>
    );
}
