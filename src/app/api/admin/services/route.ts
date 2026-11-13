import { ZodError } from "zod";

import { AuthorizationError, authenticateAdmin } from "@/server/auth/admin-context";
import { noStoreJson } from "@/server/http/json-response";
import { RequestGuardError, readJsonBody } from "@/server/http/request-guards";
import { logUnexpectedServerError } from "@/server/observability/log-unexpected-server-error";
import { createService, listServices } from "@/server/services/create-service";
import { createFirestoreServicesRepository } from "@/server/services/service-repository";

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
    return noStoreJson({ error: "Dados do serviço inválidos.", details: error.flatten() }, 422);
  }
  if (error instanceof SyntaxError) {
    return noStoreJson({ error: "Corpo da requisi\u00e7\u00e3o inv\u00e1lido." }, 400);
  }
  logUnexpectedServerError("/api/admin/services", error);
  return noStoreJson({ error: "Não foi possível concluir a operação." }, 500);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const services = await listServices(admin, createFirestoreServicesRepository());
    return noStoreJson({ services });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const input = await readJsonBody(request);
    const service = await createService(input, admin, createFirestoreServicesRepository());
    return noStoreJson({ service }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
