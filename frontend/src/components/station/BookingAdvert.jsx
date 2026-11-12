"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, Play, ShieldCheck } from "lucide-react";
import { fetchFileUrl, saveProtectedFile, stationCreativeFilePath } from "@/lib/api";

// The advert a booking should air, as the media house sees it: play/view it
// and open its ARCON certificate before accepting.

export default function BookingAdvert({ booking }) {
    const creative = booking.creativeId;
    const [url, setUrl] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

    if (!creative || typeof creative !== "object") {
        return (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                No advert is attached to this booking. Ask the advertiser for the material before airing it.
            </p>
        );
    }

    const play = async () => {
        setBusy(true);
        setError("");
        try {
            setUrl(await fetchFileUrl(stationCreativeFilePath(booking._id)));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const isVideo = creative.type === "VIDEO" || String(creative.mimeType || "").startsWith("video/");
    const isAudio = creative.type === "AUDIO" || String(creative.mimeType || "").startsWith("audio/");

    return (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                        Advert: {creative.name}{creative.durationSeconds ? ` · ${creative.durationSeconds}s` : ""}
                        {booking.spotSeconds ? <span className="font-normal text-slate-500"> (booked: {booking.spotSeconds}s spot)</span> : null}
                    </p>
                    {creative.arcon?.certificateNumber && (
                        <button type="button" onClick={() => saveProtectedFile(stationCreativeFilePath(booking._id, "arcon"), creative.arcon.fileName || "arcon-certificate").catch((err) => setError(err.message))}
                            className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 hover:underline dark:bg-emerald-500/15 dark:text-emerald-300">
                            <ShieldCheck className="h-3 w-3" /> ARCON {creative.arcon.certificateNumber} <FileText className="h-3 w-3" />
                        </button>
                    )}
                </div>
                {!url && (
                    <button type="button" disabled={busy} onClick={play} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} {isVideo || isAudio ? "Play advert" : "View advert"}
                    </button>
                )}
            </div>
            {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
            {url && (isVideo
                ? <video src={url} controls className="mt-2 max-h-72 w-full rounded-lg bg-black" />
                : isAudio
                ? <audio src={url} controls className="mt-2 w-full" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={url} alt={creative.name} className="mt-2 max-h-72 rounded-lg object-contain" />)}
        </div>
    );
}
