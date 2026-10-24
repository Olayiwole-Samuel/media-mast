"use client";

import { useLayoutEffect } from "react";
import gsap from "gsap";

export default function useAuroraAnimation() {

    useLayoutEffect(() => {

        gsap.to(".aurora-one", {

            x: 80,
            y: -40,

            duration: 18,

            repeat: -1,

            yoyo: true,

            ease: "sine.inOut",

        });

        gsap.to(".aurora-two", {

            x: -60,
            y: 50,

            duration: 22,

            repeat: -1,

            yoyo: true,

            ease: "sine.inOut",

        });

        gsap.to(".aurora-three", {

            x: 40,
            y: -30,

            duration: 16,

            repeat: -1,

            yoyo: true,

            ease: "sine.inOut",

        });

    }, []);

}