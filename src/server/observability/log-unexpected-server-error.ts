import { FirebaseAdminConfigError } from "@/server/firebase/admin-config-error";

type LoggedServerError = {
  errorName: string;
  errorCode?: string | number;
  configMessage?: string;
};

// gRPC/Firebase codes look like FAILED_PRECONDITION, auth/internal-error or 9.
const SAFE_CODE = /^[A-Za-z0-9_./-]{1,64}$/;

function readErrorCode(error: Error): string | number | undefined {
  const code = (error as { code?: unknown }).code;
  if (typeof code === "number" && Number.isInteger(code)) return code;
  if (typeof code === "string" && SAFE_CODE.test(code)) return code;
  return undefined;
}

function toLoggedServerError(error: unknown): LoggedServerError {
  if (!(error instanceof Error)) return { errorName: "UnknownError" };

  const logged: LoggedServerError = { errorName: error.name };
  const code = readErrorCode(error);
  if (code !== undefined) logged.errorCode = code;
  // Only configuration errors carry a message that is known to be safe to log.
  if (error instanceof FirebaseAdminConfigError) logged.configMessage = error.message;
  return logged;
}

export function logUnexpectedServerError(route: string, error: unknown): void {
  console.error(`Falha inesperada em ${route}`, toLoggedServerError(error));
}
