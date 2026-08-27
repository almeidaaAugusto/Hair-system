import { getAuth } from "firebase-admin/auth";

import { getAdminApp } from "@/server/firebase/admin";

import { getAdminContext, mapFirebaseAuthorizationError, type AdminContext } from "./admin-context";

export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;

export function getAdminSessionCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    if (name !== ADMIN_SESSION_COOKIE_NAME) {
      continue;
    }

    const value = cookie.slice(separatorIndex + 1).trim();
    return value || undefined;
  }

  return undefined;
}

export async function createAdminSessionCookie(idToken: string): Promise<string> {
  return getAuth(getAdminApp()).createSessionCookie(idToken, {
    expiresIn: ADMIN_SESSION_MAX_AGE_SECONDS * 1000,
  });
}

export function getAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function verifyAdminSessionCookie(cookie: string): Promise<AdminContext> {
  try {
    const claims = await getAuth(getAdminApp()).verifySessionCookie(cookie, true);
    return getAdminContext(claims);
  } catch (error) {
    throw mapFirebaseAuthorizationError(error);
  }
}
