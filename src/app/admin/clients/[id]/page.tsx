import { ClientDetailPage } from "@/features/admin-clients/client-detail-page";
import { requireAdminSession } from "@/server/auth/admin-page-session";

export const metadata = { title: "Ficha da cliente | Sistema Cabelo" };

export default async function ClientRecordPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminSession();
  const { id } = await params;
  return <ClientDetailPage clientId={id} />;
}
