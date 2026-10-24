"use client";
import StatCard from "./StatCard";

const stats = [

    {
        value: 36,
        suffix: "+",
        label: "States Covered",
    },

    {
        value: 1250,
        suffix: "+",
        label: "Media Stations",
    },

    {
        value: 4,
        suffix: "",
        label: "Media Types",
    },

];
export default function StatsGrid() {

    return (

        <div
            className="
                grid
                gap-6
                sm:grid-cols-2
                xl:grid-cols-1
            "
        >

            {

                stats.map((stat) => (

                    <StatCard

                        key={stat.label}

                        value={stat.value}

                        suffix={stat.suffix}

                        label={stat.label}

                    />

                ))

            }

        </div>

    );

}