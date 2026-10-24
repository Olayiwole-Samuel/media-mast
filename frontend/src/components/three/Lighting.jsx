"use client";

import { useRef } from "react";

export default function Lighting() {
    const dirLightRef = useRef(null);
    const spotLightRef = useRef(null);

    return (
        <>
            {/* Ambient Base */}
            <ambientLight intensity={0.18} />

            {/* Main Key Light with Shadow Map Fine-Tuning */}
            <directionalLight
                ref={dirLightRef}
                position={[8, 8, 6]}
                intensity={3.5}
                color="#ffffff"
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-camera-near={0.5}
                shadow-camera-far={25}
                shadow-camera-left={-6}
                shadow-camera-right={6}
                shadow-camera-top={6}
                shadow-camera-bottom={-6}
                shadow-bias={-0.0001}
            />

            {/* Amber Rim — Accent for depth & broadcast warmth */}
            <pointLight
                position={[-6, 2, 4]}
                intensity={30}
                color="#e8a33d"
                distance={15}
                decay={2}
            />

            {/* Teal Fill — Cool contrast accent */}
            <pointLight
                position={[5, -2, 5]}
                intensity={16}
                color="#14a89a"
                distance={12}
                decay={2}
            />

            {/* Overhead Spotlight with Controlled Shadow Frustum */}
            <spotLight
                ref={spotLightRef}
                position={[0, 9, 4]}
                angle={0.3}
                penumbra={1}
                intensity={40}
                color="#ffffff"
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-bias={-0.0001}
                distance={20}
                decay={2}
            />
        </>
    );
}