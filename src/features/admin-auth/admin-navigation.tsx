"use client";

import { signOut } from "firebase/auth";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

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
      const response = await fetch("/api/auth/session", {
        credentials: "same-origin",
        method: "DELETE",
      });
      if (!response.ok) throw new Error(LOGOUT_ERROR_MESSAGE);

      const auth = await getSessionClientAuth();
      await signOut(auth);
      router.replace("/login");
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
