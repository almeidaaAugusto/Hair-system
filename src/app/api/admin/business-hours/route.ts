import { ZodError } from "zod";

import { AuthorizationError, authenticateAdmin } from "@/server/auth/admin-context";
import {
  getBusinessHoursConfiguration,
  updateBusinessHours,
} from "@/server/business-hours/configure-business-hours";
import { createFirestoreBusinessHoursRepository } from "@/server/business-hours/business-hours-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Dados do expediente inválidos.", details: error.flatten() },
      { status: 422 },
    );
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const businessHours = await getBusinessHoursConfiguration(
      admin,
      createFirestoreBusinessHoursRepository(),
    );
    return Response.json({ businessHours });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const input = await request.json();
    const businessHours = await updateBusinessHours(
      input,
      admin,
      createFirestoreBusinessHoursRepository(),
    );
    return Response.json({ businessHours });
  } catch (error) {
    return errorResponse(error);
  }
}
