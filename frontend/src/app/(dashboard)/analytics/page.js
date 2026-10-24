import { redirect } from "next/navigation";

// Market and platform spend now live on the Spend insights page.
export default function Page() {
    redirect("/insights");
}
