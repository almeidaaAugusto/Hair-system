import { AgendaAdminPage } from "@/features/admin-agenda/agenda-admin-page";
import { requireAdminSession } from "@/server/auth/admin-page-session";

export const metadata = { title: "Agenda | Sistema Cabelo" };

export default async function AgendaPage() {
  await requireAdminSession();
  return <AgendaAdminPage />;
}
