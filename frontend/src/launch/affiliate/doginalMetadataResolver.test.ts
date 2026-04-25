import { describe, expect, it } from "vitest";
import {
  extractHintsFromMarketplaceUrl,
  parseDoginalNumberFromText,
  parseInscriptionIdFromText,
  resolveDoginalMetadataBestEffort,
} from "./doginalMetadataResolver";

describe("doginalMetadataResolver", () => {
  it("parses inscription-like id from text", () => {
    const ins = `${"a".repeat(64)}i0`;
    expect(parseInscriptionIdFromText(ins)).toBe(ins);
    expect(parseInscriptionIdFromText("nope")).toBeNull();
  });

  it("parses dog number heuristically", () => {
    expect(parseDoginalNumberFromText("Check out doginal #42")).toBe("42");
  });

  it("extractHintsFromMarketplaceUrl is best-effort and local only", () => {
    const ins = `${"b".repeat(64)}i0`;
    const h = extractHintsFromMarketplaceUrl(`https://example.com/item/${ins}`);
    expect(h.inscription_id).toBe(ins);
    expect(h.marketplace_url).toContain("example.com");
  });

  it("resolveDoginalMetadataBestEffort merges inputs without network", async () => {
    const r = await resolveDoginalMetadataBestEffort({
      doginal_number: "7",
      doginal_marketplace_url: "https://market.example/dog-12",
    });
    expect(r.normalized.doginal_number).toBe("7");
    expect(r.plausibility).toBe("parsed_locally");
  });
});
