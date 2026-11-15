import { redirect } from "next/navigation";

// Team logins are switched off: each company signs in with its owner only.
export default function TeamSwitchedOff() {
    redirect("/company/dashboard");
}
