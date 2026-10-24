"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

function pseudoRandom(index, seed) {
    const value = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453;
    return value - Math.floor(value);
}

const stars = Array.from({ length: 120 }, (_, index) => ({
    left: pseudoRandom(index, 1) * 100,
    top: pseudoRandom(index, 2) * 100,
    size: pseudoRandom(index, 3) * 3 + 1,
    opacity: pseudoRandom(index, 4),
}));

export default function Stars() {

    const containerRef = useRef(null);

    useEffect(() => {

        const nodes = containerRef.current.children;

        Array.from(nodes).forEach((star) => {

            gsap.to(star, {

                x: gsap.utils.random(-120, 120),
                y: gsap.utils.random(-80, 80),

                duration: gsap.utils.random(18, 40),

                repeat: -1,

                yoyo: true,

                ease: "sine.inOut",

            });

            gsap.to(star, {

                opacity: gsap.utils.random(.2, 1),

                duration: gsap.utils.random(2, 5),

                repeat: -1,

                yoyo: true,

            });

        });

    }, []);

    return (

        <div
            ref={containerRef}
            className="absolute inset-0 overflow-hidden pointer-events-none"
        >

            {stars.map((star, index) => (

                <span

                    key={index}

                    className="absolute rounded-full bg-white"

                    style={{

                        left: `${star.left.toFixed(2)}%`,
                        top: `${star.top.toFixed(2)}%`,
                        width: `${star.size.toFixed(2)}px`,
                        height: `${star.size.toFixed(2)}px`,
                        opacity: Number(star.opacity.toFixed(2)),
                    }}

                />

            ))}

        </div>

    );

}
