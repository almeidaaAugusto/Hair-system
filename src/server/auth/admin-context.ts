import { getAuth } from "firebase-admin/auth";

import { getAdminApp } from "@/server/firebase/admin";

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

export async function authenticateAdmin(request: Request): Promise<AdminContext> {
  const token = getBearerToken(request.headers.get("authorization"));

  try {
    const claims = await getAuth(getAdminApp()).verifyIdToken(token, true);
    return getAdminContext(claims);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw error;
    }
    if (isFirebaseTokenError(error)) {
      throw new AuthorizationError("Token de autentica\u00e7\u00e3o inv\u00e1lido.", 401);
    }
    throw error;
  }
}
