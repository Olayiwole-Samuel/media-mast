"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
    Loader2, ShieldCheck, Search, Tv, Radio, Newspaper, Monitor, Image as BillboardIcon,
    ChevronDown, ChevronUp, CalendarDays, AlertTriangle, MapPin, Wallet as WalletIcon, Trash2, CheckCircle2, ShoppingCart, Cloud,
} from "lucide-react";
import { getCampaigns, getStations, getCreatives, quoteMediaPlan, getPlanDraft, savePlanDraft, getPlanSources, getPlanSource, getStationAvailability } from "@/lib/api";
import { formatMoney } from "@/lib/status";
import { useSession } from "@/lib/auth";
import { advertiserPaths } from "@/lib/cart";
import { useWallet } from "@/lib/wallet";
import { daysLabel, groupRates, cardLengths, groupWhen, programmeKey } from "@/lib/rates";

// ─────────────────────────────────────────────────────────────
// Book airtime = build a media plan for the campaign's whole period.
//
//   1. Campaign (its start and end dates) and the advert.
//   2. Tick slots on as many media houses as you like (rate card grids).
//   3. Right under the slot: spots for each weekday (Mon 2, Tue 1, …), for
//      the whole campaign or a shorter range inside it.
//   4. Every change is saved to the cart. In the cart the advertiser sees the
//      money needed, funds the wallet if short, and pays. Priced like an
//      agency plan: rate card − volume discount (the agency's confirmed
//      agreement) − 15% agency commission (agencies) = net + 7.5% VAT.
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
// A new plan line for a ticked slot: 1 spot on each day it's sold
// (a Thursday-only programme starts as Thursday 1).
const lineFor = (station, rate) => {
    const rateDays = rate.days || [];
    return {
        key: `${station._id}-${rate._id}`,
        stationId: station._id,
        stationName: station.name,
        rateId: rate._id,
        rateName: rate.name,
        spotSeconds: rate.spotSeconds || null,
        programme: programmeKey(rate),
        rateDays,
        when: groupWhen({ kind: rate.kind, startTime: rate.startTime, endTime: rate.endTime, size: rate.size, colour: rate.colour }),
        spotsByDay: [0, 1, 2, 3, 4, 5, 6].map((d) => (!rateDays.length || rateDays.includes(d) ? 1 : 0)),
        startDate: "",
        endDate: "",
        offWeeks: [],
    };
};

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
function StationBlocked({ stationId }) {
    const [list, setList] = useState(null);
    useEffect(() => {
        let live = true;
        getStationAvailability(stationId).then((r) => live && setList(r?.data?.blackouts || [])).catch(() => live && setList([]));
        return () => { live = false; };
    }, [stationId]);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (list || []).filter((b) => (b.endDate || b.startDate) >= today);
    if (!upcoming.length) return null;
    const label = (b) => `${shortDate(b.startDate)}${b.endDate && b.endDate !== b.startDate ? `–${shortDate(b.endDate)}` : ""}${b.startTime ? ` ${b.startTime}–${b.endTime}` : ""}`;
    return <p className="px-4 pb-2 text-xs text-amber-700 dark:text-amber-300">Not available: {upcoming.slice(0, 8).map(label).join(" · ")}{upcoming.length > 8 ? " …" : ""}</p>;
}

function StationRates({ station, lines, onToggle, open, onOpenChange, advertSeconds, renderLines }) {
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
                    <p className="px-4 py-2 text-xs text-slate-400">Rate card prices per {station.type === "PRESS" ? "insertion" : "spot"}. Tick a slot, then set the spots for each day right below.</p>
                    <StationBlocked stationId={station._id} />
                </div>
            )}
            {mine.length > 0 && (
                <div className="space-y-2 border-t border-emerald-100 bg-emerald-50/40 p-3 dark:border-emerald-500/10 dark:bg-emerald-500/5">
                    {renderLines(mine)}
                </div>
            )}
        </div>
    );
}

// One plan line: spots for each weekday, optional date range; its price from the quote.
const DAY_ORDER = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]];
const VD_LABEL = { PENDING: "volume discount waiting for the media house to confirm", REJECTED: "volume discount not confirmed by the media house" };

const mondayOf = (d) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const weeksBetween = (from, to) => {
    if (!from || !to || from > to) return [];
    const out = [];
    for (let w = mondayOf(from); w <= to; w = new Date(new Date(`${w}T00:00:00Z`).getTime() + 7 * 864e5).toISOString().slice(0, 10)) out.push(w);
    return out.slice(0, 80);
};
const shortDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function PlanLine({ line, quote, error, campaignStart, campaignEnd, onChange, onRemove, onApplyAll, canApplyAll }) {
    const [showWeeks, setShowWeeks] = useState(false);
    const [showSkipped, setShowSkipped] = useState(false);
    const [tomorrow] = useState(() => new Date(Date.now() + 864e5).toISOString().slice(0, 10));
    const lineFrom = [line.startDate || campaignStart, tomorrow].sort().pop();
    const weeks = weeksBetween(lineFrom, line.endDate || campaignEnd);
    const off = new Set(line.offWeeks || []);
    const toggleWeek = (w) => onChange({ offWeeks: off.has(w) ? [...off].filter((x) => x !== w) : [...off, w] });
    const soldDays = line.rateDays?.length ? new Set(line.rateDays) : null;
    const setDay = (d, v) => {
        const next = [...line.spotsByDay];
        next[d] = Math.max(0, Math.min(20, Number(v) || 0));
        onChange({ spotsByDay: next });
    };
    const perWeek = line.spotsByDay.reduce((t, n) => t + n, 0);
    return (
        <div className={`rounded-xl border bg-white p-3 dark:bg-slate-900 ${error ? "border-red-300 dark:border-red-500/40" : "border-slate-200 dark:border-slate-800"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">{line.rateName}{line.spotSeconds ? ` · ${line.spotSeconds}s` : ""}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{line.when}{soldDays ? ` · sold ${daysLabel(line.rateDays)} only` : ""} · {perWeek} spot{perWeek === 1 ? "" : "s"} a week</p>
                </div>
                <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10" aria-label="Remove line"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
                {DAY_ORDER.map(([d, label]) => {
                    const off = soldDays && !soldDays.has(d);
                    return (
                        <label key={d} className={`flex flex-col items-center rounded-lg border px-1 py-1 text-[11px] ${off ? "border-transparent bg-slate-50 text-slate-300 dark:bg-slate-800 dark:text-slate-600" : line.spotsByDay[d] > 0 ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "border-slate-200 text-slate-500 dark:border-slate-700"}`}>
                            {label}
                            <input type="number" min={0} max={20} disabled={off} value={off ? "" : line.spotsByDay[d]} aria-label={`${label} spots`}
                                onChange={(e) => setDay(d, e.target.value)} className="mt-0.5 w-full rounded border-0 bg-transparent p-0 text-center text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed" />
                        </label>
                    );
                })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span>From</span>
                <input type="date" value={line.startDate || ""} min={campaignStart} max={campaignEnd} onChange={(e) => onChange({ startDate: e.target.value })} className={smallInput} />
                <span>to</span>
                <input type="date" value={line.endDate || ""} min={campaignStart} max={campaignEnd} onChange={(e) => onChange({ endDate: e.target.value })} className={smallInput} />
                {(line.startDate || line.endDate) ? <button type="button" onClick={() => onChange({ startDate: "", endDate: "" })} className="text-emerald-600 hover:underline">whole campaign</button> : <span className="text-slate-400">(whole campaign)</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <button type="button" onClick={() => setShowWeeks(!showWeeks)} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    {showWeeks ? "Hide weeks" : `Weeks on/off${off.size ? ` (${off.size} off)` : ""}`}
                </button>
                {canApplyAll && <button type="button" onClick={onApplyAll} className="font-medium text-slate-600 hover:underline dark:text-slate-300">Use these days for all lines</button>}
            </div>
            {showWeeks && (
                <div className="mt-2">
                    <p className="mb-1 text-[11px] text-slate-500">Untick weeks for bursts and quiet weeks. Week of:</p>
                    <div className="flex flex-wrap gap-1">
                        {weeks.map((w) => (
                            <button key={w} type="button" onClick={() => toggleWeek(w)}
                                className={`rounded-md px-2 py-1 text-[11px] font-medium ${off.has(w) ? "bg-slate-100 text-slate-400 line-through dark:bg-slate-800" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200"}`}>
                                {shortDate(w)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {error ? (
                <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
            ) : quote ? (
                <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                    <span className="font-semibold text-slate-900 dark:text-white">{quote.spots} spots</span> ({prettyDate(quote.firstDate)} to {prettyDate(quote.lastDate)})
                    {" · "}{formatMoney(quote.unit.gross)}{quote.unit.volumeDiscountPercent ? ` − ${quote.unit.volumeDiscountPercent}% vol.` : ""}{quote.unit.agencyCommissionPercent ? ` − ${quote.unit.agencyCommissionPercent}% agency` : ""} = <span className="font-semibold">{formatMoney(quote.unit.net)}</span> net + VAT
                    {" · "}<span className="font-semibold text-slate-900 dark:text-white">{formatMoney(quote.totals.total)}</span>
                    {VD_LABEL[quote.volumeDiscountStatus] && <span className="block text-amber-700 dark:text-amber-300">Your {VD_LABEL[quote.volumeDiscountStatus]}.</span>}
                    {quote.skippedCount > 0 && (
                        <span className="block text-amber-700 dark:text-amber-300">
                            {quote.skippedCount} date{quote.skippedCount === 1 ? "" : "s"} skipped (media house unavailable). <button type="button" onClick={() => setShowSkipped(!showSkipped)} className="underline">{showSkipped ? "hide" : "which?"}</button>
                            {showSkipped && <span className="mt-1 block">{(quote.skipped || []).map((x) => `${shortDate(x.date)}: ${x.reason.replace(/^This station /, "")}`).join(" · ")}{quote.skippedCount > (quote.skipped || []).length ? " …" : ""}</span>}
                        </span>
                    )}
                </div>
            ) : null}
        </div>
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
    const [saveState, setSaveState] = useState(""); // "", "saving", "saved", "error"
    const draftLoaded = useRef(null); // the campaign whose saved plan has been loaded

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
        getCreatives(campaignId)
            .then((r) => {
                if (!live) return;
                const list = r?.data || [];
                setCreatives(list);
                const ready = list.filter(isBookableAdvert);
                if (ready.length === 1) setCreativeId((cur) => cur || ready[0]._id);
            })
            .catch(() => live && setCreatives([]));
        return () => { live = false; };
    }, [campaignId]);

    // The plan saved in the cart for this campaign (nothing is lost when you leave).
    useEffect(() => {
        if (!campaignId || !stations.length) return undefined;
        let live = true;
        draftLoaded.current = null;
        getPlanDraft(campaignId)
            .then((r) => {
                if (!live) return;
                const d = r?.data;
                const byId = new Map(stations.map((st) => [st._id, st]));
                const restored = (d?.lines || []).map((l) => {
                    const st = byId.get(l.stationId);
                    const rate = st && (st.rateCard || []).find((x) => x && x._id === l.rateId);
                    return st && rate ? { ...lineFor(st, rate), spotsByDay: l.spotsByDay, startDate: l.startDate || "", endDate: l.endDate || "", offWeeks: l.offWeeks || [] } : null;
                }).filter(Boolean);
                setLines(restored);
                if (d?.creativeId) setCreativeId(d.creativeId);
                if (restored.length) setOpenIds((prev) => new Set([...prev, ...restored.map((l) => l.stationId)]));
                draftLoaded.current = campaignId;
            })
            .catch(() => { if (live) draftLoaded.current = campaignId; });
        return () => { live = false; };
    }, [campaignId, stations]);

    const creative = (creatives || []).find((c) => c._id === creativeId && isBookableAdvert(c)) || null;
    const readyAdverts = (creatives || []).filter(isBookableAdvert);
    const notReady = (creatives || []).filter((c) => !isBookableAdvert(c));
    const ready = !!campaign && !!start && !ended;

    // Live price from the server (same rules as checkout).
    const payload = useMemo(() => (campaign && lines.length ? {
        campaignId: campaign._id,
        creativeId: creativeId || undefined,
        lines: lines.map((l) => ({ stationId: l.stationId, rateId: l.rateId, spotsByDay: l.spotsByDay, startDate: l.startDate || undefined, endDate: l.endDate || undefined, offWeeks: l.offWeeks || [] })),
    } : null), [campaign, lines, creativeId]);

    // Save every change to the cart (after the saved plan has loaded).
    useEffect(() => {
        if (!campaign || draftLoaded.current !== campaign._id) return undefined;
        setSaveState("saving");
        const t = setTimeout(() => {
            savePlanDraft(campaign._id, {
                creativeId: creativeId || undefined,
                lines: lines.map((l) => ({ stationId: l.stationId, rateId: l.rateId, spotsByDay: l.spotsByDay, startDate: l.startDate || undefined, endDate: l.endDate || undefined, offWeeks: l.offWeeks || [] })),
            }).then(() => setSaveState("saved")).catch(() => setSaveState("error"));
        }, 600);
        return () => clearTimeout(t);
    }, [campaign, lines, creativeId]);
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
        if (!ready) { setError(!campaign ? "Choose the campaign first." : !start ? "Give the campaign a start and end date first." : "This campaign has ended. Change its dates first."); return; }
        setLines((prev) => {
            if (prev.some((l) => l.rateId === rate._id)) return prev.filter((l) => l.rateId !== rate._id);
            return [...prev, lineFor(station, rate)];
        });
        setOpen(station._id, true);
    };
    const updateLine = (key, patch) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    const applyPatternToAll = (from) => setLines((prev) => prev.map((l) => (l.key === from.key ? l : {
        ...l,
        spotsByDay: from.spotsByDay.map((n, d) => (!l.rateDays?.length || l.rateDays.includes(d) ? n : 0)),
    })));

    // Copy a plan from another campaign (its media houses, rates and days).
    const [sources, setSources] = useState(null);
    const [copyFrom, setCopyFrom] = useState("");
    const [copyNote, setCopyNote] = useState("");
    useEffect(() => {
        if (!campaignId) return;
        getPlanSources().then((r) => setSources((r.data || []).filter((c) => c._id !== campaignId))).catch(() => setSources([]));
    }, [campaignId]);
    const copyPlan = async () => {
        if (!copyFrom) return;
        try {
            const r = await getPlanSource(copyFrom);
            const byId = new Map(stations.map((st) => [st._id, st]));
            const copied = (r.data || []).map((l) => {
                const st = byId.get(l.stationId);
                const rate = st && (st.rateCard || []).find((x) => x && x._id === l.rateId && x.isActive !== false);
                return st && rate ? { ...lineFor(st, rate), spotsByDay: l.spotsByDay } : null;
            }).filter(Boolean);
            setLines((prev) => [...prev, ...copied.filter((c) => !prev.some((p) => p.rateId === c.rateId))]);
            setOpenIds((prev) => new Set([...prev, ...copied.map((c) => c.stationId)]));
            const missed = (r.data || []).length - copied.length;
            setCopyNote(`Copied ${copied.length} line${copied.length === 1 ? "" : "s"}${missed ? `; ${missed} no longer on the rate card` : ""}.`);
        } catch (e) {
            setCopyNote(e?.message || "Couldn't copy that plan.");
        }
    };
    const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));
    const setOpen = (id, open) => setOpenIds((prev) => { const next = new Set(prev); if (open) next.add(id); else next.delete(id); return next; });

    const totals = quote?.totals || null;
    const lineErrors = new Map((quote?.errors || []).filter((e) => e.line != null).map((e) => [e.line, e.message]));
    const planErrors = (quote?.errors || []).filter((e) => e.line == null);
    const shortfall = totals && balance != null ? Math.max(0, Math.round((totals.total - balance) * 100) / 100) : 0;
    const canReview = ready && !!totals && !(quote?.errors || []).length;

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

            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                {campaigns.length === 0 ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        You need a campaign first. <Link href={paths.campaigns} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">Create a campaign</Link> with its start and end dates.
                    </p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">1. Campaign</span>
                            <select value={campaignId} onChange={(e) => { draftLoaded.current = null; setLines([]); setCampaignId(e.target.value); }} className={selectClass}>
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
                                <StationRates key={s._id} station={s} lines={lines} onToggle={toggle} open={openIds.has(s._id)} onOpenChange={(o) => setOpen(s._id, o)} advertSeconds={creative?.durationSeconds || null}
                                    renderLines={(mine) => mine.map((l) => {
                                        const i = lines.indexOf(l);
                                        return <PlanLine key={l.key} line={l} quote={quote?.lines?.find((q) => q.index === i)} error={lineErrors.get(i)} campaignStart={start} campaignEnd={end} onChange={(patch) => updateLine(l.key, patch)} onRemove={() => removeLine(l.key)} onApplyAll={() => applyPatternToAll(l)} canApplyAll={lines.length > 1} />;
                                    })} />
                            ))}
                        </div>
                    )}
                </section>

                <aside className="xl:col-span-2">
                    <div className="sticky top-20 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="flex items-center justify-between font-semibold text-slate-900 dark:text-white">
                            5. Your plan
                            <span className="flex items-center gap-1.5 text-xs font-normal text-slate-500">
                                {quoting && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />}
                                {saveState === "saving" ? "Saving…" : saveState === "saved" ? <><Cloud className="h-3.5 w-3.5 text-emerald-500" /> Saved to cart</> : saveState === "error" ? <span className="text-red-600">Not saved</span> : null}
                            </span>
                        </h2>
                        {ready && sources && sources.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                                    <option value="">Copy a plan from another campaign…</option>
                                    {sources.map((c) => <option key={c._id} value={c._id}>{c.name}{c.bookedSpots ? ` (${c.bookedSpots} spots booked)` : " (saved)"}</option>)}
                                </select>
                                <button type="button" disabled={!copyFrom} onClick={copyPlan} className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200">Copy</button>
                                {copyNote && <span className="w-full text-slate-500">{copyNote}</span>}
                            </div>
                        )}
                        {lines.length === 0 ? (
                            <p className="text-sm text-slate-500 dark:text-slate-400">Tick slots on the left and set the spots for each day right there. Everything is saved to your cart as you go.</p>
                        ) : (
                            <ul className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1 text-sm">
                                {lines.map((l, i) => {
                                    const q = quote?.lines?.find((x) => x.index === i);
                                    return (
                                        <li key={l.key} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 ${lineErrors.get(i) ? "bg-red-50 dark:bg-red-500/10" : "bg-slate-50 dark:bg-slate-800/60"}`}>
                                            <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{l.stationName} · {l.rateName}{l.spotSeconds ? ` ${l.spotSeconds}s` : ""}</span>
                                            <span className="shrink-0 text-xs text-slate-500">{lineErrors.get(i) ? <span className="text-red-600">fix it</span> : q ? `${q.spots} · ${formatMoney(q.totals.total)}` : "…"}</span>
                                        </li>
                                    );
                                })}
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
                                <Link href={`${paths.wallet}?fund=${Math.ceil(shortfall)}&back=${encodeURIComponent(`${paths.book}?campaign=${campaign?._id || ""}`)}`} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 font-medium text-white hover:bg-red-600"><WalletIcon className="h-4 w-4" /> Fund wallet</Link>
                                <span className="mt-1 block text-xs">Your plan stays saved while you do.</span>
                            </div>
                        ) : (
                            <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><WalletIcon className="h-3.5 w-3.5 text-emerald-500" /> Wallet {formatMoney(balance)} · left after booking {formatMoney(balance - totals.total)}</p>
                        ))}

                        {canReview ? (
                            <Link href={paths.cart} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600">
                                <ShoppingCart className="h-4 w-4" /> Go to cart to pay {formatMoney(totals.total)}
                            </Link>
                        ) : (
                            <span className="inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-emerald-500/40 px-4 py-3 text-sm font-semibold text-white"><ShoppingCart className="h-4 w-4" /> Go to cart</span>
                        )}
                        <p className="text-xs text-slate-400">Your plan is saved in the cart. Pay from your wallet there (fund it first if needed). Each media house is paid only as its spots air.</p>
                    </div>
                </aside>
            </div>
        </div>
    );
}
