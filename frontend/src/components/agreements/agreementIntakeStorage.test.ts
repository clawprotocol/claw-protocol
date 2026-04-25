import { describe, expect, it } from "vitest";
import { resolveIntakeBootstrap } from "./agreementIntakeStorage";

describe("resolveIntakeBootstrap", () => {
  it("uses persisted draft only when no explicit initial", () => {
    expect(resolveIntakeBootstrap(undefined, "draft A")).toBe("draft A");
  });

  it("fresh payload B wins over persisted A (regression: second attempt from homepage)", () => {
    expect(resolveIntakeBootstrap("draft B", "draft A")).toBe("draft B");
  });

  it("explicit empty string wins over storage (paste-only path)", () => {
    expect(resolveIntakeBootstrap("", "draft A")).toBe("");
  });
});
