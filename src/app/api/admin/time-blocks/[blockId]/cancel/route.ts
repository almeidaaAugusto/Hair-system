import { documentIdSchema } from "@/domain/appointments/appointment";
import { authenticateAdmin } from "@/server/auth/admin-context";
import { errorResponse, parseInput, respond } from "@/server/appointments/appointment-http";
import { createFirestoreAppointmentsRepository } from "@/server/appointments/firestore-appointments-repository";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  context: { params: Promise<{ blockId: string }> },
): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const id = parseInput(documentIdSchema, (await context.params).blockId);
    const timeBlock = await createFirestoreAppointmentsRepository().cancelBlock(
      admin.salonId,
      admin.userId,
      id,
    );
    return respond({ timeBlock });
  } catch (error) {
    return errorResponse("/api/admin/time-blocks/[blockId]/cancel", error);
  }
}
