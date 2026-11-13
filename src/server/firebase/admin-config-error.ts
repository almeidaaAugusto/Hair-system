/**
 * Thrown for missing or malformed Admin SDK configuration. Its message is
 * written by the code that throws it (never derived from secrets or from the
 * service account content), so it is safe to log.
 */
export class FirebaseAdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirebaseAdminConfigError";
  }
}
