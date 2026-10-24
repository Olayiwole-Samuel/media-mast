"use client";

import StationMarker from "./StationMarker";

// Spiral distribution so the markers spread around the antenna.
export function layoutStations(count) {
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    return Array.from({ length: count }, (_, i) => {
        const t = i / Math.max(count - 1, 1);
        const radius = 2.4 + t * 2.6;
        const angle = i * goldenAngle;
        const height = -0.3 + t * 2.6 + Math.sin(i * 12.5) * 0.35;

        return [Math.cos(angle) * radius, height, Math.sin(angle) * radius];
    });
}

// `stations`: real approved stations (from GET /api/v1/stations), or
// unlabelled placeholder points while there are none.
export default function Stations({ stations, positions, hoveredId, onHover, beamRef }) {
    return (
        <group>
            {stations.map((station, i) => (
                <StationMarker
                    key={station.id}
                    station={station}
                    position={positions[i]}
                    phase={i * 1.7}
                    isHovered={hoveredId === station.id}
                    hasActiveHover={hoveredId !== null}
                    onHover={onHover}
                    beamRef={beamRef}
                />
            ))}
        </group>
    );
}
