import { createClientInputSchema } from "@/domain/clients/client";
import { errorResponse, parseBody, respond } from "@/server/appointments/appointment-http";
import { authenticateAdmin } from "@/server/auth/admin-context";
import { createFirestoreClientsRepository } from "@/server/clients/firestore-clients-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const route = "/api/admin/clients";

export async function GET(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    return respond({ clients: await createFirestoreClientsRepository().list(admin.salonId) });
  } catch (error) {
    return errorResponse(route, error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const input = await parseBody(request, createClientInputSchema);
    const result = await createFirestoreClientsRepository().create(
      admin.salonId,
      admin.userId,
      input,
    );
    return respond(result, result.replayed ? 200 : 201);
  } catch (error) {
    return errorResponse(route, error);
  }
}
