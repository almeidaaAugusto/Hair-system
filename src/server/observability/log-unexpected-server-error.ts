type LoggedServerError = {
  errorName: string;
};

function toLoggedServerError(error: unknown): LoggedServerError {
  if (error instanceof Error) {
    return { errorName: error.name };
  }

  return { errorName: "UnknownError" };
}

export function logUnexpectedServerError(route: string, error: unknown): void {
  console.error(`Falha inesperada em ${route}`, toLoggedServerError(error));
}
