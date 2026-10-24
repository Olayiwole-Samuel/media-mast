"use client";

import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, Billboard, useCursor } from "@react-three/drei";
import { easing } from "maath";
import * as THREE from "three";

const TOOLTIP_ANCHOR = [0.35, 0.35, 0];

const tooltipStyle = {
    minWidth: "210px",
    padding: "12px 16px",
    borderRadius: "16px",
    background: "rgba(5, 12, 10, 0.72)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(52, 211, 153, 0.4)",
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5), 0 0 24px rgba(52, 211, 153, 0.18)",
    color: "#f3fdfa",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: "12px",
    lineHeight: "1.45",
    pointerEvents: "none",
    willChange: "opacity, transform",
    whiteSpace: "nowrap",
};

const AVAILABILITY = {
    AVAILABLE: { label: "Taking bookings", color: "#34d399" },
    BOOKED: { label: "Fully booked", color: "#fbbf24" },
    UNAVAILABLE: { label: "Paused", color: "#94a3b8" },
    MAINTENANCE: { label: "Maintenance", color: "#fbbf24" },
};

const UNIT = { SPOT: "spot", DAY: "day", WEEK: "week", MONTH: "month", CAMPAIGN: "campaign", IMPRESSION: "impression", CUSTOM: "booking" };

const formatPrice = (pricing) => {
    const amount = Number(pricing?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return "Price on request";
    let money;
    try {
        money = new Intl.NumberFormat("en-NG", { style: "currency", currency: pricing.currency || "NGN", maximumFractionDigits: 0 }).format(amount);
    } catch {
        money = `${pricing.currency || "NGN"} ${amount.toLocaleString()}`;
    }
    return `${money} / ${UNIT[pricing.unit] || "booking"}`;
};

const titleCase = (s) => String(s || "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function StationMarker({ station, position, phase, isHovered, hasActiveHover, onHover, beamRef }) {
    const groupRef = useRef(null);
    const meshRef = useRef(null);
    const matRef = useRef(null);
    const ringRef = useRef(null);
    const ringMatRef = useRef(null);
    const lineMatRef = useRef(null);

    const hoverWeight = useRef(0);
    const ping = useRef(0);
    const tmp = useMemo(() => ({ world: new THREE.Vector3(), to: new THREE.Vector3() }), []);

    const interactive = !station.placeholder;
    useCursor(isHovered && interactive);

    useFrame((state, delta) => {
        const time = state.clock.elapsedTime;

        // Ambient floating
        if (groupRef.current) {
            groupRef.current.position.y = position[1] + Math.sin(time * 0.7 + phase) * 0.12;
        }

        const targetWeight = isHovered ? 1 : 0;
        hoverWeight.current += (targetWeight - hoverWeight.current) * Math.min(delta * 8, 1);

        // "Signal found": light up while the antenna's beam passes over this marker.
        let inBeam = false;
        if (beamRef?.current && groupRef.current) {
            groupRef.current.getWorldPosition(tmp.world);
            tmp.to.copy(tmp.world).sub(beamRef.current.origin);
            const dist = tmp.to.length();
            if (dist > 0.001) {
                const angle = tmp.to.multiplyScalar(1 / dist).angleTo(beamRef.current.dir);
                inBeam = angle < beamRef.current.halfAngle;
            }
        }
        ping.current += ((inBeam ? 1 : 0) - ping.current) * Math.min(delta * (inBeam ? 10 : 2.5), 1);

        const scaleFactor = isHovered ? 1.85 : 1 + ping.current * 0.45;
        if (meshRef.current) {
            easing.damp3(meshRef.current.scale, [scaleFactor, scaleFactor, scaleFactor], 0.15, delta);
            meshRef.current.rotation.y += delta * 0.2;
        }

        if (matRef.current) {
            let targetEmissive = 1.1 + ping.current * 2.2;
            if (isHovered) targetEmissive = 3.5;
            else if (hasActiveHover) targetEmissive = 0.35;
            easing.damp(matRef.current, "emissiveIntensity", targetEmissive, 0.15, delta);
        }

        // Ring: shows on hover and when the beam finds this station
        const ringWeight = Math.max(hoverWeight.current, ping.current * 0.8);
        if (ringRef.current) {
            const pulse = 1 + Math.sin(time * 3.5) * 0.15;
            const ringScale = (0.5 + ringWeight * 0.9) * pulse;
            ringRef.current.scale.set(ringScale, ringScale, ringScale);
        }
        if (ringMatRef.current) ringMatRef.current.opacity = ringWeight * 0.6;
        if (lineMatRef.current) lineMatRef.current.opacity = hoverWeight.current * 0.7;
    });

    const status = AVAILABILITY[station.inventoryStatus] || AVAILABILITY.AVAILABLE;
    const place = [station.city, station.state].filter(Boolean).join(", ") || "Nigeria";

    return (
        <group ref={groupRef} position={position}>
            <mesh ref={meshRef}>
                <icosahedronGeometry args={[station.placeholder ? 0.06 : 0.09, 2]} />
                <meshStandardMaterial
                    ref={matRef}
                    color={station.color}
                    emissive={station.color}
                    emissiveIntensity={1.1}
                    toneMapped={false}
                    roughness={0.2}
                    metalness={0.6}
                />
            </mesh>
            {/* Invisible hit area, larger than the point, so markers are easy to hover.
                Clicking goes to the stations page (signed-out visitors land on sign-in). */}
            {interactive && (
                <mesh
                    onPointerOver={(e) => { e.stopPropagation(); onHover(station.id); }}
                    onPointerOut={(e) => { e.stopPropagation(); onHover(null); }}
                    onClick={(e) => { e.stopPropagation(); window.location.assign("/stations"); }}
                >
                    <sphereGeometry args={[0.22, 12, 12]} />
                    <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
            )}

            <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
                <ringGeometry args={[0.12, 0.15, 32]} />
                <meshBasicMaterial ref={ringMatRef} color={station.color} transparent opacity={0} side={2} toneMapped={false} />
            </mesh>

            {interactive && (
                <>
                    <Billboard>
                        <line>
                            <bufferGeometry>
                                <bufferAttribute
                                    attach="attributes-position"
                                    args={[new Float32Array([0, 0, 0, ...TOOLTIP_ANCHOR]), 3]}
                                />
                            </bufferGeometry>
                            <lineBasicMaterial ref={lineMatRef} color={station.color} transparent opacity={0} toneMapped={false} />
                        </line>
                    </Billboard>

                    <Html position={TOOLTIP_ANCHOR} distanceFactor={7} zIndexRange={[100, 0]} style={{ pointerEvents: "none" }}>
                        <div
                            style={{
                                ...tooltipStyle,
                                opacity: isHovered ? 1 : 0,
                                transform: isHovered ? "translate(0px, 0px) scale(1)" : "translate(-8px, 12px) scale(0.92)",
                                transition: "opacity 0.25s ease, transform 0.25s ease",
                            }}
                        >
                            <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", color: "#6ee7b7", marginBottom: "4px" }}>
                                SIGNAL LOCKED
                            </div>
                            <div style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff", marginBottom: "6px" }}>
                                {station.name}
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "14px", marginBottom: "4px", color: "rgba(255,255,255,0.8)" }}>
                                <span>{titleCase(station.type)}</span>
                                <span>{place}</span>
                            </div>
                            <div style={{ fontWeight: 600, color: "#ffffff", marginBottom: "6px" }}>{formatPrice(station.pricing)}</div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "14px" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: status.color, fontWeight: 600 }}>
                                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: status.color, boxShadow: `0 0 6px ${status.color}` }} />
                                    {status.label}
                                </span>
                                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px" }}>Click to book</span>
                            </div>
                        </div>
                    </Html>
                </>
            )}
        </group>
    );
}

export default memo(StationMarker);
