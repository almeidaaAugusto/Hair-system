import { createTimeBlockInputSchema } from "@/domain/appointments/appointment";
import { authenticateAdmin } from "@/server/auth/admin-context";
import { errorResponse, parseBody, respond } from "@/server/appointments/appointment-http";
import { createFirestoreAppointmentsRepository } from "@/server/appointments/firestore-appointments-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const input = await parseBody(request, createTimeBlockInputSchema);
    const result = await createFirestoreAppointmentsRepository().createBlock(
      admin.salonId,
      admin.userId,
      input,
    );
    return respond(result, result.replayed ? 200 : 201);
  } catch (error) {
    return errorResponse("/api/admin/time-blocks", error);
  }
}
