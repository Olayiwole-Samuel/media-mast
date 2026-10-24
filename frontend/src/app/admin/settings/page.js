import { redirect } from "next/navigation";

// Platform settings (fee, payment provider, email) are environment settings on the server, not edited here.
export default function Page() {
    redirect("/admin/dashboard");
}
