import { redirect } from "next/navigation";

// The old analytics page now goes to the dashboard.
export default function Page() {
    redirect("/dashboard");
}
