const DEFAULT_ADMIN_DESTINATION = "/admin/agenda";
const INVALID_CREDENTIAL_CODES = new Set([
  "auth/invalid-credential",
  "auth/invalid-email",
  "auth/wrong-password",
  "auth/user-not-found",
]);

export function getSafeAdminDestination(next: string | undefined): string {
  if (
    !next?.startsWith("/") ||
    next.startsWith("//") ||
    next.includes("\\") ||
    Array.from(next).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  ) {
    return DEFAULT_ADMIN_DESTINATION;
  }

  const destination = new URL(next, "https://admin.internal");
  if (destination.pathname !== "/admin" && !destination.pathname.startsWith("/admin/")) {
    return DEFAULT_ADMIN_DESTINATION;
  }

  return destination.pathname + destination.search + destination.hash;
}

export function getLoginErrorMessage(firebaseCode?: string, sessionStatus?: number): string {
  if (sessionStatus === 403) {
    return "Sua conta não possui autorização administrativa.";
  }

  if (firebaseCode && INVALID_CREDENTIAL_CODES.has(firebaseCode)) {
    return "E-mail ou senha inválidos.";
  }

  return "Não foi possível entrar. Tente novamente.";
}
