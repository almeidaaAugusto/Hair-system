import { availabilityQuerySchema } from "@/domain/appointments/appointment";
import { authenticateAdmin } from "@/server/auth/admin-context";
import { errorResponse, parseQuery, respond } from "@/server/appointments/appointment-http";
import { createFirestoreAppointmentsRepository } from "@/server/appointments/firestore-appointments-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const query = parseQuery(request, availabilityQuerySchema);
    return respond(
      await createFirestoreAppointmentsRepository().getAvailability(admin.salonId, query),
    );
  } catch (error) {
    return errorResponse("/api/admin/appointments/availability", error);
  }
}
