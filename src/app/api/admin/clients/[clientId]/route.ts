import { documentIdSchema } from "@/domain/appointments/appointment";
import { updateClientInputSchema } from "@/domain/clients/client";
import { summarizeClientHistory } from "@/domain/clients/history";
import {
  errorResponse,
  parseBody,
  parseInput,
  respond,
} from "@/server/appointments/appointment-http";
import { createFirestoreAppointmentsRepository } from "@/server/appointments/firestore-appointments-repository";
import { authenticateAdmin } from "@/server/auth/admin-context";
import { createFirestoreClientsRepository } from "@/server/clients/firestore-clients-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const route = "/api/admin/clients/[clientId]";
type Context = { params: Promise<{ clientId: string }> };

export async function GET(request: Request, context: Context): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const id = parseInput(documentIdSchema, (await context.params).clientId);
    const client = await createFirestoreClientsRepository().get(admin.salonId, id);
    const appointments = await createFirestoreAppointmentsRepository().listByClient(
      admin.salonId,
      client.id,
    );
    const summary = summarizeClientHistory(appointments, new Date().toISOString());
    return respond({ client, appointments, summary });
  } catch (error) {
    return errorResponse(route, error);
  }
}

export async function PATCH(request: Request, context: Context): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const id = parseInput(documentIdSchema, (await context.params).clientId);
    const input = await parseBody(request, updateClientInputSchema);
    const client = await createFirestoreClientsRepository().update(
      admin.salonId,
      admin.userId,
      id,
      input,
    );
    return respond({ client });
  } catch (error) {
    return errorResponse(route, error);
  }
}
