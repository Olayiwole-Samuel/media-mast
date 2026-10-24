"use client";

import { useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { setStationRateCard } from "@/lib/api";
import { formatMoney } from "@/lib/status";

// The station's own rate card (PUT /station-portal/stations/:id/rate-card).
// TV and radio sell time belts (EE/AAA/AA/A, prime/regular); press sells
// placements by page size and colour. Advertisers pick one when booking.

const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const TV_PRESETS = [
    { name: "Premium (EE)", code: "EE", startTime: "19:00", endTime: "22:00", spotSeconds: 30 },
    { name: "Prime (AAA)", code: "AAA", startTime: "17:00", endTime: "19:00", spotSeconds: 30 },
    { name: "Day (AA)", code: "AA", startTime: "10:00", endTime: "17:00", spotSeconds: 30 },
    { name: "Off-peak (A)", code: "A", startTime: "22:00", endTime: "06:00", spotSeconds: 30 },
];
const RADIO_PRESETS = [
    { name: "Morning drive", code: "PRIME", startTime: "06:00", endTime: "10:00", spotSeconds: 30 },
    { name: "Daytime", code: "REGULAR", startTime: "10:00", endTime: "16:00", spotSeconds: 30 },
    { name: "Evening drive", code: "PRIME", startTime: "16:00", endTime: "20:00", spotSeconds: 30 },
    { name: "Bedtime", code: "BEDTIME", startTime: "20:00", endTime: "06:00", spotSeconds: 30 },
];
const PRESS_PRESETS = [
    { name: "Full page, colour", size: "Full page", colour: "COLOUR" },
    { name: "Half page, colour", size: "Half page", colour: "COLOUR" },
    { name: "Quarter page, black & white", size: "Quarter page", colour: "BLACK_WHITE" },
];

const blankRow = (isPress) => (isPress
    ? { kind: "PLACEMENT", name: "", code: "", size: "", colour: "COLOUR", price: "", isActive: true }
    : { kind: "TIME_BELT", name: "", code: "", startTime: "", endTime: "", spotSeconds: 30, price: "", isActive: true });

const toRow = (r) => ({
    _id: r._id,
    kind: r.kind,
    name: r.name || "",
    code: r.code || "",
    startTime: r.startTime || "",
    endTime: r.endTime || "",
    spotSeconds: r.spotSeconds ?? "",
    size: r.size || "",
    colour: r.colour || "COLOUR",
    price: r.price ? String(r.price) : "",
    isActive: r.isActive !== false,
});

const toPayload = (r) => ({
    ...(r._id ? { _id: r._id } : {}),
    name: r.name.trim(),
    kind: r.kind,
    code: r.code.trim() || null,
    ...(r.kind === "TIME_BELT"
        ? { startTime: r.startTime || null, endTime: r.endTime || null, spotSeconds: r.spotSeconds === "" ? null : Number(r.spotSeconds) }
        : { size: r.size.trim() || null, colour: r.colour || null }),
    price: Number(r.price),
    isActive: r.isActive,
});

export default function RateCardEditor({ station, onSaved }) {
    const isPress = station.type === "PRESS";
    const presets = isPress ? PRESS_PRESETS : station.type === "TV" ? TV_PRESETS : RADIO_PRESETS;
    const currency = station.pricing?.currency || "NGN";
    const [rows, setRows] = useState(() => (station.rateCard || []).map(toRow));
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState(null);

    const change = (i, field) => (e) => {
        const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        setRows((list) => list.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
    };
    const remove = (i) => setRows((list) => list.filter((_, j) => j !== i));
    const add = (preset) => setRows((list) => [...list, { ...blankRow(isPress), ...(preset || {}) }]);

    const save = async () => {
        setNotice(null);
        setSaving(true);
        try {
            const res = await setStationRateCard(station._id, rows.map(toPayload));
            const saved = res?.data?.rateCard || [];
            setRows(saved.map(toRow));
            onSaved?.(saved);
            setNotice({ ok: true, text: "Rate card saved." });
        } catch (err) {
            const detail = err?.data?.errors?.[0]?.message;
            setNotice({ ok: false, text: detail || err?.message || "We couldn't save the rate card." });
        } finally {
            setSaving(false);
        }
    };

    const unused = presets.filter((p) => !rows.some((r) => r.name.toLowerCase() === p.name.toLowerCase()));

    return (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div>
                <h2 className="font-semibold text-slate-900 dark:text-white">Rate card</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {isPress
                        ? "Your prices per placement. Advertisers choose a size and colour when they book an edition."
                        : "Your prices per spot for each time belt. A booking is priced by the belt it airs in; belts can run past midnight."}
                    {" "}With no rates here, the single price above is used.
                </p>
            </div>

            {rows.length > 0 && (
                <div className="space-y-3">
                    {rows.map((r, i) => (
                        <div key={r._id || `new-${i}`} className={`grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-12 ${r.isActive ? "border-slate-200 dark:border-slate-700" : "border-dashed border-slate-300 opacity-60 dark:border-slate-700"}`}>
                            <label className="col-span-2 text-xs text-slate-500 sm:col-span-3">Name
                                <input value={r.name} onChange={change(i, "name")} maxLength={80} className={`${inputClass} mt-1`} placeholder={isPress ? "Full page, colour" : "Prime (AAA)"} />
                            </label>
                            <label className="text-xs text-slate-500 sm:col-span-2">Code
                                <input value={r.code} onChange={change(i, "code")} maxLength={30} className={`${inputClass} mt-1 uppercase`} placeholder={isPress ? "FP" : "AAA"} />
                            </label>
                            {r.kind === "TIME_BELT" ? (
                                <>
                                    <label className="text-xs text-slate-500 sm:col-span-2">From
                                        <input type="time" value={r.startTime} onChange={change(i, "startTime")} className={`${inputClass} mt-1`} />
                                    </label>
                                    <label className="text-xs text-slate-500 sm:col-span-2">To
                                        <input type="time" value={r.endTime} onChange={change(i, "endTime")} className={`${inputClass} mt-1`} />
                                    </label>
                                    <label className="text-xs text-slate-500 sm:col-span-1">Secs
                                        <input type="number" min="1" max="3600" value={r.spotSeconds} onChange={change(i, "spotSeconds")} className={`${inputClass} mt-1`} />
                                    </label>
                                </>
                            ) : (
                                <>
                                    <label className="text-xs text-slate-500 sm:col-span-3">Size
                                        <input value={r.size} onChange={change(i, "size")} maxLength={40} className={`${inputClass} mt-1`} placeholder="Half page" />
                                    </label>
                                    <label className="text-xs text-slate-500 sm:col-span-2">Colour
                                        <select value={r.colour} onChange={change(i, "colour")} className={`${inputClass} mt-1`}>
                                            <option value="COLOUR">Colour</option>
                                            <option value="BLACK_WHITE">Black & white</option>
                                        </select>
                                    </label>
                                </>
                            )}
                            <label className="text-xs text-slate-500 sm:col-span-2">Price ({currency})
                                <input type="number" min="1" step="any" value={r.price} onChange={change(i, "price")} className={`${inputClass} mt-1`} />
                            </label>
                            <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-12">
                                <label className="flex items-center gap-2 text-xs text-slate-500">
                                    <input type="checkbox" checked={r.isActive} onChange={change(i, "isActive")} /> Offered
                                    {Number(r.price) > 0 && <span className="text-slate-400">· {formatMoney(Number(r.price), currency)}</span>}
                                </label>
                                <button type="button" onClick={() => remove(i)} aria-label={`Remove ${r.name || "rate"}`} className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline">
                                    <Trash2 className="h-3.5 w-3.5" /> Remove
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => add()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    <Plus className="h-4 w-4" /> Add {isPress ? "placement" : "time belt"}
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
                {saving ? "Saving…" : "Save rate card"}
            </button>
        </section>
    );
}
