import { rescheduleInputSchema, documentIdSchema } from "@/domain/appointments/appointment";
import { authenticateAdmin } from "@/server/auth/admin-context";
import {
  errorResponse,
  parseBody,
  parseInput,
  respond,
} from "@/server/appointments/appointment-http";
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
    const input = await parseBody(request, rescheduleInputSchema);
    const appointment = await createFirestoreAppointmentsRepository().reschedule(
      admin.salonId,
      admin.userId,
      id,
      input,
    );
    return respond({ appointment });
  } catch (error) {
    return errorResponse("/api/admin/appointments/[appointmentId]/reschedule", error);
  }
}
