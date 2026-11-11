import { BusinessHoursAdminPage } from "@/features/admin-business-hours/business-hours-admin-page";
import { requireAdminSession } from "@/server/auth/admin-page-session";

export const metadata = { title: "Expediente | Sistema Cabelo" };

export default async function BusinessHoursPage() {
  await requireAdminSession();
  return <BusinessHoursAdminPage />;
}
