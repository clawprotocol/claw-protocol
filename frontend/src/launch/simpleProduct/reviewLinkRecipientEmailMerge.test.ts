import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import { clearPremiumPartyNamesHandoff } from "../../components/agreements/premiumPartyNamesHandoff";
import {
  countReadyReviewLinkInviteParties,
  logReviewLinkRecipientEmailPreflight,
  mergeLiveDraftWithRecipientSetupForReviewLinks,
  mergeReviewLinkRecipientEmailsOntoHydratedDraft,
  resolveReviewLinkAssumedOwnerPartyIndex,
  rowReadyForReviewLinkInvite,
} from "./reviewLinkRecipientEmailMerge";

const sessionStore: Record<string, string> = {};

beforeEach(() => {
  vi.stubGlobal(
    "sessionStorage",
    {
      getItem: (k: string) => (Object.prototype.hasOwnProperty.call(sessionStore, k) ? sessionStore[k]! : null),
      setItem: (k: string, v: string) => {
        sessionStore[k] = String(v);
      },
      removeItem: (k: string) => {
        delete sessionStore[k];
      },
      clear: () => {
        for (const key of Object.keys(sessionStore)) delete sessionStore[key];
      },
      key: (i: number) => Object.keys(sessionStore)[i] ?? null,
      get length() {
        return Object.keys(sessionStore).length;
      },
    } as Storage,
  );
  clearPremiumPartyNamesHandoff();
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(sessionStore)) delete sessionStore[key];
});

describe("mergeReviewLinkRecipientEmailsOntoHydratedDraft", () => {
  it("preserves server party ids and overlays primed emails for review-link handoff", () => {
    const fetched = {
      id: "agreement-handoff-1",
      parties: [
        { id: "srv-0", name: "Owner", role: "owner", email: "" },
        { id: "srv-1", name: "Sarah Collins", role: "reviewer", email: "" },
      ],
    } as AgreementDraft;
    const primed = {
      id: "agreement-handoff-1",
      parties: [
        { name: "Owner", role: "owner", email: "owner.user@me.com" },
        { name: "Sarah Collins", role: "reviewer", email: "counterparty.user@gmail.com" },
      ],
    } as AgreementDraft;
    const out = mergeReviewLinkRecipientEmailsOntoHydratedDraft(fetched, primed);
    expect(out.parties[0].id).toBe("srv-0");
    expect(out.parties[0].email).toContain("me.com");
    expect(out.parties[1].id).toBe("srv-1");
    expect(out.parties[1].email).toContain("gmail.com");
  });

  it("fills from session premium recipient handoff when GET draft has no emails", () => {
    sessionStorage.setItem(
      "claw_premium_recipient_handoff_v2",
      JSON.stringify({
        v: 2,
        party1: { name: "Owner", email: "persisted.owner@example.com", role: "owner" },
        party2: { name: "Reviewer", email: "persisted.reviewer@example.org", role: "reviewer" },
        savedAt: Date.now(),
      }),
    );
    const fetched = {
      id: "ag-2",
      parties: [
        { id: "p0", name: "Owner", role: "owner" },
        { id: "p1", name: "Reviewer", role: "reviewer" },
      ],
    } as AgreementDraft;
    const out = mergeReviewLinkRecipientEmailsOntoHydratedDraft(fetched, null);
    expect(out.parties[0].email).toContain("example.com");
    expect(out.parties[1].email).toContain("example.org");
  });
});

describe("rowReadyForReviewLinkInvite", () => {
  it("passes with name and email only (no phone) for non-owner reviewer", () => {
    const parties = [
      { name: "Owner", role: "owner", email: "o@example.com" } as AgreementParty,
      {
        id: "p1",
        name: "Sam Reviewer",
        role: "reviewer",
        email: "sam@example.com",
        phone: "",
      } as AgreementParty,
    ];
    expect(rowReadyForReviewLinkInvite(parties[1]!, 1, parties)).toBe(true);
  });

  it("fails when phone present but email missing", () => {
    const parties = [
      { name: "Owner", role: "owner", email: "o@example.com" } as AgreementParty,
      {
        id: "p1",
        name: "Sam",
        role: "reviewer",
        email: "",
        phone: "5551234567",
      } as AgreementParty,
    ];
    expect(rowReadyForReviewLinkInvite(parties[1]!, 1, parties)).toBe(false);
  });

  it("treats index>=1 party role as counterparty when row 0 is owner", () => {
    const parties = [
      { name: "Anthem", role: "owner", email: "a@example.com" } as AgreementParty,
      { name: "Sarah Collins", role: "party", email: "sarah@example.org", phone: "" } as AgreementParty,
    ];
    expect(rowReadyForReviewLinkInvite(parties[1]!, 1, parties)).toBe(true);
    expect(rowReadyForReviewLinkInvite(parties[0]!, 0, parties)).toBe(false);
  });

  it("does not treat assumed owner index 0 as counterparty when role is party", () => {
    const parties = [
      { name: "Solo", role: "party", email: "solo@example.com" } as AgreementParty,
      { name: "Other", role: "party", email: "o@example.com" } as AgreementParty,
    ];
    expect(resolveReviewLinkAssumedOwnerPartyIndex(parties)).toBe(0);
    expect(rowReadyForReviewLinkInvite(parties[0]!, 0, parties)).toBe(false);
    expect(rowReadyForReviewLinkInvite(parties[1]!, 1, parties)).toBe(true);
  });
});

describe("countReadyReviewLinkInviteParties", () => {
  it("counts reviewer rows that satisfy email-only readiness", () => {
    const n = countReadyReviewLinkInviteParties([
      { name: "Owner", role: "owner", email: "o@example.com" } as AgreementParty,
      { name: "Rev", role: "reviewer", email: "r@example.com", phone: "" } as AgreementParty,
    ]);
    expect(n).toBe(1);
  });

  it("counts party-role second row with email (QA: roles not reviewer/signer)", () => {
    const n = countReadyReviewLinkInviteParties([
      { name: "Owner", role: "owner", email: "o@example.com" } as AgreementParty,
      { name: "Sarah Collins", role: "party", email: "s@example.org" } as AgreementParty,
    ]);
    expect(n).toBe(1);
  });

  it("blocks when only owner row has email", () => {
    const n = countReadyReviewLinkInviteParties([
      { name: "Owner", role: "owner", email: "o@example.com" } as AgreementParty,
      { name: "Sarah", role: "party", email: "" } as AgreementParty,
    ]);
    expect(n).toBe(0);
  });

  it("counts index>=1 with email when ids missing", () => {
    const n = countReadyReviewLinkInviteParties([
      { name: "A", role: "owner", email: "" } as AgreementParty,
      { name: "B", role: "party", email: "b@ok.test" } as AgreementParty,
    ]);
    expect(n).toBe(1);
  });
});

describe("review intent vs signing (email-only counterparty)", () => {
  it("counts signer row with email and no phone for review-link readiness", () => {
    const parties = [
      { name: "Owner", role: "owner", email: "o@example.com" } as AgreementParty,
      { name: "Signer", role: "signer", email: "s@example.com", phone: "" } as AgreementParty,
    ];
    expect(countReadyReviewLinkInviteParties(parties)).toBe(1);
  });
});

describe("resolveReviewLinkAssumedOwnerPartyIndex", () => {
  it("prefers first explicit owner row even when not index 0", () => {
    const parties = [
      { name: "Sarah", role: "party", email: "s@example.com" } as AgreementParty,
      { name: "Anthem", role: "owner", email: "a@example.com" } as AgreementParty,
    ];
    expect(resolveReviewLinkAssumedOwnerPartyIndex(parties)).toBe(1);
    expect(countReadyReviewLinkInviteParties(parties)).toBe(1);
  });
});

describe("logReviewLinkRecipientEmailPreflight", () => {
  it("emits counts without @ or local-part (privacy)", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const draft = {
      parties: [
        { name: "Anthem", role: "owner", email: "anthem.blanchard.qa@example.com" } as AgreementParty,
        { name: "Sarah Collins", role: "party", email: "sarah.collins.qa@example.org" } as AgreementParty,
      ],
    } as AgreementDraft;
    logReviewLinkRecipientEmailPreflight(draft);
    const payload = spy.mock.calls.find((c) => c[0] === "[review-link-recipient-email-preflight]")?.[1] as Record<
      string,
      unknown
    >;
    expect(payload?.recipientEmailCount).toBe(2);
    expect(payload?.counterpartyEmailCount).toBe(1);
    expect(payload?.contactRequiredSlots).toBe(1);
    expect(payload?.assumedOwnerPartyIndex).toBe(0);
    const serialized = JSON.stringify(spy.mock.calls);
    expect(serialized).not.toMatch(/@/);
    spy.mockRestore();
  });

  it("counterpartyEmailCount 0 when only assumed owner has email", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logReviewLinkRecipientEmailPreflight({
      parties: [{ name: "Owner", role: "owner", email: "o@example.com" } as AgreementParty],
    } as AgreementDraft);
    const payload = spy.mock.calls.find((c) => c[0] === "[review-link-recipient-email-preflight]")?.[1] as Record<
      string,
      unknown
    >;
    expect(payload?.recipientEmailCount).toBe(1);
    expect(payload?.counterpartyEmailCount).toBe(0);
    spy.mockRestore();
  });
});

describe("mergeLiveDraftWithRecipientSetupForReviewLinks", () => {
  it("does not apply invalid email slots", () => {
    const d = {
      id: "ag-3",
      parties: [{ name: "A", role: "owner", email: "keep@valid.test" }],
    } as AgreementDraft;
    const out = mergeLiveDraftWithRecipientSetupForReviewLinks(d, {
      recipient1Email: "not-an-email",
      recipient2Email: "",
    });
    expect(out?.parties[0].email).toBe("keep@valid.test");
  });

  it("applies plausible recipient1 and recipient2 like VS01 bridge helper", () => {
    const d = {
      id: "ag-4",
      parties: [
        { name: "A", role: "owner" },
        { name: "B", role: "reviewer" },
      ],
    } as AgreementDraft;
    const out = mergeLiveDraftWithRecipientSetupForReviewLinks(d, {
      recipient1Email: "a@ok.test",
      recipient2Email: "b@ok.test",
    });
    expect(out?.parties[0].email).toContain("ok.test");
    expect(out?.parties[1].email).toContain("ok.test");
  });
});
