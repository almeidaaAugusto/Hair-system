import { ZodError } from "zod";

import { AuthorizationError, authenticateAdmin } from "@/server/auth/admin-context";
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
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ServiceNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Dados do servi\u00e7o inv\u00e1lidos.", details: error.flatten() },
      { status: 422 },
    );
  }
  if (error instanceof SyntaxError) {
    return Response.json(
      { error: "Corpo da requisi\u00e7\u00e3o inv\u00e1lido." },
      { status: 400 },
    );
  }
  logUnexpectedServerError("/api/admin/services/[serviceId]", error);
  return Response.json(
    { error: "N\u00e3o foi poss\u00edvel concluir a opera\u00e7\u00e3o." },
    { status: 500 },
  );
}

export async function PATCH(request: Request, context: ServiceRouteContext): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const { serviceId } = await context.params;
    const input = await request.json();
    const service = await updateService(
      serviceId,
      input,
      admin,
      createFirestoreServicesRepository(),
    );
    return Response.json({ service });
  } catch (error) {
    return errorResponse(error);
  }
}
