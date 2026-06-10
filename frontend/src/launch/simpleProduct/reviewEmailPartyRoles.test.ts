import { describe, expect, it } from "vitest";
import type { AgreementParty } from "../../agreement/agreementTypes";
import {
  ensureExplicitReviewEmailPartyRoles,
  isOwnerNormalizedWorkflowRole,
  reviewEmailPartyRolesNeedPersist,
} from "./reviewEmailPartyRoles";

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
});
