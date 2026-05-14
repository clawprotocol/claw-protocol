import { describe, expect, it } from "vitest";

import { mapPremiumFullDraftFamilyHint } from "./premiumFullDraftMapFamily";

describe("mapPremiumFullDraftFamilyHint", () => {
  it("prefers services_agreement fallback over confidentiality-commercial mislabel from model", () => {
    const hint = "Confidentiality and Commercial Protections Agreement";
    const out = mapPremiumFullDraftFamilyHint(hint, "services_agreement");
    expect(out).toBe("services_agreement");
  });
});
