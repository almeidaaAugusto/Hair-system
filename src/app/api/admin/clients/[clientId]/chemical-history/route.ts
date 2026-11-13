import { documentIdSchema } from "@/domain/appointments/appointment";
import { chemicalEntryInputSchema } from "@/domain/clients/client";
import {
  errorResponse,
  parseBody,
  parseInput,
  respond,
} from "@/server/appointments/appointment-http";
import { authenticateAdmin } from "@/server/auth/admin-context";
import { createFirestoreClientsRepository } from "@/server/clients/firestore-clients-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ clientId: string }> },
): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const id = parseInput(documentIdSchema, (await context.params).clientId);
    const input = await parseBody(request, chemicalEntryInputSchema);
    const result = await createFirestoreClientsRepository().addChemicalEntry(
      admin.salonId,
      admin.userId,
      id,
      input,
    );
    return respond(result, result.replayed ? 200 : 201);
  } catch (error) {
    return errorResponse("/api/admin/clients/[clientId]/chemical-history", error);
  }
}
