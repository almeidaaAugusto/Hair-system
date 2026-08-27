export class AdminSessionExpiredError extends Error {
  constructor() {
    super("A sessão administrativa expirou.");
    this.name = "AdminSessionExpiredError";
  }
}

export async function fetchAdmin(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, { ...init, credentials: "same-origin" });

  if (response.status === 401 || response.status === 403) {
    window.location.replace("/login");
    throw new AdminSessionExpiredError();
  }

  return response;
}
