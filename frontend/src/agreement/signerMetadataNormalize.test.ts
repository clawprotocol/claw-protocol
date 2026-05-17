import { describe, expect, it } from "vitest";
import {
  explicitSignerNameForEntity,
  normalizeSignerMetadataForSave,
  prepareRoleSignerName,
  signerMetadataContainsInternalSpace,
} from "./signerMetadataNormalize";

describe("signerMetadataNormalize", () => {
  it("preserves internal single spaces at save time", () => {
    expect(normalizeSignerMetadataForSave("  Jane   Doe  ")).toBe("Jane Doe");
  });

  it("does not collapse mid-word spaces incorrectly", () => {
    expect(normalizeSignerMetadataForSave("Jane Doe")).toBe("Jane Doe");
    expect(signerMetadataContainsInternalSpace("Jane Doe")).toBe(true);
  });

  it("never treats entity name as signer name", () => {
    expect(explicitSignerNameForEntity("Acme LLC", "Acme LLC")).toBeUndefined();
    expect(explicitSignerNameForEntity("Jane Doe", "Acme LLC")).toBe("Jane Doe");
  });

  it("prepareRoleSignerName keeps trailing space while typing", () => {
    expect(prepareRoleSignerName("Jane ", "Acme LLC")).toBe("Jane ");
    expect(prepareRoleSignerName("Jane Doe", "Acme LLC")).toBe("Jane Doe");
  });
});
