import { z } from "zod";
import { AppointmentRuleError } from "@/domain/appointments/appointment";
import { AuthorizationError } from "@/server/auth/admin-context";
import { RequestGuardError, assertJsonContentType } from "@/server/http/request-guards";
import { logUnexpectedServerError } from "@/server/observability/log-unexpected-server-error";

class InputError extends Error {
  constructor(readonly status: 400 | 422) {
    super();
  }
}
export function respond(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new InputError(422);
  return result.data;
}
export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  assertJsonContentType(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new InputError(400);
    throw error;
  }
  return parseInput(schema, body);
}
export function parseQuery<T>(request: Request, schema: z.ZodType<T>): T {
  const params = new URL(request.url).searchParams;
  const entries: Record<string, string> = Object.create(null);
  for (const [key, value] of params) {
    if (Object.hasOwn(entries, key)) throw new InputError(422);
    entries[key] = value;
  }
  return parseInput(schema, entries);
}
export function errorResponse(route: string, error: unknown): Response {
  if (error instanceof AuthorizationError) return respond({ error: error.message }, error.status);
  if (error instanceof RequestGuardError) return respond({ error: error.message }, error.status);
  if (error instanceof InputError)
    return respond(
      { error: error.status === 400 ? "JSON inválido." : "Dados inválidos." },
      error.status,
    );
  if (error instanceof AppointmentRuleError) {
    const status =
      error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_TIME_RANGE" ? 422 : 409;
    const overridable =
      error.code === "OUTSIDE_BUSINESS_HOURS" || error.code === "SERVICE_REQUIRES_EVALUATION";
    return respond(
      {
        error: "Não foi possível concluir a operação.",
        code: error.code,
        ...(overridable ? { overridable: true } : {}),
      },
      status,
    );
  }
  logUnexpectedServerError(route, error);
  return respond({ error: "Não foi possível concluir a operação." }, 500);
}
