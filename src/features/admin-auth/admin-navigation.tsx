"use client";

import { signOut } from "firebase/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import {
  clearAdminSession,
  performAdminLogout,
} from "@/features/admin-auth/admin-session-workflows";
import { getSessionClientAuth } from "@/features/admin-services/firebase-client";

const LOGOUT_ERROR_MESSAGE = "Não foi possível sair. Tente novamente.";

export function AdminNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [message, setMessage] = useState<string>();

  async function logout(): Promise<void> {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setMessage(undefined);

    try {
      const didLogOut = await performAdminLogout({
        clearSession: clearAdminSession,
        getAuth: getSessionClientAuth,
        navigate: (destination) => router.replace(destination),
        signOutClient: signOut,
      });
      if (!didLogOut) setMessage(LOGOUT_ERROR_MESSAGE);
    } catch {
      setMessage(LOGOUT_ERROR_MESSAGE);
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <>
      <nav className="admin-nav" aria-label="Administração">
        <div className="admin-nav-links">
          <Link
            aria-current={pathname === "/admin/services" ? "page" : undefined}
            href="/admin/services"
          >
            Serviços
          </Link>
          <Link
            aria-current={pathname === "/admin/business-hours" ? "page" : undefined}
            href="/admin/business-hours"
          >
            Expediente
          </Link>
        </div>
        <button
          aria-busy={isLoggingOut}
          className="secondary-button"
          disabled={isLoggingOut}
          onClick={logout}
          type="button"
        >
          {isLoggingOut ? "Saindo…" : "Sair"}
        </button>
      </nav>
      {message ? (
        <p className="admin-status" role="alert">
          {message}
        </p>
      ) : null}
    </>
  );
}
