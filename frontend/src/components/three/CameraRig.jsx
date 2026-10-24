"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { easing } from "maath";

export default function CameraRig() {
    const { camera, pointer } = useThree();

    useFrame((state, delta) => {
        const time = state.clock.elapsedTime;

        const idleX =
            Math.sin(time * 0.18) * 0.6;

        const idleY =
            Math.cos(time * 0.22) * 0.25;

        const targetX =
            idleX + pointer.x * 0.8;

        const targetY =
            idleY + pointer.y * 0.45;

        const targetZ =
            6 + Math.sin(time * 0.15) * 0.25;

        easing.damp3(
            camera.position,
            [targetX, targetY, targetZ],
            0.18,
            delta
        );

        camera.lookAt(0, 0, 0);
    });

    return null;
}