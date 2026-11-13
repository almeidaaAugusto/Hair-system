import { clientLookupQuerySchema } from "@/domain/clients/client";
import { errorResponse, parseQuery, respond } from "@/server/appointments/appointment-http";
import { authenticateAdmin } from "@/server/auth/admin-context";
import { createFirestoreClientsRepository } from "@/server/clients/firestore-clients-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const { phone } = parseQuery(request, clientLookupQuerySchema);
    const client = await createFirestoreClientsRepository().findByPhone(admin.salonId, phone);
    if (!client) return respond({ error: "Cliente não encontrada.", code: "NOT_FOUND" }, 404);
    // Only what the booking form needs: notes and chemical history stay out of this route.
    return respond({ client: { id: client.id, name: client.name } });
  } catch (error) {
    return errorResponse("/api/admin/clients/lookup", error);
  }
}
