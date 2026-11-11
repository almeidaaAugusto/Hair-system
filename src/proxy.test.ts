import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";

describe("administrative Proxy", () => {
  it("redirects a no-cookie request and preserves its pathname and query", () => {
    const response = proxy(new NextRequest("http://localhost/admin/services?tab=active"));
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fadmin%2Fservices%3Ftab%3Dactive",
    );
    expect(response.status).toBe(307);
  });

  it.each(["possibly-stale", ""])(
    "continues when a cookie is present (%s), leaving verification to the page",
    (cookie) => {
      const response = proxy(
        new NextRequest("http://localhost/admin/services", {
          headers: { Cookie: `admin_session=${cookie}` },
        }),
      );
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("does not accept an unrelated cookie as a session", () => {
    const response = proxy(
      new NextRequest("http://localhost/admin", { headers: { Cookie: "theme=dark" } }),
    );
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Fadmin");
  });

  it.each(["/admin", "/admin/", "/admin/services", "/admin/business-hours?day=monday"])(
    "matches administrative path %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    },
  );

  it.each(["/login", "/", "/api/auth/session", "/api/admin/services", "/administrator"])(
    "excludes %s, preventing a login redirect loop",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
    },
  );
});
