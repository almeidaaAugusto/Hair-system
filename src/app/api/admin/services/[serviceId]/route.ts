import { ZodError } from "zod";

import { documentIdSchema } from "@/domain/appointments/appointment";
import { AuthorizationError, authenticateAdmin } from "@/server/auth/admin-context";
import { noStoreJson } from "@/server/http/json-response";
import { RequestGuardError, readJsonBody } from "@/server/http/request-guards";
import { logUnexpectedServerError } from "@/server/observability/log-unexpected-server-error";
import { updateService } from "@/server/services/create-service";
import {
  createFirestoreServicesRepository,
  ServiceNotFoundError,
} from "@/server/services/service-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ServiceRouteContext = {
  params: Promise<{ serviceId: string }>;
};

function errorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return noStoreJson({ error: error.message }, error.status);
  }
  if (error instanceof ServiceNotFoundError) {
    return noStoreJson({ error: error.message }, 404);
  }
  if (error instanceof RequestGuardError) {
    return noStoreJson({ error: error.message }, error.status);
  }
  if (error instanceof ZodError) {
    return noStoreJson(
      { error: "Dados do servi\u00e7o inv\u00e1lidos.", details: error.flatten() },
      422,
    );
  }
  if (error instanceof SyntaxError) {
    return noStoreJson({ error: "Corpo da requisi\u00e7\u00e3o inv\u00e1lido." }, 400);
  }
  logUnexpectedServerError("/api/admin/services/[serviceId]", error);
  return noStoreJson({ error: "N\u00e3o foi poss\u00edvel concluir a opera\u00e7\u00e3o." }, 500);
}

export async function PATCH(request: Request, context: ServiceRouteContext): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const parsedId = documentIdSchema.safeParse((await context.params).serviceId);
    if (!parsedId.success) return noStoreJson({ error: "Serviço não encontrado." }, 404);
    const serviceId = parsedId.data;
    const input = await readJsonBody(request);
    const service = await updateService(
      serviceId,
      input,
      admin,
      createFirestoreServicesRepository(),
    );
    return noStoreJson({ service });
  } catch (error) {
    return errorResponse(error);
  }
}
