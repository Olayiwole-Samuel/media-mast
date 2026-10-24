"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────
// Satellite dish antenna that "searches for signal".
//
// While nothing is hovered it sweeps around and nods up and down with a
// small hunting jitter, and its scanning beam is amber. When a station is
// hovered (`target` = that marker's position) it swings round and locks on:
// the beam narrows, turns green and the feed LED stops blinking.
//
// Every frame it writes the beam's origin and direction into `beamRef`, so
// station markers can light up as the beam sweeps past them.
// ─────────────────────────────────────────────────────────────

const PIVOT_Y = 0.95; // top of the mast, where the dish turns
const DISH_RADIUS = 0.85;
const DISH_DEPTH = 0.32;
const FOCAL = (DISH_RADIUS * DISH_RADIUS) / (4 * DISH_DEPTH); // focus of the paraboloid
const BEAM_LENGTH = 7;

const AMBER = new THREE.Color("#e8a33d");
const GREEN = new THREE.Color("#34d399");
const WAVE_COUNT = 3;

// Shortest signed difference between two angles.
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export default function Scene({ target = null, beamRef }) {
    const yawRef = useRef(null);
    const pitchRef = useRef(null);
    const beamMatRef = useRef(null);
    const coreMatRef = useRef(null);
    const ledRef = useRef(null);
    const ledMatRef = useRef(null);
    const ledLightRef = useRef(null);
    const waveRefs = useRef([]);

    const aim = useRef({ yaw: 0, elevation: 0.3, lock: 0 });
    const color = useMemo(() => new THREE.Color(), []);
    const tmp = useMemo(() => ({ origin: new THREE.Vector3(), dir: new THREE.Vector3() }), []);

    // Paraboloid dish surface (opens along +Y in its own frame).
    const dishGeometry = useMemo(() => {
        const points = [];
        for (let i = 0; i <= 24; i++) {
            const r = (i / 24) * DISH_RADIUS;
            points.push(new THREE.Vector2(r, (r * r) / (4 * FOCAL)));
        }
        return new THREE.LatheGeometry(points, 64);
    }, []);

    useFrame((state, delta) => {
        const t = state.clock.elapsedTime;
        const a = aim.current;
        const locked = !!target;

        // ── Where to point ──
        let goalYaw;
        let goalElevation;
        if (locked) {
            const dx = target[0];
            const dy = target[1] - PIVOT_Y;
            const dz = target[2];
            goalYaw = Math.atan2(dx, dz);
            goalElevation = Math.atan2(dy, Math.hypot(dx, dz));
        } else {
            // Slow sweep around + nodding, with a small "hunting" jitter.
            goalYaw = t * 0.32 + Math.sin(t * 0.9) * 0.45 + Math.sin(t * 7.3) * 0.025;
            goalElevation = 0.28 + Math.sin(t * 0.55) * 0.22 + Math.sin(t * 5.1) * 0.02;
        }

        const speed = locked ? 6 : 2.5;
        a.yaw += angleDelta(a.yaw, goalYaw) * Math.min(delta * speed, 1);
        a.elevation += (goalElevation - a.elevation) * Math.min(delta * speed, 1);
        a.lock += ((locked ? 1 : 0) - a.lock) * Math.min(delta * 5, 1);

        if (yawRef.current) yawRef.current.rotation.y = a.yaw;
        // The dish axis (+Y) tilts towards +Z by (90° − elevation).
        if (pitchRef.current) pitchRef.current.rotation.x = Math.PI / 2 - a.elevation;

        // ── Beam colour, width and brightness ──
        color.copy(AMBER).lerp(GREEN, a.lock);
        if (beamMatRef.current) {
            beamMatRef.current.color.copy(color);
            beamMatRef.current.opacity = 0.07 + a.lock * 0.08 + Math.sin(t * 3) * 0.015;
        }
        if (coreMatRef.current) {
            coreMatRef.current.color.copy(color);
            coreMatRef.current.opacity = 0.18 + a.lock * 0.35;
        }

        // Feed LED: blinks while searching, steady when locked.
        const blink = locked ? 1 : (Math.sin(t * 9) > 0.2 ? 1 : 0.25);
        if (ledMatRef.current) {
            ledMatRef.current.color.copy(color);
            ledMatRef.current.emissive.copy(color);
            ledMatRef.current.emissiveIntensity = 1.5 + blink * 2.5;
        }
        if (ledLightRef.current) {
            ledLightRef.current.color.copy(color);
            ledLightRef.current.intensity = 1 + blink * 4;
        }
        if (ledRef.current) ledRef.current.scale.setScalar(0.9 + blink * 0.2);

        // Signal waves travelling out along the beam (faster when locked).
        waveRefs.current.forEach((wave, i) => {
            if (!wave) return;
            const phase = (t * (0.45 + a.lock * 0.5) + i / WAVE_COUNT) % 1;
            const s = 0.25 + phase * 1.6;
            wave.scale.set(s, s, s);
            wave.position.y = FOCAL + phase * 3.2;
            wave.material.color.copy(color);
            wave.material.opacity = (1 - phase) * (0.35 + a.lock * 0.35);
        });

        // ── Publish the beam for the station markers ──
        if (beamRef && pitchRef.current) {
            pitchRef.current.updateWorldMatrix(true, false);
            pitchRef.current.getWorldPosition(tmp.origin);
            tmp.dir.set(0, 1, 0).transformDirection(pitchRef.current.matrixWorld);
            beamRef.current.origin.copy(tmp.origin);
            beamRef.current.dir.copy(tmp.dir);
            beamRef.current.halfAngle = 0.24 - a.lock * 0.12;
            beamRef.current.locked = locked;
        }
    });

    const metal = { color: "#1a1f29", metalness: 0.9, roughness: 0.25 };

    return (
        <group>
            {/* Base platform */}
            <mesh position={[0, -1.18, 0]} receiveShadow>
                <cylinderGeometry args={[2.6, 2.8, 0.16, 64]} />
                <meshStandardMaterial color="#0b0f16" metalness={0.75} roughness={0.3} />
            </mesh>

            {/* Tripod legs + mast */}
            {[0, 1, 2].map((i) => {
                const ang = (i / 3) * Math.PI * 2;
                return (
                    <mesh
                        key={i}
                        position={[Math.cos(ang) * 0.42, -0.72, Math.sin(ang) * 0.42]}
                        rotation={[Math.sin(ang) * 0.55, 0, -Math.cos(ang) * 0.55]}
                        castShadow
                    >
                        <cylinderGeometry args={[0.025, 0.035, 1.05, 8]} />
                        <meshStandardMaterial {...metal} />
                    </mesh>
                );
            })}
            <mesh position={[0, -0.1, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.08, 2.1, 16]} />
                <meshStandardMaterial {...metal} />
            </mesh>

            {/* Turning head */}
            <group ref={yawRef} position={[0, PIVOT_Y, 0]}>
                {/* Yoke */}
                <mesh position={[0, -0.04, 0]} castShadow>
                    <cylinderGeometry args={[0.14, 0.14, 0.1, 24]} />
                    <meshStandardMaterial color="#0f141c" metalness={0.85} roughness={0.2} />
                </mesh>

                <group ref={pitchRef}>
                    {/* Dish (opens along +Y) */}
                    <mesh geometry={dishGeometry} castShadow>
                        <meshStandardMaterial
                            color="#4a5563"
                            metalness={0.7}
                            roughness={0.45}
                            envMapIntensity={0.35}
                            side={THREE.DoubleSide}
                        />
                    </mesh>

                    {/* Rim */}
                    <mesh position={[0, DISH_DEPTH, 0]} rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[DISH_RADIUS, 0.018, 8, 64]} />
                        <meshStandardMaterial color="#5b6675" metalness={0.85} roughness={0.3} envMapIntensity={0.4} />
                    </mesh>

                    {/* Feed struts from the rim to the focus */}
                    {[0, 1, 2].map((i) => {
                        const ang = (i / 3) * Math.PI * 2;
                        const from = new THREE.Vector3(Math.cos(ang) * DISH_RADIUS, DISH_DEPTH, Math.sin(ang) * DISH_RADIUS);
                        const to = new THREE.Vector3(0, FOCAL, 0);
                        const mid = from.clone().add(to).multiplyScalar(0.5);
                        const length = from.distanceTo(to);
                        const quat = new THREE.Quaternion().setFromUnitVectors(
                            new THREE.Vector3(0, 1, 0),
                            to.clone().sub(from).normalize()
                        );
                        return (
                            <mesh key={i} position={mid} quaternion={quat}>
                                <cylinderGeometry args={[0.008, 0.008, length, 6]} />
                                <meshStandardMaterial color="#8a96a3" metalness={0.9} roughness={0.25} />
                            </mesh>
                        );
                    })}

                    {/* Feed horn + LED at the focus */}
                    <mesh position={[0, FOCAL - 0.05, 0]}>
                        <cylinderGeometry args={[0.04, 0.06, 0.12, 16]} />
                        <meshStandardMaterial color="#1a1f29" metalness={0.8} roughness={0.25} />
                    </mesh>
                    <mesh ref={ledRef} position={[0, FOCAL + 0.03, 0]}>
                        <sphereGeometry args={[0.045, 16, 16]} />
                        <meshStandardMaterial
                            ref={ledMatRef}
                            color="#e8a33d"
                            emissive="#e8a33d"
                            emissiveIntensity={3}
                            toneMapped={false}
                        />
                    </mesh>
                    <pointLight ref={ledLightRef} position={[0, FOCAL + 0.05, 0]} color="#e8a33d" intensity={4} distance={4} decay={2} />

                    {/* Scanning beam: a soft cone from the focus outwards */}
                    <mesh position={[0, FOCAL + BEAM_LENGTH / 2, 0]} rotation={[Math.PI, 0, 0]}>
                        <coneGeometry args={[BEAM_LENGTH * 0.24, BEAM_LENGTH, 48, 1, true]} />
                        <meshBasicMaterial
                            ref={beamMatRef}
                            color="#e8a33d"
                            transparent
                            opacity={0.08}
                            depthWrite={false}
                            blending={THREE.AdditiveBlending}
                            side={THREE.DoubleSide}
                            toneMapped={false}
                        />
                    </mesh>
                    <mesh position={[0, FOCAL + BEAM_LENGTH / 2, 0]} rotation={[Math.PI, 0, 0]}>
                        <coneGeometry args={[BEAM_LENGTH * 0.05, BEAM_LENGTH, 24, 1, true]} />
                        <meshBasicMaterial
                            ref={coreMatRef}
                            color="#e8a33d"
                            transparent
                            opacity={0.2}
                            depthWrite={false}
                            blending={THREE.AdditiveBlending}
                            side={THREE.DoubleSide}
                            toneMapped={false}
                        />
                    </mesh>

                    {/* Signal waves leaving the dish */}
                    {Array.from({ length: WAVE_COUNT }).map((_, i) => (
                        <mesh
                            key={i}
                            ref={(el) => (waveRefs.current[i] = el)}
                            rotation={[Math.PI / 2, 0, 0]}
                        >
                            <torusGeometry args={[0.35, 0.008, 8, 64]} />
                            <meshBasicMaterial
                                color="#e8a33d"
                                transparent
                                opacity={0.3}
                                depthWrite={false}
                                toneMapped={false}
                                side={THREE.DoubleSide}
                            />
                        </mesh>
                    ))}
                </group>
            </group>
        </group>
    );
}
