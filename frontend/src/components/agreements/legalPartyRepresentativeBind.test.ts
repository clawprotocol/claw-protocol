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
  extractEntitySignerInstructions,
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

  it("binds an explicit Entity signer instruction from a customer answer", () => {
    const intake =
      "Draft a consulting agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client).\nHarbor Peak Analytics LLC signer: Alex Rivera";
    expect(extractEntitySignerInstructions(intake)).toEqual([
      { entity: "Harbor Peak Analytics LLC", signerName: "Alex Rivera", email: "" },
    ]);
    const result = bindRepresentativesToLegalParties(
      [
        { name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { name: "Ironvale Manufacturing Inc.", role: "Client" },
        { name: "Alex Rivera", role: "party" },
      ],
      intake,
    );
    expect(result.parties[0]).toMatchObject({
      name: "Harbor Peak Analytics LLC",
      signerName: "Alex Rivera",
    });
    expect(result.clarificationQuestion).toBeNull();
  });

  it("asks only when a human cannot be bound and is not an individual party", () => {
    const result = bindRepresentativesToLegalParties(
      [
        { name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { name: "Ironvale Manufacturing Inc.", role: "Client" },
        { name: "Alex Rivera", role: "party" },
      ],
      "Draft a consulting agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client). Alex Rivera is involved.",
    );
    expect(result.parties.map((p) => p.name)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc.",
    ]);
    expect(result.unresolvedExtractionRows.map((p) => p.name)).toEqual(["Alex Rivera"]);
    expect(result.clarificationQuestion || "").toMatch(/Alex Rivera/);
  });

  it("does not ask the customer to confirm an extraction-only invented person", () => {
    const result = bindRepresentativesToLegalParties(
      [
        { name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { name: "Ironvale Manufacturing Inc.", role: "Client" },
        { name: "Riley Chen", role: "party" },
      ],
      "Draft a consulting agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client).",
    );
    expect(result.parties.map((p) => p.name)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc.",
    ]);
    expect(result.unresolvedExtractionRows.map((p) => p.name)).toEqual(["Riley Chen"]);
    expect(result.clarificationQuestion).toBeNull();
  });

  it("keeps an individual Advisor and does not move their email by domain resemblance", () => {
    const intake =
      "Harbor Peak Analytics LLC (Consultant). Ironvale Manufacturing Inc. (Client). Jordan Hale as an individual (Advisor) is the third contracting party and uses jordan@harborpeak.test.";
    const result = bindRepresentativesToLegalParties(
      [
        { name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { name: "Ironvale Manufacturing Inc.", role: "Client" },
        { name: "Jordan Hale", role: "Advisor", email: "jordan@harborpeak.test" },
      ],
      intake,
    );
    expect(result.parties).toEqual([
      { name: "Harbor Peak Analytics LLC", role: "Consultant", email: "", signerName: "", signerTitle: "" },
      { name: "Ironvale Manufacturing Inc.", role: "Client", email: "", signerName: "", signerTitle: "" },
      { name: "Jordan Hale", role: "Advisor", email: "jordan@harborpeak.test", signerName: "", signerTitle: "" },
    ]);
    expect(result.clarificationQuestion).toBeNull();
  });

  it("attaches a Consultant signer email only to the Consultant, not the matching domain", () => {
    const intake =
      "Harbor Peak Analytics LLC (Consultant). Ironvale Manufacturing Inc. (Client). Consultant signer Maya Chen, maya@ironvale.test.";
    const result = bindRepresentativesToLegalParties(
      [
        { name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { name: "Ironvale Manufacturing Inc.", role: "Client" },
        { name: "Maya Chen", role: "Consultant signer", email: "maya@ironvale.test" },
      ],
      intake,
    );
    expect(result.parties).toEqual([
      {
        name: "Harbor Peak Analytics LLC",
        role: "Consultant",
        email: "maya@ironvale.test",
        signerName: "Maya Chen",
        signerTitle: "",
      },
      { name: "Ironvale Manufacturing Inc.", role: "Client", email: "", signerName: "", signerTitle: "" },
    ]);
    expect(result.boundRepresentatives).toEqual(
      expect.arrayContaining([{ name: "Maya Chen", boundTo: "Harbor Peak Analytics LLC", kind: "role_label" }]),
    );
    expect(result.parties[1]?.email).toBe("");
    expect(result.clarificationQuestion).toBeNull();
  });

  it("does not collapse three genuine legal parties", () => {
    const parties = TEST477_THREE_PARTY.map((p) => ({ name: p.legalEntity, role: "party" }));
    const extras = TEST477_THREE_PARTY.map((p) => ({ name: p.signerName, role: "signer" }));
    const result = bindRepresentativesToLegalParties([...parties, ...extras], RELEASE_SCOPE_THREE_PARTY_FILLED_INTAKE);
    expect(result.parties.map((p) => p.name)).toEqual(TEST477_THREE_PARTY.map((p) => p.legalEntity));
    expect(result.parties.map((p) => p.signerName)).toEqual(TEST477_THREE_PARTY.map((p) => p.signerName));
    expect(result.unresolvedExtractionRows).toEqual([]);
  });

  it("does not collapse four genuine legal parties", () => {
    const parties = TEST487_FOUR_PARTY.map((p) => ({ name: p.legalEntity, role: p.role }));
    const extras = TEST487_FOUR_PARTY.flatMap((p) => [
      { name: p.signerName, role: `${p.role} signer` },
      { name: p.email, role: `${p.role} signer email` },
    ]);
    const result = bindRepresentativesToLegalParties([...parties, ...extras], RELEASE_SCOPE_FOUR_PARTY_FILLED_INTAKE);
    expect(result.parties.map((p) => p.name)).toEqual(TEST487_FOUR_PARTY.map((p) => p.legalEntity));
    expect(result.parties.map((p) => p.role)).toEqual(TEST487_FOUR_PARTY.map((p) => p.role));
    expect(result.parties.map((p) => p.signerName)).toEqual(TEST487_FOUR_PARTY.map((p) => p.signerName));
    expect(result.parties.map((p) => p.email)).toEqual(TEST487_FOUR_PARTY.map((p) => p.email));
    expect(result.unresolvedExtractionRows).toEqual([]);
  });

  it("preserves confirmed party ids through bind and reorder", () => {
    const ironclad = "ab711e81-5c07-4dc4-8d4a-9b5fb993eb30";
    const harborline = "f40374c7-5b28-4407-8505-9b6e2fee132d";
    const northwind = "1e5d5900-43a3-4dca-9011-20bef603cf12";
    const silver = "ae79040c-1957-4a2d-b529-024728dd5573";
    const result = bindRepresentativesToLegalParties(
      [
        { id: silver, name: "Silver Mesa Analytics LP", role: "party" },
        { id: northwind, name: "Northwind Automation Partners LLC", role: "party" },
        { id: harborline, name: "Harborline Data Solutions Inc.", role: "party" },
        { id: ironclad, name: "Ironclad Systems Group LLC", role: "party" },
      ],
      "The parties are Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, and Silver Mesa Analytics LP.",
    );
    const byName = Object.fromEntries(result.parties.map((p) => [p.name, p.id]));
    expect(byName["Ironclad Systems Group LLC"]).toBe(ironclad);
    expect(byName["Harborline Data Solutions Inc."]).toBe(harborline);
    expect(byName["Northwind Automation Partners LLC"]).toBe(northwind);
    expect(byName["Silver Mesa Analytics LP"]).toBe(silver);
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
