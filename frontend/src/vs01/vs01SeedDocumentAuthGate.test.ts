import { describe, expect, it } from "vitest";
import { shouldDeferVs01SeedDocumentLoad } from "./vs01SeedDocumentAuthGate";

describe("shouldDeferVs01SeedDocumentLoad", () => {
  it("defers while Supabase auth is enabled and still loading (cold esign race)", () => {
    expect(shouldDeferVs01SeedDocumentLoad({ authEnabled: true, authLoading: true })).toBe(true);
  });

  it("does not defer after auth settles so document content can load", () => {
    expect(shouldDeferVs01SeedDocumentLoad({ authEnabled: true, authLoading: false })).toBe(false);
  });

  it("does not defer when auth is disabled", () => {
    expect(shouldDeferVs01SeedDocumentLoad({ authEnabled: false, authLoading: true })).toBe(false);
    expect(shouldDeferVs01SeedDocumentLoad({ authEnabled: false, authLoading: false })).toBe(false);
  });
});
