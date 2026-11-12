import { documentIdSchema } from "@/domain/appointments/appointment";
import { authenticateAdmin } from "@/server/auth/admin-context";
import { errorResponse, parseInput, respond } from "@/server/appointments/appointment-http";
import { createFirestoreAppointmentsRepository } from "@/server/appointments/firestore-appointments-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ appointmentId: string }> },
): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const id = parseInput(documentIdSchema, (await context.params).appointmentId);
    const appointment = await createFirestoreAppointmentsRepository().markNoShow(
      admin.salonId,
      admin.userId,
      id,
    );
    return respond({ appointment });
  } catch (error) {
    return errorResponse("/api/admin/appointments/[appointmentId]/no-show", error);
  }
}
