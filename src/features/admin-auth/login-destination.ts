const DEFAULT_ADMIN_DESTINATION = "/admin/services";
const INVALID_CREDENTIAL_CODES = new Set([
  "auth/invalid-credential",
  "auth/invalid-email",
  "auth/wrong-password",
  "auth/user-not-found",
]);

export function getSafeAdminDestination(next: string | undefined): string {
  return next === "/admin" || next?.startsWith("/admin/") ? next : DEFAULT_ADMIN_DESTINATION;
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
