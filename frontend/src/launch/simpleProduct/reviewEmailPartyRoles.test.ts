import { describe, expect, it, vi } from "vitest";
import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import {
  ensureExplicitReviewEmailPartyRoles,
  isOwnerNormalizedWorkflowRole,
  prepareReviewEmailPartyRowsForServer,
  reviewEmailPartyContactNeedPersist,
  reviewEmailPartyRolesNeedPersist,
} from "./reviewEmailPartyRoles";

vi.mock("../../agreement/agreementWorkspaceApi", () => ({
  fetchAgreementDraft: vi.fn(),
  patchAgreementField: vi.fn(),
}));

describe("reviewEmailPartyRoles", () => {
  it("recognizes owner-normalized roles", () => {
    expect(isOwnerNormalizedWorkflowRole("owner")).toBe(true);
    expect(isOwnerNormalizedWorkflowRole("sender")).toBe(true);
    expect(isOwnerNormalizedWorkflowRole("landlord")).toBe(true);
    expect(isOwnerNormalizedWorkflowRole("client")).toBe(false);
    expect(isOwnerNormalizedWorkflowRole("service_provider")).toBe(false);
  });

  it("does not copy a sibling signer onto an added Advisor when local slots are misaligned", () => {
    const serverDraft = {
      parties: [
        { id: "p1", name: "Harbor Peak Analytics LLC", role: "Consultant", signerName: "Pat Harbor", email: "pat.harbor@harbor.test" },
        { id: "p2", name: "Ironvale Manufacturing Inc.", role: "Client", signerName: "Sam Ironvale", email: "sam.ironvale@ironvale.test" },
        { id: "p3", name: "Alex Rivera", role: "Advisor", email: "alex.rivera@advisor.test" },
      ],
    } as AgreementDraft;
    const localDraft = {
      parties: [
        { id: "p1", name: "Harbor Peak Analytics LLC", role: "Consultant", signerName: "Pat Harbor", email: "pat.harbor@harbor.test" },
        { id: "p2", name: "Ironvale Manufacturing Inc.", role: "Client", signerName: "Sam Ironvale", email: "sam.ironvale@ironvale.test" },
        { id: "p2-dup", name: "Ironvale Manufacturing Inc.", role: "party", signerName: "Sam Ironvale", email: "sam.ironvale@ironvale.test" },
      ],
    } as AgreementDraft;
    const out = prepareReviewEmailPartyRowsForServer(serverDraft, localDraft);
    expect(out.map((p) => p.name)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc.",
      "Alex Rivera",
    ]);
    expect(out.find((p) => p.name === "Alex Rivera")?.role).toBe("Advisor");
    expect(out.find((p) => p.name === "Alex Rivera")?.signerName).toBeFalsy();
    expect(out.find((p) => p.name === "Alex Rivera")?.email).toBe("alex.rivera@advisor.test");
  });

  it("keeps an added individual legal party through review-email prepare", () => {
    const serverDraft = {
      parties: [
        { id: "p1", name: "Harbor Peak Analytics LLC", role: "Consultant" },
        { id: "p2", name: "Ironvale Manufacturing Inc.", role: "Client" },
      ],
    } as AgreementDraft;
    const localDraft = {
      parties: [
        { id: "p1", name: "Harbor Peak Analytics LLC", role: "Consultant", signerName: "Pat Harbor", email: "pat.harbor@harbor.test" },
        { id: "p2", name: "Ironvale Manufacturing Inc.", role: "Client", signerName: "Sam Ironvale", email: "sam.ironvale@ironvale.test" },
        { id: "p3", name: "Alex Rivera", role: "Advisor", email: "alex.rivera@advisor.test" },
      ],
    } as AgreementDraft;
    const out = prepareReviewEmailPartyRowsForServer(serverDraft, localDraft);
    expect(out.map((p) => p.name)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc.",
      "Alex Rivera",
    ]);
    expect(out.some((p) => p.role === "owner")).toBe(false);
    expect(out.map((p) => p.role)).toEqual(["Consultant", "Client", "Advisor"]);
    expect(out.find((p) => p.name === "Alex Rivera")?.role).toBe("Advisor");
  });

  it("does not stamp a named four-party legal entity as workspace owner", () => {
    const parties: AgreementParty[] = [
      { id: "p1", name: "Lumen Bioinformatics Inc.", role: "Platform Developer", email: "elena.vasquez@lumenbio.com" },
      { id: "p2", name: "Thalassa Data Systems LLC", role: "Data Infrastructure Provider", email: "marcus.webb@thalassadata.com" },
      { id: "p3", name: "Coastal Meridian Analytics LLC", role: "Analytics Integrator", email: "priya.nair@coastalmeridian.com" },
      { id: "p4", name: "Vanguard Regulatory Sciences Ltd.", role: "Regulatory Compliance Advisor", email: "james.osullivan@vanguardregulatory.co" },
    ];
    const out = ensureExplicitReviewEmailPartyRoles(parties);
    expect(out.map((p) => p.role)).toEqual(parties.map((p) => p.role));
    expect(out.some((p) => p.role === "owner")).toBe(false);
  });

  it("copies intake signer names from the local draft onto server rows before persist", () => {
    const serverDraft = {
      parties: [
        { id: "p1", name: "Lumen Bioinformatics Inc.", role: "Platform Developer" },
        { id: "p2", name: "Thalassa Data Systems LLC", role: "reviewer" },
        { id: "p3", name: "Coastal Meridian Analytics LLC", role: "reviewer" },
      ],
    } as AgreementDraft;
    const localDraft = {
      parties: [
        { id: "p1", name: "Lumen Bioinformatics Inc.", role: "Platform Developer", signerName: "Dr. Elena Vasquez" },
        { id: "p2", name: "Thalassa Data Systems LLC", role: "reviewer", signerName: "Marcus Webb" },
        { id: "p3", name: "Coastal Meridian Analytics LLC", role: "reviewer", signerName: "Priya Nair" },
      ],
    } as AgreementDraft;
    const out = prepareReviewEmailPartyRowsForServer(serverDraft, localDraft);
    expect(out.map((p) => p.signerName)).toEqual(["Dr. Elena Vasquez", "Marcus Webb", "Priya Nair"]);
    expect(out.some((p) => p.role === "owner")).toBe(false);
  });

  it("does not keep a legal-entity copy as signerName when the local draft has the human signer", () => {
    const serverDraft = {
      parties: [
        { id: "p1", name: "Stonebridge Wellness LLC", role: "Content owner / licensor", signerName: "Stonebridge Wellness LLC" },
        { id: "p2", name: "NovaPath Learning Inc.", role: "reviewer", signerName: "NovaPath Learning Inc." },
        { id: "p3", name: "ClearSpring Distribution LLC", role: "reviewer", signerName: "ClearSpring Distribution LLC" },
      ],
    } as AgreementDraft;
    const localDraft = {
      parties: [
        { id: "p1", name: "Stonebridge Wellness LLC", role: "Content owner / licensor", signerName: "Sandra Wells" },
        { id: "p2", name: "NovaPath Learning Inc.", role: "reviewer", signerName: "Caleb Price" },
        { id: "p3", name: "ClearSpring Distribution LLC", role: "reviewer", signerName: "Maya Coleman" },
      ],
    } as AgreementDraft;
    const out = prepareReviewEmailPartyRowsForServer(serverDraft, localDraft);
    expect(out.map((p) => p.signerName)).toEqual(["Sandra Wells", "Caleb Price", "Maya Coleman"]);
  });

  it("drops a reused sibling email instead of attributing it to another party", () => {
    const parties: AgreementParty[] = [
      { id: "p1", name: "Thalassa Data Systems LLC", role: "reviewer", email: "marcus.webb@thalassadata.com" },
      { id: "p2", name: "Vanguard Regulatory Sciences Ltd.", role: "reviewer", email: "marcus.webb@thalassadata.com" },
    ];
    const out = prepareReviewEmailPartyRowsForServer(
      { parties } as AgreementDraft,
      { parties } as AgreementDraft,
    );
    expect(out[0]?.email).toBe("marcus.webb@thalassadata.com");
    expect(out[1]?.email).toBeFalsy();
  });

  it("maps paid Pro client/service_provider to owner + reviewer for Resend metadata", () => {
    const parties: AgreementParty[] = [
      {
        id: "p1",
        name: "Blue Canyon Analytics LLC",
        role: "client",
        email: "owner-user@example.com",
      },
      {
        id: "p2",
        name: "Iron Vale Systems Inc.",
        role: "service_provider",
        email: "external-reviewer@example.com",
      },
    ];
    const out = ensureExplicitReviewEmailPartyRoles(parties);
    expect(out[0]?.role).toBe("owner");
    expect(out[1]?.role).toBe("reviewer");
    expect(reviewEmailPartyRolesNeedPersist(parties, out)).toBe(true);
  });

  it("preserves explicit owner at index 1 and invites counterparty at index 0", () => {
    const parties: AgreementParty[] = [
      { id: "cp", name: "Counter", role: "party", email: "counter@example.com" },
      { id: "own", name: "Owner Co", role: "owner", email: "owner@example.com" },
    ];
    const out = ensureExplicitReviewEmailPartyRoles(parties);
    expect(out[0]?.role).toBe("reviewer");
    expect(out[1]?.role).toBe("owner");
  });

  it("does not mark owner row as reviewer", () => {
    const parties: AgreementParty[] = [
      { id: "o", name: "Owner", role: "owner", email: "o@example.com" },
      { id: "r", name: "Rev", role: "reviewer", email: "r@example.com" },
    ];
    const out = ensureExplicitReviewEmailPartyRoles(parties);
    expect(out).toEqual(parties);
    expect(reviewEmailPartyRolesNeedPersist(parties, out)).toBe(false);
  });

  it("requires persist when intake signer names are on local parties but missing on the server", () => {
    const serverParties: AgreementParty[] = [
      { id: "p1", name: "Lumen Bioinformatics Inc.", role: "Platform Developer", email: "elena.vasquez@lumenbio.com" },
      { id: "p2", name: "Thalassa Data Systems LLC", role: "reviewer", email: "marcus.webb@thalassadata.com" },
    ];
    const prepared: AgreementParty[] = [
      { ...serverParties[0]!, signerName: "Dr. Elena Vasquez" },
      { ...serverParties[1]!, signerName: "Marcus Webb" },
    ];
    expect(reviewEmailPartyContactNeedPersist(serverParties, prepared)).toBe(true);
  });

  it("requires persist when server lacks reviewer email but local draft has it", () => {
    const serverParties: AgreementParty[] = [
      { id: "p1", name: "Owner", role: "owner", email: "owner@example.com" },
      { id: "p2", name: "Reviewer", role: "reviewer" },
    ];
    const prepared: AgreementParty[] = [
      { id: "p1", name: "Owner", role: "owner", email: "owner@example.com" },
      { id: "p2", name: "Reviewer", role: "reviewer", email: "external-reviewer@example.com" },
    ];
    expect(reviewEmailPartyContactNeedPersist(serverParties, prepared)).toBe(true);
  });

  it("does not require persist when local roles match server and emails already present", () => {
    const serverParties: AgreementParty[] = [
      { id: "p1", name: "Owner", role: "owner", email: "owner@example.com" },
      { id: "p2", name: "Reviewer", role: "reviewer", email: "r@example.com" },
    ];
    expect(reviewEmailPartyContactNeedPersist(serverParties, serverParties)).toBe(false);
  });

  it("prepareReviewEmailPartyRowsForServer merges recipientSetup emails onto server parties", () => {
    const serverDraft = {
      parties: [
        { id: "p_client", name: "Owner LLC", role: "client" },
        { id: "p_provider", name: "Reviewer Inc", role: "service_provider" },
      ],
    } as AgreementDraft;
    const localDraft = serverDraft;
    const prepared = prepareReviewEmailPartyRowsForServer(serverDraft, localDraft, {
      recipient1Email: "anthemhayek@me.com",
      recipient2Email: "cryptocurated21@gmail.com",
    });
    expect(prepared[0]?.role).toBe("owner");
    expect(prepared[0]?.email).toBe("anthemhayek@me.com");
    expect(prepared[1]?.role).toBe("reviewer");
    expect(prepared[1]?.email).toBe("cryptocurated21@gmail.com");
  });
});
