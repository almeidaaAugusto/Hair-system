import { ClientsAdminPage } from "@/features/admin-clients/clients-admin-page";
import { requireAdminSession } from "@/server/auth/admin-page-session";

export const metadata = { title: "Clientes | Sistema Cabelo" };

export default async function ClientsPage() {
  await requireAdminSession();
  return <ClientsAdminPage />;
}
