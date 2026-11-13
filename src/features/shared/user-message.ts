import { AdminSessionExpiredError } from "@/features/admin-auth/admin-api-client";

export const OFFLINE_MESSAGE = "Sem conexão. Verifique a internet e tente novamente.";
export const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Entre novamente.";

/** An error whose message was written for the user (Portuguese, already friendly). */
export class UserMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserMessageError";
  }
}

/**
 * Turns anything thrown into a message safe to show on screen. Only
 * `UserMessageError` text is passed through; network failures (`TypeError`
 * from fetch, e.g. "Failed to fetch") and every other technical error become a
 * Portuguese message, so no English text from the runtime reaches the user.
 */
export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof UserMessageError) return error.message || fallback;
  if (error instanceof AdminSessionExpiredError) return SESSION_EXPIRED_MESSAGE;
  if (error instanceof TypeError) return OFFLINE_MESSAGE;
  return fallback;
}
