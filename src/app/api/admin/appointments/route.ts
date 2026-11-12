import { createAppointmentInputSchema, dayQuerySchema } from "@/domain/appointments/appointment";
import { authenticateAdmin } from "@/server/auth/admin-context";
import {
  errorResponse,
  parseBody,
  parseQuery,
  respond,
} from "@/server/appointments/appointment-http";
import { createFirestoreAppointmentsRepository } from "@/server/appointments/firestore-appointments-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const route = "/api/admin/appointments";
export async function GET(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const query = parseQuery(request, dayQuerySchema);
    return respond(await createFirestoreAppointmentsRepository().getDay(admin.salonId, query.date));
  } catch (error) {
    return errorResponse(route, error);
  }
}
export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const input = await parseBody(request, createAppointmentInputSchema);
    const result = await createFirestoreAppointmentsRepository().reserve(
      admin.salonId,
      admin.userId,
      input,
    );
    return respond(result, result.replayed ? 200 : 201);
  } catch (error) {
    return errorResponse(route, error);
  }
}
