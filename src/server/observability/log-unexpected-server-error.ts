type LoggedServerError = {
  errorName: string;
  message: string;
};

function toLoggedServerError(error: unknown): LoggedServerError {
  if (error instanceof Error) {
    return { errorName: error.name, message: error.message };
  }

  return { errorName: "UnknownError", message: "Erro sem detalhes legíveis." };
}

export function logUnexpectedServerError(route: string, error: unknown): void {
  console.error(`Falha inesperada em ${route}`, toLoggedServerError(error));
}
