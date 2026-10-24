export default function MediaCategoryCard({
    icon,
    title,
    stations,
}) {
    return (
        <div
            className="
                group
                rounded-3xl
                border
                border-white/10
                bg-white/[0.03]
                p-8
                backdrop-blur-xl
                transition-all
                duration-500
                hover:-translate-y-2
                hover:border-emerald-400/60 hover:bg-white/[0.05]
                hover:shadow-[0_20px_60px_rgba(16,185,129,.12)]
            "
        >
            <div className="mb-6 flex items-center gap-4">

                <div
                    className="
                        flex
                        h-14
                        w-14
                        items-center
                        justify-center
                        rounded-2xl
                        bg-emerald-500/10
                        text-emerald-400
                        transition-all
                        duration-500
                        group-hover:scale-110
                        group-hover:rotate-6
                    "
                >
                    {icon}
                </div>

                <h3 className="text-2xl font-bold text-white">
                    {title}
                </h3>

            </div>

            <ul className="space-y-4">

                {stations.map((station) => (

                    <li
                        key={station}
                        className="
                            flex
                            items-center
                            gap-3
                            text-slate-300
                            transition-colors
                            duration-300
                            group-hover:text-white
                        "
                    >
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />

                        {station}
                    </li>

                ))}

            </ul>

        </div>
    );
}