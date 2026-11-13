import { describe, expect, it } from "vitest";

import {
  RequestGuardError,
  assertJsonContentType,
  isMutatingMethod,
  isSameOrigin,
  readJsonBody,
} from "./request-guards";

function request(headers: Record<string, string>, body = "{}") {
  return new Request("http://localhost/api/admin/services", { method: "POST", headers, body });
}

describe("request guards", () => {
  it("identifies mutating methods", () => {
    expect(["POST", "put", "PATCH", "DELETE"].every(isMutatingMethod)).toBe(true);
    expect(["GET", "HEAD", "OPTIONS"].some(isMutatingMethod)).toBe(false);
  });

  it("accepts only the same origin and uses the received Host", () => {
    expect(isSameOrigin(request({ Origin: "http://localhost" }))).toBe(true);
    expect(isSameOrigin(request({}))).toBe(false);
    expect(isSameOrigin(request({ Origin: "https://evil.example" }))).toBe(false);
    expect(isSameOrigin(request({ Host: "127.0.0.1:3000", Origin: "http://127.0.0.1:3000" }))).toBe(
      true,
    );
  });

  it("requires a JSON media type but tolerates parameters and case", async () => {
    await expect(
      readJsonBody(request({ "Content-Type": "Application/JSON; charset=utf-8" }, '{"a":1}')),
    ).resolves.toEqual({ a: 1 });
    for (const headers of [{}, { "Content-Type": "text/plain" }] as Record<string, string>[]) {
      expect(() => assertJsonContentType(request(headers))).toThrow(RequestGuardError);
    }
    await expect(readJsonBody(request({ "Content-Type": "text/plain" }))).rejects.toMatchObject({
      status: 415,
    });
  });
});
