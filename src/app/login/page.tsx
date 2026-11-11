import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminLoginPage } from "@/features/admin-auth/admin-login-page";
import { getSafeAdminDestination } from "@/features/admin-auth/login-destination";
import { getOptionalAdminSession } from "@/server/auth/admin-page-session";
import { ADMIN_SESSION_COOKIE_NAME } from "@/server/auth/admin-session";

export const metadata = { title: "Entrar | Sistema Cabelo" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (await getOptionalAdminSession()) redirect("/admin/services");

  const { next } = await searchParams;
  const hasStaleSession = (await cookies()).get(ADMIN_SESSION_COOKIE_NAME) !== undefined;

  return (
    <AdminLoginPage
      hasStaleSession={hasStaleSession}
      next={getSafeAdminDestination(typeof next === "string" ? next : undefined)}
    />
  );
}
