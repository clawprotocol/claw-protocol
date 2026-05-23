import { describe, expect, it } from "vitest";
import { resolveGuidedPreReviewSignerSlots } from "./resolveGuidedPreReviewSignerSlots";

const BASE = {
  partyCount: 2,
  partySignerNames: ["", ""],
  recipient1Name: "",
  recipient2Name: "",
  recipient1Email: "",
  recipient2Email: "",
  extraPartyReviewEmails: [] as string[],
  draftPartyNames: ["Acme Corp", "Beta LLC"],
  sendMode: "signature" as const,
  recipientsDeferred: false,
};

describe("resolveGuidedPreReviewSignerSlots", () => {
  it("party 1 only identity does not complete (test20)", () => {
    const r = resolveGuidedPreReviewSignerSlots({
      ...BASE,
      partySignerNames: ["Alice Owner", ""],
      recipient1Email: "alice@acme.test",
    });
    expect(r.complete).toBe(false);
    expect(r.incompleteIndices).toContain(1);
  });

  it("test38: client representative name alone does not satisfy party 0 entity identity", () => {
    const r = resolveGuidedPreReviewSignerSlots({
      ...BASE,
      draftPartyNames: ["", "Joe Smith"],
      partySignerNames: ["Anthem Blanchard", "Joe Smith"],
      recipient2Name: "Joe Smith",
      recipient1Email: "anthem@acme.test",
      recipient2Email: "joe@example.test",
    });
    expect(r.complete).toBe(false);
    expect(r.incompleteIndices).toContain(0);
  });

  it("both parties with identity and counterparty email complete for signature", () => {
    const r = resolveGuidedPreReviewSignerSlots({
      ...BASE,
      partySignerNames: ["Alice Owner", "Bob Signer"],
      recipient2Email: "bob@beta.test",
    });
    expect(r.complete).toBe(true);
    expect(r.filledCount).toBe(2);
  });

  it("review mode requires email on all parties", () => {
    const r = resolveGuidedPreReviewSignerSlots({
      ...BASE,
      sendMode: "review",
      partySignerNames: ["Alice", "Bob"],
      recipient1Email: "alice@acme.test",
      recipient2Email: "",
    });
    expect(r.complete).toBe(false);
    expect(r.incompleteIndices).toContain(1);
  });

  it("services-style 2-party names via recipient fields", () => {
    const r = resolveGuidedPreReviewSignerSlots({
      ...BASE,
      recipient1Name: "Provider Co",
      recipient2Name: "Client Co",
      recipient2Email: "signer@client.test",
    });
    expect(r.complete).toBe(true);
  });
});
