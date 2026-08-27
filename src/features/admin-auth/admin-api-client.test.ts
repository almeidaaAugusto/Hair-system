import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminSessionExpiredError, fetchAdmin } from "./admin-api-client";

describe("fetchAdmin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("always makes the administrative request with same-origin credentials", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchSpy);

    const response = await fetchAdmin("/api/admin/services", {
      credentials: "omit",
      method: "POST",
    });

    expect(response.status).toBe(204);
    expect(fetchSpy).toHaveBeenCalledWith("/api/admin/services", {
      credentials: "same-origin",
      method: "POST",
    });
  });

  it.each([401, 403])("navigates to login and stops the operation on status %s", async (status) => {
    const replace = vi.fn();
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })));
    vi.stubGlobal("window", { location: { replace } });

    await expect(fetchAdmin("/api/admin/services")).rejects.toBeInstanceOf(
      AdminSessionExpiredError,
    );
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
