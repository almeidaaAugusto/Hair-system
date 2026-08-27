import { getAuth } from "firebase-admin/auth";

import { getAdminApp } from "@/server/firebase/admin";

import { getAdminSessionCookie, verifyAdminSessionCookie } from "./admin-session";

export type AdminContext = {
  salonId: string;
  userId: string;
};

type TokenClaims = {
  admin?: unknown;
  salonId?: unknown;
  uid: string;
};

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
  }
}

export function getBearerToken(authorization: string | null): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new AuthorizationError("Token de autenticação ausente.", 401);
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new AuthorizationError("Token de autenticação ausente.", 401);
  }

  return token;
}

export function getAdminContext(claims: TokenClaims): AdminContext {
  const salonId = typeof claims.salonId === "string" ? claims.salonId.trim() : "";

  if (claims.admin !== true || !salonId) {
    throw new AuthorizationError("Acesso administrativo não autorizado.", 403);
  }

  return { salonId, userId: claims.uid };
}

function isFirebaseTokenError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("auth/")
  );
}

export function mapFirebaseAuthorizationError(error: unknown): Error {
  if (error instanceof AuthorizationError) {
    return error;
  }
  if (isFirebaseTokenError(error)) {
    return new AuthorizationError("Token de autentica\u00e7\u00e3o inv\u00e1lido.", 401);
  }
  return error instanceof Error ? error : new Error("Erro de autentica\u00e7\u00e3o.");
}

export async function verifyAdminIdToken(
  token: string,
): Promise<{ admin: AdminContext; authTime: number | undefined }> {
  try {
    const claims = await getAuth(getAdminApp()).verifyIdToken(token, true);
    return {
      admin: getAdminContext(claims),
      authTime: typeof claims.auth_time === "number" ? claims.auth_time : undefined,
    };
  } catch (error) {
    throw mapFirebaseAuthorizationError(error);
  }
}

export async function authenticateAdmin(request: Request): Promise<AdminContext> {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    return (await verifyAdminIdToken(getBearerToken(authorization))).admin;
  }

  const cookie = getAdminSessionCookie(request);
  if (!cookie) {
    throw new AuthorizationError("Token de autentica\u00e7\u00e3o ausente.", 401);
  }

  return verifyAdminSessionCookie(cookie);
}
