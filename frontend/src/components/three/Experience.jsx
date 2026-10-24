"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import Scene from "./Scene";
import Lighting from "./Lighting";
import CameraRig from "./CameraRig";
import Stations, { layoutStations } from "./Stations";
import { getStations } from "@/lib/api";

// Real approved stations around the antenna (GET /api/v1/stations, public).
// Unlabelled background blips (no card, no hover) fill the scene when there
// are few, so nothing on the homepage claims a station that isn't on the platform.
const MAX_MARKERS = 24;
const PLACEHOLDER_COUNT = 10;

const TYPE_COLOR = {
    RADIO: "#34d399",
    TV: "#e8a33d",
    PRESS: "#60a5fa",
    BILLBOARD: "#f472b6",
    DIGITAL: "#a78bfa",
};

const toMarker = (s) => ({
    id: s._id || s.slug,
    name: s.name,
    type: s.type,
    city: s.location?.city || null,
    state: s.location?.state || null,
    pricing: s.pricing || null,
    inventoryStatus: s.inventoryStatus || "AVAILABLE",
    color: TYPE_COLOR[s.type] || "#34d399",
});

const PLACEHOLDERS = Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => ({
    id: `placeholder-${i}`,
    placeholder: true,
    color: i % 2 === 0 ? "#e8a33d" : "#14a89a",
}));

export default function Experience() {
    const [stations, setStations] = useState(null); // null = loading
    const [hoveredId, setHoveredId] = useState(null);

    // Written by the antenna every frame, read by the markers.
    const beamRef = useRef({ origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), halfAngle: 0.24, locked: false });

    useEffect(() => {
        let live = true;
        getStations()
            .then((res) => {
                if (!live) return;
                const list = Array.isArray(res?.data) ? res.data : [];
                setStations(list.slice(0, MAX_MARKERS).map(toMarker));
            })
            .catch(() => live && setStations([]));
        return () => { live = false; };
    }, []);

    // Real stations first; unlabelled blips fill the sky up to PLACEHOLDER_COUNT points.
    const markers = useMemo(() => {
        const real = stations || [];
        return [...real, ...PLACEHOLDERS.slice(0, Math.max(PLACEHOLDER_COUNT - real.length, 0))];
    }, [stations]);
    const positions = useMemo(() => layoutStations(markers.length), [markers.length]);
    const hoveredIndex = markers.findIndex((m) => m.id === hoveredId);
    const hovered = hoveredIndex >= 0 ? markers[hoveredIndex] : null;

    const handleHover = useCallback((id) => setHoveredId(id), []);

    const readout = hovered
        ? { label: "Signal locked", text: hovered.name }
        : stations === null
            ? { label: "Searching", text: "Scanning for stations…" }
            : stations.length
                ? { label: "Searching", text: `${stations.length} station${stations.length === 1 ? "" : "s"} available · hover to lock on` }
                : { label: "Searching", text: "Stations are joining soon" };

    return (
        <div className="relative h-full w-full">
            <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
                <Lighting />

                <color attach="background" args={["#05070c"]} />
                <fog attach="fog" args={["#05070c", 8, 18]} />
                <Environment preset="studio" />

                <CameraRig />

                <Scene target={hovered ? positions[hoveredIndex] : null} beamRef={beamRef} />

                <Stations
                    stations={markers}
                    positions={positions}
                    hoveredId={hoveredId}
                    onHover={handleHover}
                    beamRef={beamRef}
                />

                <ContactShadows position={[0, -1.2, 0]} opacity={0.35} blur={2.5} scale={10} far={8} />

                <EffectComposer>
                    <Bloom intensity={0.85} luminanceThreshold={0.25} luminanceSmoothing={0.9} mipmapBlur />
                </EffectComposer>
            </Canvas>

            {/* Live readout */}
            <div className="pointer-events-none absolute bottom-6 left-6 rounded-lg border border-white/10 bg-black/40 px-3 py-2 backdrop-blur-md" aria-live="polite">
                <p className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] ${hovered ? "text-emerald-300" : "text-amber-300"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${hovered ? "bg-emerald-300" : "animate-pulse bg-amber-300"}`} />
                    {readout.label}
                </p>
                <p className="font-mono text-xs tabular-nums text-white/70">{readout.text}</p>
            </div>
        </div>
    );
}
