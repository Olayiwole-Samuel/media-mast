"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

const deterministicRandom = (seed) => {
    const value = Math.sin(seed) * 10000;
    return value - Math.floor(value);
};

export default function Particles() {
    const pointsRef = useRef(null);

    const positions = useMemo(() => {
        const count = 300;
        const array = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            array[i * 3] = (deterministicRandom(i * 3 + 1) - 0.5) * 12;
            array[i * 3 + 1] = (deterministicRandom(i * 3 + 2) - 0.5) * 8;
            array[i * 3 + 2] = (deterministicRandom(i * 3 + 3) - 0.5) * 8;
        }

        return array;
    }, []);

    useFrame((state, delta) => {
        if (!pointsRef.current) return;

        // Frame-rate independent rotation using delta time
        pointsRef.current.rotation.y += delta * 0.015;
        // Subtle vertical oscillation using total elapsed time
        pointsRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[positions, 3]}
                />
            </bufferGeometry>

            <pointsMaterial
                size={0.03}
                color="#9fffe0"
                transparent
                opacity={0.35}
                sizeAttenuation
                depthWrite={false}
                blending={2} // AdditiveBlending for glowing dust particles
            />
        </points>
    );
}