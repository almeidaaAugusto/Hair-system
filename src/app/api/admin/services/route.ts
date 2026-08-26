import { ZodError } from "zod";

import { AuthorizationError, authenticateAdmin } from "@/server/auth/admin-context";
import { logUnexpectedServerError } from "@/server/observability/log-unexpected-server-error";
import { createService, listServices } from "@/server/services/create-service";
import { createFirestoreServicesRepository } from "@/server/services/service-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Dados do serviço inválidos.", details: error.flatten() },
      { status: 422 },
    );
  }
  if (error instanceof SyntaxError) {
    return Response.json(
      { error: "Corpo da requisi\u00e7\u00e3o inv\u00e1lido." },
      { status: 400 },
    );
  }
  logUnexpectedServerError("/api/admin/services", error);
  return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const services = await listServices(admin, createFirestoreServicesRepository());
    return Response.json({ services });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const admin = await authenticateAdmin(request);
    const input = await request.json();
    const service = await createService(input, admin, createFirestoreServicesRepository());
    return Response.json({ service }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
