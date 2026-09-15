import { describe, expect, it } from "vitest";
import {
  HARBOR_LIVE_20260915_INTAKE,
  HARBOR_LIVE_20260915_PREMIUM_PARSE,
} from "../../launch/fixtures/harborLive20260915.sanitized";
import { RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE, RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE } from "../../launch/releaseScopeQualificationCampaign";
import { TEST477_THREE_PARTY } from "./paidProTest477Fixtures";
import { TEST487_FOUR_PARTY } from "./paidProTest487ProductionValidationFixtures";
import {
  applyExplicitIntakeRolesToParties,
  bindRepresentativesToLegalParties,
} from "./legalPartyRepresentativeBind";

describe("bindRepresentativesToLegalParties", () => {
  it("binds Harbor premium-parse signers and emails without inventing extra legal parties", () => {
    const result = bindRepresentativesToLegalParties(
      HARBOR_LIVE_20260915_PREMIUM_PARSE.parties,
      HARBOR_LIVE_20260915_INTAKE,
    );
    expect(result.parties.map((p) => p.name)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc",
    ]);
    expect(result.parties[0]).toMatchObject({
      role: "Consultant",
      signerName: "Maya Chen",
      email: "maya.chen@harborpeak.test",
    });
    expect(result.parties[1]).toMatchObject({
      role: "Client",
      signerName: "Jordan Hale",
      email: "jordan.hale@ironvale.test",
    });
    expect(result.clarificationQuestion).toBeNull();
  });

  it("keeps Consultant/Client when party descriptions are reordered", () => {
    const intake =
      "Draft a consulting agreement between Ironvale Manufacturing Inc. (Client) and Harbor Peak Analytics LLC (Consultant). Scope is AI workflow implementation. Consultant signer Maya Chen, maya.chen@harborpeak.test. Client signer Jordan Hale, jordan.hale@ironvale.test.";
    const result = bindRepresentativesToLegalParties(
      [
        { name: "Ironvale Manufacturing Inc.", role: "Client" },
        { name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { name: "Jordan Hale", role: "Client signer" },
        { name: "Maya Chen", role: "Consultant signer" },
      ],
      intake,
    );
    const harbor = result.parties.find((p) => /Harbor/i.test(p.name));
    const ironvale = result.parties.find((p) => /Ironvale/i.test(p.name));
    expect(harbor?.role).toBe("Consultant");
    expect(ironvale?.role).toBe("Client");
    expect(harbor?.signerName).toBe("Maya Chen");
    expect(ironvale?.signerName).toBe("Jordan Hale");
  });

  it("preserves an individual who is explicitly contracting as a legal party", () => {
    const intake =
      "Agreement between Harbor Peak Analytics LLC (Consultant) and Jordan Hale as an individual (Client). Scope is AI workflow implementation.";
    const result = bindRepresentativesToLegalParties(
      [
        { name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { name: "Jordan Hale", role: "Client" },
      ],
      intake,
    );
    expect(result.parties.some((p) => p.name === "Jordan Hale")).toBe(true);
    expect(result.parties.some((p) => p.name === "Harbor Peak Analytics LLC")).toBe(true);
  });

  it("asks only when a human cannot be bound and is not an individual party", () => {
    const result = bindRepresentativesToLegalParties(
      [
        { name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { name: "Ironvale Manufacturing Inc.", role: "Client" },
        { name: "Alex Rivera", role: "party" },
      ],
      "Draft a consulting agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation.",
    );
    expect(result.parties.some((p) => p.name === "Alex Rivera")).toBe(true);
    expect(result.clarificationQuestion || "").toMatch(/Alex Rivera/);
  });

  it("does not collapse three genuine legal parties", () => {
    const parties = TEST477_THREE_PARTY.map((p) => ({ name: p.legalEntity, role: "party" }));
    const extras = TEST477_THREE_PARTY.map((p) => ({ name: p.signerName, role: "signer" }));
    const result = bindRepresentativesToLegalParties([...parties, ...extras], RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE);
    expect(result.parties.filter((p) => parties.some((row) => row.name === p.name))).toHaveLength(3);
  });

  it("does not collapse four genuine legal parties", () => {
    const parties = TEST487_FOUR_PARTY.map((p) => ({ name: p.legalEntity, role: p.role }));
    const extras = TEST487_FOUR_PARTY.flatMap((p) => [
      { name: p.signerName, role: `${p.role} signer` },
      { name: p.email, role: `${p.role} signer email` },
    ]);
    const result = bindRepresentativesToLegalParties([...parties, ...extras], RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE);
    expect(result.parties.filter((p) => parties.some((row) => row.name === p.name))).toHaveLength(4);
  });
});

describe("applyExplicitIntakeRolesToParties", () => {
  it("does not assign Client/Service Provider by mention order when Consultant/Client are stated", () => {
    const out = applyExplicitIntakeRolesToParties(
      [
        { name: "Harbor Peak Analytics LLC", role: "party" },
        { name: "Ironvale Manufacturing Inc.", role: "party" },
      ],
      HARBOR_LIVE_20260915_INTAKE,
    );
    expect(out[0]?.role).toBe("Consultant");
    expect(out[1]?.role).toBe("Client");
  });
});
