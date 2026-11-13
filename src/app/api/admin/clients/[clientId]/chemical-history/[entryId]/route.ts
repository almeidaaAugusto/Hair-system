import { documentIdSchema } from "@/domain/appointments/appointment";
import { errorResponse, parseInput, respond } from "@/server/appointments/appointment-http";
import { authenticateAdmin } from "@/server/auth/admin-context";
import { createFirestoreClientsRepository } from "@/server/clients/firestore-clients-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ clientId: string; entryId: string }> },
): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const params = await context.params;
    const client = await createFirestoreClientsRepository().removeChemicalEntry(
      admin.salonId,
      admin.userId,
      parseInput(documentIdSchema, params.clientId),
      parseInput(documentIdSchema, params.entryId),
    );
    return respond({ client });
  } catch (error) {
    return errorResponse("/api/admin/clients/[clientId]/chemical-history/[entryId]", error);
  }
}
