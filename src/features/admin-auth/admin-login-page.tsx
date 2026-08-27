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
import { getSessionClientAuth } from "@/features/admin-services/firebase-client";

type AdminLoginPageProps = {
  hasStaleSession?: boolean;
  next?: string;
};

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

    void fetch("/api/auth/session", {
      credentials: "same-origin",
      method: "DELETE",
    })
      .catch(() => undefined)
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

      await signOut(auth);
      router.replace(getSafeAdminDestination(next));
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
