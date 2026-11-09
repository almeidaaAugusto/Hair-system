"use client";

import { FirebaseError } from "firebase/app";
import { signInWithEmailAndPassword, signOut, type Auth } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AdminLoginForm, type AdminLoginFields } from "@/features/admin-auth/admin-login-form";
import {
  getLoginErrorMessage,
  getSafeAdminDestination,
} from "@/features/admin-auth/login-destination";
import {
  clearAdminSession,
  finalizeSuccessfulAdminLogin,
} from "@/features/admin-auth/admin-session-workflows";
import { getSessionClientAuth } from "@/features/admin-services/firebase-client";

type AdminLoginPageProps = {
  hasStaleSession?: boolean;
  next?: string;
};

const LOGIN_FINALIZATION_ERROR_MESSAGE = "Não foi possível concluir o login. Tente novamente.";
const STALE_SESSION_ERROR_MESSAGE = "Não foi possível preparar o login. Tente novamente.";

class SessionExchangeError extends Error {
  constructor(readonly status: number) {
    super("Não foi possível criar a sessão administrativa.");
  }
}

function getFirebaseErrorCode(error: unknown): string | undefined {
  return error instanceof FirebaseError ? error.code : undefined;
}

function getSessionStatus(error: unknown): number | undefined {
  return error instanceof SessionExchangeError ? error.status : undefined;
}

export function AdminLoginPage({ hasStaleSession = false, next }: AdminLoginPageProps) {
  const router = useRouter();
  const hasStartedStaleSessionCleanup = useRef(false);
  const [isClearingStaleSession, setIsClearingStaleSession] = useState(hasStaleSession);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!hasStaleSession || hasStartedStaleSessionCleanup.current) return;
    hasStartedStaleSessionCleanup.current = true;

    void clearAdminSession()
      .then((wasCleared) => {
        if (!wasCleared) setMessage(STALE_SESSION_ERROR_MESSAGE);
      })
      .finally(() => {
        setIsClearingStaleSession(false);
      });
  }, [hasStaleSession]);

  async function login(fields: AdminLoginFields): Promise<void> {
    if (isSubmitting || isClearingStaleSession) return;

    setIsSubmitting(true);
    setMessage(undefined);
    let auth: Auth | undefined;

    try {
      auth = await getSessionClientAuth();
      const credential = await signInWithEmailAndPassword(auth, fields.email, fields.password);
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/auth/session", {
        credentials: "same-origin",
        headers: { Authorization: `Bearer ${idToken}` },
        method: "POST",
      });

      if (!response.ok) throw new SessionExchangeError(response.status);

      const result = await finalizeSuccessfulAdminLogin({
        auth,
        clearSession: clearAdminSession,
        destination: getSafeAdminDestination(next),
        hardNavigate: (destination) => window.location.replace(destination),
        signOutClient: signOut,
        softNavigate: (destination) => router.replace(destination),
      });
      if (result === "rolled-back") setMessage(LOGIN_FINALIZATION_ERROR_MESSAGE);
    } catch (error) {
      if (auth) await signOut(auth).catch(() => undefined);
      setMessage(getLoginErrorMessage(getFirebaseErrorCode(error), getSessionStatus(error)));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminLoginForm
      description="Entre para gerenciar serviços e expediente."
      isLoading={isSubmitting || isClearingStaleSession}
      message={message}
      onSubmit={login}
    />
  );
}
