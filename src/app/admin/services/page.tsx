import { ServicesAdminPage } from "@/features/admin-services/services-admin-page";
import { requireAdminSession } from "@/server/auth/admin-page-session";

export const metadata = { title: "Serviços | Sistema Cabelo" };

export default async function ServicesPage() {
  await requireAdminSession();
  return <ServicesAdminPage />;
}
