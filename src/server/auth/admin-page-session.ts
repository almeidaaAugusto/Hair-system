import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthorizationError, type AdminContext } from "./admin-context";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionCookie } from "./admin-session";

export async function getOptionalAdminSession(): Promise<AdminContext | null> {
  const cookie = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  try {
    return await verifyAdminSessionCookie(cookie);
  } catch (error) {
    if (error instanceof AuthorizationError) return null;
    throw error;
  }
}

export async function requireAdminSession(): Promise<AdminContext> {
  const session = await getOptionalAdminSession();
  if (!session) redirect("/login");
  return session;
}
