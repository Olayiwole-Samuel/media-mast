"use client";

import FeatureCard from "./FeatureCard";
import { features } from "./data/features";

export default function FeaturesGrid() {
    return (
        <div
            className="
                mt-16 sm:mt-24
                grid grid-cols-1 gap-8
                md:grid-cols-2
                xl:grid-cols-3
                items-stretch
            "
        >
            {features.map((feature) => (
                <FeatureCard
                    key={feature.id || feature.title}
                    icon={feature.icon}
                    title={feature.title}
                    description={feature.description}
                />
            ))}
        </div>
    );
}