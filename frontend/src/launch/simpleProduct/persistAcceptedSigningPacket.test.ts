import { describe, expect, it } from "vitest";
import { shouldOpenSenderFirstProfessionalSign } from "./persistAcceptedSigningPacket";

describe("persistAcceptedSigningPacket", () => {
  it("does not send a four-party commercial agreement into owner-first professional sign", () => {
    expect(
      shouldOpenSenderFirstProfessionalSign({
        mintAllRequiredSignTokens: false,
        persistedParties: [
          { name: "Ironclad Systems Group LLC", role: "Sponsor" },
          { name: "Harborline Data Solutions Inc.", role: "Vendor" },
          { name: "Northwind Automation Partners LLC", role: "Integrator" },
          { name: "Silver Mesa Analytics LP", role: "Analyst" },
        ],
      }),
    ).toBe(false);
    expect(
      shouldOpenSenderFirstProfessionalSign({
        mintAllRequiredSignTokens: true,
        persistedParties: [
          { name: "Harbor Peak Analytics LLC", role: "Consultant" },
          { name: "Ironvale Manufacturing Inc.", role: "Client" },
        ],
      }),
    ).toBe(false);
  });

  it("keeps owner/reviewer Harbor send on the professional sign path", () => {
    expect(
      shouldOpenSenderFirstProfessionalSign({
        mintAllRequiredSignTokens: false,
        persistedParties: [
          { name: "Harbor Peak Analytics LLC", role: "owner" },
          { name: "Ironvale Manufacturing Inc.", role: "reviewer" },
        ],
      }),
    ).toBe(true);
  });
});
