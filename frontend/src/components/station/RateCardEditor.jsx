"use client";

import { useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { setStationRateCard } from "@/lib/api";
import { formatMoney } from "@/lib/status";

// A media house's rate card, laid out like the real cards: one row per time
// belt or programme, with a price for each spot length (60/45/30/15 s).
// Press sells placements by page size and colour instead. Advertisers pick a
// row and a length; the system prices the booking from it (nobody types a price).
//
// saveRates(rates) saves and resolves to the saved rate card. By default it
// saves through the station desk; the verification page passes its own.

const LENGTHS = [60, 45, 30, 15, 5];

// Days a rate is sold (0 = Sunday … 6 = Saturday); empty = every day.
const DAY_PRESETS = [
    { value: "", label: "Every day", days: [] },
    { value: "1,2,3,4,5", label: "Mon–Fri", days: [1, 2, 3, 4, 5] },
    { value: "0,6", label: "Sat & Sun", days: [0, 6] },
    { value: "6", label: "Saturdays", days: [6] },
    { value: "0", label: "Sundays", days: [0] },
];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const daysKey = (days) => [...(days || [])].sort((a, b) => a - b).join(",");

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const TV_PRESETS = [
    { name: "EE (Premium)", code: "EE", kind: "TIME_BELT", startTime: "20:00", endTime: "22:00" },
    { name: "AAA (Prime)", code: "AAA", kind: "TIME_BELT", startTime: "19:00", endTime: "23:00" },
    { name: "AA (Early evening)", code: "AA", kind: "TIME_BELT", startTime: "16:00", endTime: "19:00" },
    { name: "A (Day)", code: "A", kind: "TIME_BELT", startTime: "09:00", endTime: "16:00" },
    { name: "Run of spot (any time)", code: "ROS", kind: "TIME_BELT", startTime: "06:00", endTime: "00:00" },
    { name: "Within the news", code: "NEWS", kind: "PLACEMENT" },
];
const RADIO_PRESETS = [
    { name: "Morning drive", code: "PRIME", kind: "TIME_BELT", startTime: "06:00", endTime: "10:00" },
    { name: "Daytime", code: "REGULAR", kind: "TIME_BELT", startTime: "10:00", endTime: "16:00" },
    { name: "Evening drive", code: "PRIME", kind: "TIME_BELT", startTime: "16:00", endTime: "20:00" },
    { name: "Bedtime", code: "BEDTIME", kind: "TIME_BELT", startTime: "20:00", endTime: "06:00" },
    { name: "Within the news", code: "NEWS", kind: "PLACEMENT" },
];
const PRESS_PRESETS = [
    { name: "Full page, colour", size: "Full page", colour: "COLOUR" },
    { name: "Half page, colour", size: "Half page", colour: "COLOUR" },
    { name: "Quarter page, black & white", size: "Quarter page", colour: "BLACK_WHITE" },
];

let keySeq = 0;
const newKey = () => `row-${++keySeq}`;

// Saved rates (one per length) → editor rows (one per belt/programme).
const toGroups = (rateCard, isPress) => {
    if (isPress) {
        return (rateCard || []).map((r) => ({
            key: newKey(), _id: r._id, name: r.name || "", code: r.code || "", size: r.size || "",
            colour: r.colour || "COLOUR", price: r.price ? String(r.price) : "", isActive: r.isActive !== false, days: r.days || [],
        }));
    }
    const groups = new Map();
    for (const r of rateCard || []) {
        const id = [r.name, r.kind, r.code || "", r.startTime || "", r.endTime || "", daysKey(r.days)].join("|");
        if (!groups.has(id)) {
            groups.set(id, {
                key: newKey(), name: r.name || "", kind: r.kind || "TIME_BELT", code: r.code || "",
                startTime: r.startTime || "", endTime: r.endTime || "", prices: {}, ids: {}, isActive: r.isActive !== false, days: r.days || [],
            });
        }
        const g = groups.get(id);
        const len = LENGTHS.includes(r.spotSeconds) ? r.spotSeconds : 30;
        g.prices[len] = r.price ? String(r.price) : "";
        if (r._id) g.ids[len] = r._id;
        if (r.isActive === false) g.isActive = false;
    }
    return [...groups.values()];
};

// Editor rows → rates for the API (one per length that has a price).
const toRates = (groups, isPress) => {
    if (isPress) {
        return groups.map((g) => ({
            ...(g._id ? { _id: g._id } : {}),
            name: g.name.trim(), kind: "PLACEMENT", code: g.code.trim() || null,
            size: g.size.trim() || null, colour: g.colour || null, price: Number(g.price), isActive: g.isActive, days: g.days || [],
        }));
    }
    const out = [];
    for (const g of groups) {
        for (const len of LENGTHS) {
            const raw = g.prices[len];
            if (raw === undefined || raw === "") continue;
            out.push({
                ...(g.ids[len] ? { _id: g.ids[len] } : {}),
                name: g.name.trim(), kind: g.kind, code: g.code.trim() || null,
                ...(g.kind === "TIME_BELT" ? { startTime: g.startTime || null, endTime: g.endTime || null } : {}),
                spotSeconds: len, price: Number(raw), isActive: g.isActive, days: g.days || [],
            });
        }
    }
    return out;
};

const blank = (isPress) => (isPress
    ? { key: newKey(), name: "", code: "", size: "", colour: "COLOUR", price: "", isActive: true }
    : { key: newKey(), name: "", kind: "TIME_BELT", code: "", startTime: "", endTime: "", prices: {}, ids: {}, isActive: true, days: [] });

export default function RateCardEditor({ station, onSaved, saveRates, title = "Rate card", compact = false }) {
    const isPress = station.type === "PRESS";
    const presets = isPress ? PRESS_PRESETS : station.type === "RADIO" ? RADIO_PRESETS : TV_PRESETS;
    const currency = station.pricing?.currency || "NGN";
    const [groups, setGroups] = useState(() => toGroups(station.rateCard, isPress));
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);

    const set = (key, field, value) => setGroups((list) => list.map((g) => (g.key === key ? { ...g, [field]: value } : g)));
    const setPrice = (key, len, value) => setGroups((list) => list.map((g) => (g.key === key ? { ...g, prices: { ...g.prices, [len]: value } } : g)));
    const remove = (key) => setGroups((list) => list.filter((g) => g.key !== key));
    const add = (preset) => setGroups((list) => [...list, { ...blank(isPress), ...(preset || {}), key: newKey() }]);

    const save = async () => {
        setNotice(null);
        const rates = toRates(groups, isPress);
        if (groups.some((g) => !g.name.trim())) {
            setNotice({ ok: false, text: "Give every row a name." });
            return;
        }
        if (!isPress && groups.some((g) => !LENGTHS.some((l) => g.prices[l]))) {
            setNotice({ ok: false, text: "Enter a price for at least one spot length on every row." });
            return;
        }
        if (!isPress && groups.some((g) => g.kind === "TIME_BELT" && (!g.startTime || !g.endTime))) {
            setNotice({ ok: false, text: "Time belts need a start and end time (programme spots don't)." });
            return;
        }
        setSaving(true);
        try {
            const saved = saveRates
                ? await saveRates(rates)
                : (await setStationRateCard(station._id, rates))?.data?.rateCard || [];
            setGroups(toGroups(saved, isPress));
            onSaved?.(saved);
            setNotice({ ok: true, text: "Rates saved." });
        } catch (err) {
            const detail = err?.data?.fieldErrors?.[0]?.message || err?.data?.errors?.[0]?.message;
            setNotice({ ok: false, text: detail || err?.message || "We couldn't save the rates." });
        } finally {
            setSaving(false);
        }
    };

    const unused = presets.filter((p) => !groups.some((g) => g.name.toLowerCase() === p.name.toLowerCase()));

    return (
        <section className={`space-y-4 ${compact ? "" : "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"}`}>
            <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {isPress
                        ? "Your price per placement. Advertisers choose a size and colour when they book an edition."
                        : "One row per time belt or programme, with your price for each spot length. Leave a length empty if you don't sell it. Advertisers pick a row and a length; the price comes from here."}
                </p>
            </div>

            {groups.length > 0 && (
                <div className="space-y-3">
                    {groups.map((g) => (
                        <div key={g.key} className={`rounded-xl border p-3 ${g.isActive ? "border-slate-200 dark:border-slate-700" : "border-dashed border-slate-300 opacity-60 dark:border-slate-700"}`}>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                                <label className="col-span-2 text-xs text-slate-500 sm:col-span-4">{isPress ? "Placement" : "Belt or programme"}
                                    <input value={g.name} onChange={(e) => set(g.key, "name", e.target.value)} maxLength={80} className={`${inputClass} mt-1`} placeholder={isPress ? "Half page, colour" : "AAA (Prime)"} />
                                </label>
                                <label className="text-xs text-slate-500 sm:col-span-2">Code
                                    <input value={g.code} onChange={(e) => set(g.key, "code", e.target.value)} maxLength={30} className={`${inputClass} mt-1 uppercase`} placeholder={isPress ? "HP" : "AAA"} />
                                </label>
                                {isPress ? (
                                    <>
                                        <label className="text-xs text-slate-500 sm:col-span-2">Size
                                            <input value={g.size} onChange={(e) => set(g.key, "size", e.target.value)} maxLength={40} className={`${inputClass} mt-1`} placeholder="Half page" />
                                        </label>
                                        <label className="text-xs text-slate-500 sm:col-span-2">Colour
                                            <select value={g.colour} onChange={(e) => set(g.key, "colour", e.target.value)} className={`${inputClass} mt-1`}>
                                                <option value="COLOUR">Colour</option>
                                                <option value="BLACK_WHITE">Black & white</option>
                                            </select>
                                        </label>
                                        <label className="text-xs text-slate-500 sm:col-span-2">Price ({currency})
                                            <input type="number" min="1" step="any" value={g.price} onChange={(e) => set(g.key, "price", e.target.value)} className={`${inputClass} mt-1`} />
                                        </label>
                                    </>
                                ) : (
                                    <>
                                        <label className="text-xs text-slate-500 sm:col-span-2">Type
                                            <select value={g.kind} onChange={(e) => set(g.key, "kind", e.target.value)} className={`${inputClass} mt-1`}>
                                                <option value="TIME_BELT">Time belt</option>
                                                <option value="PLACEMENT">In a programme</option>
                                            </select>
                                        </label>
                                        {g.kind === "TIME_BELT" ? (
                                            <>
                                                <label className="text-xs text-slate-500 sm:col-span-2">From
                                                    <input type="time" value={g.startTime} onChange={(e) => set(g.key, "startTime", e.target.value)} className={`${inputClass} mt-1`} />
                                                </label>
                                                <label className="text-xs text-slate-500 sm:col-span-2">To
                                                    <input type="time" value={g.endTime} onChange={(e) => set(g.key, "endTime", e.target.value)} className={`${inputClass} mt-1`} />
                                                </label>
                                            </>
                                        ) : (
                                            <p className="col-span-2 self-end pb-2 text-xs text-slate-400 sm:col-span-4">Aired inside the programme on the booked day.</p>
                                        )}
                                    </>
                                )}
                            </div>

                            <label className="mt-2 block text-xs text-slate-500 sm:w-1/3">Sold on
                                <select value={daysKey(g.days)} onChange={(e) => set(g.key, "days", e.target.value ? e.target.value.split(",").map(Number) : [])} className={`${inputClass} mt-1`}>
                                    {DAY_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    {!DAY_PRESETS.some((p) => p.value === daysKey(g.days)) && (
                                        <option value={daysKey(g.days)}>{(g.days || []).map((n) => DAY_NAMES[n]).join(", ")}</option>
                                    )}
                                </select>
                            </label>

                            {!isPress && (
                                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                    {LENGTHS.map((len) => (
                                        <label key={len} className="text-xs text-slate-500">{len}-second spot ({currency})
                                            <input type="number" min="1" step="any" value={g.prices[len] ?? ""} onChange={(e) => setPrice(g.key, len, e.target.value)} className={`${inputClass} mt-1`} placeholder="Not sold" />
                                        </label>
                                    ))}
                                </div>
                            )}

                            <div className="mt-2 flex items-center justify-between gap-3">
                                <label className="flex items-center gap-2 text-xs text-slate-500">
                                    <input type="checkbox" checked={g.isActive} onChange={(e) => set(g.key, "isActive", e.target.checked)} /> Offered
                                    {isPress && Number(g.price) > 0 && <span className="text-slate-400">· {formatMoney(Number(g.price), currency)}</span>}
                                </label>
                                <button type="button" onClick={() => remove(g.key)} aria-label={`Remove ${g.name || "row"}`} className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline">
                                    <Trash2 className="h-3.5 w-3.5" /> Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => add()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    <Plus className="h-4 w-4" /> Add {isPress ? "placement" : "belt or programme"}
                </button>
                {unused.map((p) => (
                    <button key={p.name} type="button" onClick={() => add(p)} className="rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-emerald-400 hover:text-emerald-600 dark:border-slate-700">
                        + {p.name}
                    </button>
                ))}
            </div>

            {notice && (
                <p role="status" className={`text-sm ${notice.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>{notice.text}</p>
            )}

            <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving…" : "Save rates"}
            </button>
        </section>
    );
}
