import { redirect } from "next/navigation";

// Campaigns are created from the Campaigns page ("Create campaign").
export default function Page() {
    redirect("/campaigns");
}
