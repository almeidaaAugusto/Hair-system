import { ZodError } from "zod";

import { AuthorizationError, authenticateAdmin } from "@/server/auth/admin-context";
import {
  getBusinessHoursConfiguration,
  updateBusinessHours,
} from "@/server/business-hours/configure-business-hours";
import { createFirestoreBusinessHoursRepository } from "@/server/business-hours/business-hours-repository";
import { noStoreJson } from "@/server/http/json-response";
import { RequestGuardError, readJsonBody } from "@/server/http/request-guards";
import { logUnexpectedServerError } from "@/server/observability/log-unexpected-server-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return noStoreJson({ error: error.message }, error.status);
  }
  if (error instanceof RequestGuardError) {
    return noStoreJson({ error: error.message }, error.status);
  }
  if (error instanceof ZodError) {
    return noStoreJson({ error: "Dados do expediente inválidos.", details: error.flatten() }, 422);
  }
  if (error instanceof SyntaxError) {
    return noStoreJson({ error: "Corpo da requisição inválido." }, 400);
  }
  logUnexpectedServerError("/api/admin/business-hours", error);
  return noStoreJson({ error: "Não foi possível concluir a operação." }, 500);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const businessHours = await getBusinessHoursConfiguration(
      admin,
      createFirestoreBusinessHoursRepository(),
    );
    return noStoreJson({ businessHours });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const input = await readJsonBody(request);
    const businessHours = await updateBusinessHours(
      input,
      admin,
      createFirestoreBusinessHoursRepository(),
    );
    return noStoreJson({ businessHours });
  } catch (error) {
    return errorResponse(error);
  }
}
