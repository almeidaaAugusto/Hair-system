export class RequestGuardError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 415,
  ) {
    super(message);
    this.name = "RequestGuardError";
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

/** Requires the browser-sent Origin to match the host that received the request. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  const expectedOrigin = host ? `${requestUrl.protocol}//${host}` : requestUrl.origin;
  return Boolean(origin) && origin === expectedOrigin;
}

/** Requires `Content-Type: application/json` (parameters such as charset are allowed). */
export function assertJsonContentType(request: Request): void {
  const mediaType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new RequestGuardError("O corpo da requisição deve ser application/json.", 415);
  }
}

/** Reads a JSON body after checking the media type. */
export async function readJsonBody(request: Request): Promise<unknown> {
  assertJsonContentType(request);
  return request.json();
}

export function requestGuardResponse(error: RequestGuardError): Response {
  return Response.json(
    { error: error.message },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}
