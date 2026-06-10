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
