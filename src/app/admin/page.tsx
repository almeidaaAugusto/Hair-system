import { redirect } from "next/navigation";

import { requireAdminSession } from "@/server/auth/admin-page-session";

export default async function AdminPage() {
  await requireAdminSession();
  redirect("/admin/agenda");
}
