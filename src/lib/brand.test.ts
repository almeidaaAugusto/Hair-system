import { describe, expect, it } from "vitest";

import { brand } from "./brand";

describe("brand", () => {
  it("expõe a identidade usada na página inicial", () => {
    expect(brand.name).toBe("Gabriela Alvim");
    expect(brand.tagline).toBe("Saúde capilar começa no couro cabeludo");
    expect(brand.city).toBe("Rafard-SP");
  });

  it("aponta o perfil do Instagram por HTTPS", () => {
    const url = new URL(brand.instagramUrl);

    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.instagram.com");
    expect(url.pathname).toBe(`/${brand.instagramHandle.slice(1)}/`);
  });
});
