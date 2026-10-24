"use client";

import { useLayoutEffect } from "react";
import gsap from "gsap";

export default function usePricingCardEffects() {

    useLayoutEffect(() => {

        const cards = document.querySelectorAll(".pricing-card");

        cards.forEach((card) => {

            const glow = card.querySelector(".pricing-glow");

            function move(e) {

                const rect = card.getBoundingClientRect();

                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const rotateY = ((x / rect.width) - 0.5) * 14;
                const rotateX = ((y / rect.height) - 0.5) * -14;

                gsap.to(card, {

                    rotateX,
                    rotateY,
                    y: -12,
                    duration: 0.35,
                    ease: "power2.out",

                });

                if (glow) {

                    gsap.to(glow, {

                        x: x - rect.width / 2,
                        y: y - rect.height / 2,
                        opacity: 1,
                        duration: 0.25,

                    });

                }

            }

            function leave() {

                gsap.to(card, {

                    rotateX: 0,
                    rotateY: 0,
                    y: 0,
                    duration: 0.45,
                    ease: "power3.out",

                });

                if (glow) {

                    gsap.to(glow, {

                        opacity: 0,
                        x: 0,
                        y: 0,
                        duration: 0.3,

                    });

                }

            }

            card.addEventListener("mousemove", move);
            card.addEventListener("mouseleave", leave);

        });

    }, []);

}