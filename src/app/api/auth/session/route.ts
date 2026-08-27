import { NextResponse } from "next/server";

import { AuthorizationError, getBearerToken, verifyAdminIdToken } from "@/server/auth/admin-context";
import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSessionCookie,
  getAdminSessionCookieOptions,
} from "@/server/auth/admin-session";
import { logUnexpectedServerError } from "@/server/observability/log-unexpected-server-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AUTH_AGE_SECONDS = 5 * 60;

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new AuthorizationError("Requisição de sessão não autorizada.", 403);
  }
}

function errorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  logUnexpectedServerError("/api/auth/session", error);
  return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}

function noStoreResponse(): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const token = getBearerToken(request.headers.get("authorization"));
    const verified = await verifyAdminIdToken(token);

    if (
      verified.authTime === undefined ||
      Date.now() / 1000 - verified.authTime > MAX_AUTH_AGE_SECONDS
    ) {
      throw new AuthorizationError("Não foi possível iniciar a sessão.", 401);
    }

    const response = noStoreResponse();
    response.cookies.set(
      ADMIN_SESSION_COOKIE_NAME,
      await createAdminSessionCookie(token),
      getAdminSessionCookieOptions(),
    );
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);

    const response = noStoreResponse();
    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", {
      ...getAdminSessionCookieOptions(),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
