"use client";

import { useEffect } from "react";
import gsap from "gsap";

export default function useCountUp(ref, endValue) {

    useEffect(() => {

        if (!ref.current) return;

        let hasAnimated = false;

        const observer = new IntersectionObserver(

            ([entry]) => {

                if (!entry.isIntersecting || hasAnimated) return;

                hasAnimated = true;

                const counter = {
                    value: 0,
                };

                gsap.to(counter, {

                    value: endValue,

                    duration: 2,

                    ease: "power2.out",

                    onUpdate: () => {

                        if (!ref.current) return;

                        ref.current.textContent =
                            Math.floor(counter.value).toLocaleString();

                    },

                });

                observer.disconnect();

            },

            {

                threshold: 0.4,

            }

        );

        observer.observe(ref.current);

        return () => observer.disconnect();

    }, [endValue, ref]);

}