import { redirect } from "next/navigation";

// Departments are managed by each company owner; there is no platform-wide view.
export default function Page() {
    redirect("/admin/users/companies");
}
