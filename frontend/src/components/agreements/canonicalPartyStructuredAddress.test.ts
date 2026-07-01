import { describe, expect, it } from "vitest";
import {
  isPartyAddressBoundaryLine,
  joinCanonicalPartyAddressLines,
  mergeCanonicalPartyAddresses,
  normalizeCanonicalPartyAddress,
  sanitizeCanonicalPartyAddress,
  splitCanonicalPartyAddressLines,
} from "./canonicalPartyStructuredAddress";

describe("canonicalPartyStructuredAddress", () => {
  it("merges multiline and comma-separated addresses without dropping components", () => {
    const multiline = normalizeCanonicalPartyAddress("123 Main Street\nSuite 500\nDallas, TX 75201");
    expect(multiline).toBe("123 Main Street, Suite 500, Dallas, TX 75201");

    const merged = mergeCanonicalPartyAddresses("1850 Innovation Parkway", "Madison, WI 53703");
    expect(merged).toBe("1850 Innovation Parkway, Madison, WI 53703");

    const enriched = mergeCanonicalPartyAddresses(
      "4220 Industrial Drive",
      "4220 Industrial Drive, Fort Wayne, IN 46808",
    );
    expect(enriched).toBe("4220 Industrial Drive, Fort Wayne, IN 46808");
  });

  it("preserves international and PO Box lines", () => {
    const address = joinCanonicalPartyAddressLines([
      "221B Baker Street",
      "London NW1",
      "United Kingdom",
    ]);
    expect(address).toBe("221B Baker Street, London NW1, United Kingdom");
    expect(splitCanonicalPartyAddressLines(address)).toHaveLength(3);
  });

  it("skips blank lines and label-only values", () => {
    const normalized = normalizeCanonicalPartyAddress("910 Harbor Commerce Blvd\n\nTampa, FL 33602");
    expect(normalized).toBe("910 Harbor Commerce Blvd, Tampa, FL 33602");
    expect(normalizeCanonicalPartyAddress("Address:")).toBe("");
  });

  it("stops at party headings and agreement prose (TEST484)", () => {
    const contaminated =
      "1400 Capital Plaza, Alexandria, VA 22314, Draft a detailed agreement under which each party";
    expect(sanitizeCanonicalPartyAddress(contaminated)).toBe(
      "1400 Capital Plaza, Alexandria, VA 22314",
    );
    expect(
      joinCanonicalPartyAddressLines([
        "4220 Industrial Drive",
        "Fort Wayne, IN 46808",
        "Party 3 (Exclusive Distributor)",
      ]),
    ).toBe("4220 Industrial Drive, Fort Wayne, IN 46808");
    expect(isPartyAddressBoundaryLine("Party 4 (Regulatory & Quality Consultant)")).toBe(true);
    expect(isPartyAddressBoundaryLine("Purpose,")).toBe(true);
    expect(isPartyAddressBoundaryLine("Initial Term,")).toBe(true);
  });
});
