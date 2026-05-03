import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import { clearPremiumPartyNamesHandoff } from "../../components/agreements/premiumPartyNamesHandoff";
import {
  countReadyReviewLinkInviteParties,
  mergeLiveDraftWithRecipientSetupForReviewLinks,
  mergeReviewLinkRecipientEmailsOntoHydratedDraft,
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
  it("passes with name and email only (no phone)", () => {
    expect(
      rowReadyForReviewLinkInvite({
        id: "p1",
        name: "Sam Reviewer",
        role: "reviewer",
        email: "sam@example.com",
        phone: "",
      } as AgreementParty),
    ).toBe(true);
  });

  it("fails when phone present but email missing", () => {
    expect(
      rowReadyForReviewLinkInvite({
        id: "p1",
        name: "Sam",
        role: "reviewer",
        email: "",
        phone: "5551234567",
      } as AgreementParty),
    ).toBe(false);
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
