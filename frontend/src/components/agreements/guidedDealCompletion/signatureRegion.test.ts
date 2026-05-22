import { describe, expect, it } from "vitest";
import { findSignatureRegionStart } from "./signatureRegion";

describe("signatureRegion", () => {
  it("does not anchor on early EXECUTION prose (test28)", () => {
    const body =
      "The execution of this Agreement shall occur as provided herein.\n" +
      "x".repeat(8200) +
      "\n\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\nCLIENT:\nName: ________";
    const marker = findSignatureRegionStart(body);
    expect(marker).toBeGreaterThan(4000);
    expect(marker).toBeLessThan(body.length);
  });
});
