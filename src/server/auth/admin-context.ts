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
  if (claims.admin !== true || typeof claims.salonId !== "string" || !claims.salonId) {
    throw new AuthorizationError("Acesso administrativo não autorizado.", 403);
  }

  return { salonId: claims.salonId, userId: claims.uid };
}

export async function authenticateAdmin(request: Request): Promise<AdminContext> {
  const token = getBearerToken(request.headers.get("authorization"));
  const claims = await getAuth(getAdminApp()).verifyIdToken(token);

  return getAdminContext(claims);
}
