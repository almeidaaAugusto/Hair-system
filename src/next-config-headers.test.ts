import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

describe("next.config security headers", () => {
  it("applies anti-framing and hardening headers to every route", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]))).toEqual({
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    });
  });
});
