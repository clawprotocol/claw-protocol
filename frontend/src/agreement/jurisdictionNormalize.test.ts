import { describe, expect, it } from "vitest";
import { normalizeJurisdictionDisplay } from "./jurisdictionNormalize";

describe("normalizeJurisdictionDisplay", () => {
  it("maps lowercase state names and abbreviations", () => {
    expect(normalizeJurisdictionDisplay("oklahoma")).toBe("Oklahoma");
    expect(normalizeJurisdictionDisplay("ny")).toBe("New York");
    expect(normalizeJurisdictionDisplay("OK")).toBe("Oklahoma");
  });

  it("title-cases unknown phrases", () => {
    expect(normalizeJurisdictionDisplay("english law")).toBe("English Law");
  });

  it("preserves empty", () => {
    expect(normalizeJurisdictionDisplay("")).toBe("");
  });
});
