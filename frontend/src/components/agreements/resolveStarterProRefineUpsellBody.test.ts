import { describe, expect, it } from "vitest";
import {
  resolveStarterProRefineUpsellBody,
  STARTER_PRO_REFINE_UPSELL_BODY_DEFAULT,
} from "./reviewRefineUserCopy";

describe("resolveStarterProRefineUpsellBody", () => {
  it("uses default when family unknown or generic", () => {
    expect(resolveStarterProRefineUpsellBody(undefined)).toBe(STARTER_PRO_REFINE_UPSELL_BODY_DEFAULT);
    expect(resolveStarterProRefineUpsellBody("generic_business_agreement")).toBe(STARTER_PRO_REFINE_UPSELL_BODY_DEFAULT);
    expect(resolveStarterProRefineUpsellBody("services_agreement")).toBe(STARTER_PRO_REFINE_UPSELL_BODY_DEFAULT);
  });

  it("consulting", () => {
    expect(resolveStarterProRefineUpsellBody("consulting_agreement")).toBe(
      "Add scope protection, payment clarity, ownership terms.",
    );
  });

  it("NDA families", () => {
    expect(resolveStarterProRefineUpsellBody("nda")).toBe("Tighten confidentiality, remedies, survival terms.");
    expect(resolveStarterProRefineUpsellBody("confidentiality_commercial_protections_agreement")).toBe(
      "Tighten confidentiality, remedies, survival terms.",
    );
  });

  it("contractor", () => {
    expect(resolveStarterProRefineUpsellBody("independent_contractor_agreement")).toBe(
      "Add IP ownership, contractor status, payment clarity.",
    );
  });
});
