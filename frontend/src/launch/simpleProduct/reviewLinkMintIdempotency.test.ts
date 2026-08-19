/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import {
  activeReviewInvitePartyIdsFromRegistry,
  clearReviewLinkPartyMintLocksForTests,
  existingReviewLinkRowForParty,
  hydrateReviewPartyIdsFromAuthority,
  mergeReviewLinkRowsByPartyId,
  RECIPIENT_LINK_INVALID_OR_EXPIRED_MESSAGE as IDEMPOTENCY_INVALID_MESSAGE,
  REVIEW_LINKS_ALREADY_READY_MESSAGE,
  stableReviewRecipientPartyId,
  tryBeginReviewLinkPartyMint,
  endReviewLinkPartyMint,
} from "./reviewLinkMintIdempotency";
import {
  mintSimpleDoneReviewRecipientLinkRows,
  writeSimpleDoneReviewRecipientLinks,
} from "./simpleDoneReviewRecipientLinks";

const ALPHA = "61774ba6-4a05-4f6d-8b30-4b8e0f26bfc9";
const BETA = "296c9837-1f58-4ba9-b880-8e514c4dbeb0";
const GAMMA = "aa36e24c-193f-41cf-bb30-ddaa132833a0";

function threePartyDraft(overrides?: Partial<AgreementParty>[]): AgreementDraft {
  const parties: AgreementParty[] = [
    { id: ALPHA, name: "Alpha IP Holdings LLC", role: "owner", email: "a@example.com" },
    { id: BETA, name: "Beta Research LLC", role: "reviewer", email: "b@example.com" },
    { id: GAMMA, name: "Gamma Distribution LLC", role: "reviewer", email: "c@example.com" },
  ];
  if (overrides) {
    overrides.forEach((o, i) => {
      if (parties[i]) parties[i] = { ...parties[i], ...o };
    });
  }
  return { id: "ag_34c0", parties } as AgreementDraft;
}

function registry(activeIds: string[]) {
  const recipients: Record<string, { participant_id: string; active_jti: string }> = {};
  for (const id of activeIds) {
    recipients[`review:${id}`] = { participant_id: id, active_jti: `jti_${id.slice(0, 8)}` };
  }
  return { v: 1, revision: 1, recipients };
}

describe("review-link mint idempotency", () => {
  const sessionStore = new Map<string, string>();

  beforeEach(() => {
    sessionStore.clear();
    clearReviewLinkPartyMintLocksForTests();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (sessionStore.has(k) ? sessionStore.get(k)! : null),
      setItem: (k: string, v: string) => void sessionStore.set(k, v),
      removeItem: (k: string) => void sessionStore.delete(k),
    } as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearReviewLinkPartyMintLocksForTests();
  });

  it("keeps the invalid/expired recovery message", () => {
    expect(IDEMPOTENCY_INVALID_MESSAGE).toBe(
      "This link is invalid or expired. Request a new link from the sender.",
    );
  });

  it("recovers party 3 id by legal name, not array position", () => {
    const hydrated = hydrateReviewPartyIdsFromAuthority(
      [
        { name: "Gamma Distribution LLC", role: "reviewer", email: "c@example.com" },
        { name: "Alpha IP Holdings LLC", role: "owner", email: "a@example.com" },
        { name: "Beta Research LLC", role: "reviewer", email: "b@example.com" },
      ],
      threePartyDraft().parties,
    );
    expect(stableReviewRecipientPartyId(hydrated[0]?.id)).toBe(GAMMA);
    expect(stableReviewRecipientPartyId(hydrated[1]?.id)).toBe(ALPHA);
    expect(stableReviewRecipientPartyId(hydrated[2]?.id)).toBe(BETA);
  });

  it("complete three-party remint creates zero new tokens", async () => {
    const mint = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/recipient-access-token")) {
          mint();
          return { ok: true, json: async () => ({ token: "should-not-mint" }) };
        }
        return {
          ok: true,
          json: async () => ({
            draft: {
              parties: threePartyDraft().parties,
              recipient_delivery_v1: registry([ALPHA, BETA, GAMMA]),
            },
          }),
        };
      }) as unknown as typeof fetch,
    );
    writeSimpleDoneReviewRecipientLinks({
      agreementId: "ag_34c0",
      recipients: [
        { displayName: "Alpha", reviewHref: "https://x/a", recipientPartyId: ALPHA },
        { displayName: "Beta", reviewHref: "https://x/b", recipientPartyId: BETA },
        { displayName: "Gamma", reviewHref: "https://x/c", recipientPartyId: GAMMA },
      ],
    });
    const result = await mintSimpleDoneReviewRecipientLinkRows({
      agreementId: "ag_34c0",
      draft: threePartyDraft(),
      includeOwnerWithReadyReviewEmail: true,
    });
    expect(mint).not.toHaveBeenCalled();
    expect(result.attemptedMintCount).toBe(0);
    expect(result.alreadyReady).toBe(true);
    expect(result.reusedCount).toBe(3);
    expect(REVIEW_LINKS_ALREADY_READY_MESSAGE).toBe("Review links are already ready.");
  });

  it("partial prior mint creates only the missing party link", async () => {
    const mintedIds: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/recipient-access-token")) {
          const body = JSON.parse(String(init?.body ?? "{}"));
          mintedIds.push(String(body.recipient_party_id ?? ""));
          return {
            ok: true,
            json: async () => ({ token: `tok_${body.recipient_party_id}`, expires_in_seconds: 60, locked_version_id: "lv" }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            draft: {
              parties: threePartyDraft().parties,
              recipient_delivery_v1: registry([ALPHA, BETA]),
            },
          }),
        };
      }) as unknown as typeof fetch,
    );
    const result = await mintSimpleDoneReviewRecipientLinkRows({
      agreementId: "ag_34c0",
      draft: threePartyDraft(),
      includeOwnerWithReadyReviewEmail: true,
    });
    expect(mintedIds).toEqual([GAMMA]);
    expect(result.attemptedMintCount).toBe(1);
    expect(result.alreadyReady).toBe(false);
    expect(result.rows.some((r) => r.recipientPartyId === GAMMA && r.reviewHref.includes(GAMMA))).toBe(true);
  });

  it("double-click / concurrent retry mints a party at most once", async () => {
    let mintStarts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/recipient-access-token")) {
          mintStarts += 1;
          const body = JSON.parse(String(init?.body ?? "{}"));
          await new Promise((r) => setTimeout(r, 20));
          return {
            ok: true,
            json: async () => ({ token: `tok_${body.recipient_party_id}`, expires_in_seconds: 60, locked_version_id: "lv" }),
          };
        }
        return { ok: true, json: async () => ({ draft: { parties: threePartyDraft().parties } }) };
      }) as unknown as typeof fetch,
    );
    const draft = threePartyDraft();
    const [a, b] = await Promise.all([
      mintSimpleDoneReviewRecipientLinkRows({
        agreementId: "ag_34c0",
        draft,
        includeOwnerWithReadyReviewEmail: true,
      }),
      mintSimpleDoneReviewRecipientLinkRows({
        agreementId: "ag_34c0",
        draft,
        includeOwnerWithReadyReviewEmail: true,
      }),
    ]);
    expect(mintStarts).toBeLessThanOrEqual(3);
    expect(a.attemptedMintCount + b.attemptedMintCount).toBeLessThanOrEqual(3);
  });

  it("reordered recipients keep the same party ids", () => {
    const reordered: AgreementParty[] = [
      { name: "Gamma Distribution LLC", role: "reviewer", email: "c@example.com" },
      { name: "Beta Research LLC", role: "reviewer", email: "b@example.com" },
      { name: "Alpha IP Holdings LLC", role: "owner", email: "a@example.com" },
    ];
    const hydrated = hydrateReviewPartyIdsFromAuthority(reordered, threePartyDraft().parties);
    expect(hydrated.map((p) => stableReviewRecipientPartyId(p.id))).toEqual([GAMMA, BETA, ALPHA]);
    const active = activeReviewInvitePartyIdsFromRegistry(registry([GAMMA]));
    expect(active.has(GAMMA)).toBe(true);
    expect(existingReviewLinkRowForParty(
      [{ displayName: "G", reviewHref: "https://x/g", recipientPartyId: GAMMA }],
      hydrated[0]!.id!,
    )?.reviewHref).toBe("https://x/g");
  });

  it("treats a complete registry as already ready even when the client lost party ids", async () => {
    const mint = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/recipient-access-token")) {
          mint();
          return { ok: true, json: async () => ({ token: "x" }) };
        }
        return {
          ok: true,
          json: async () => ({
            draft: {
              parties: [],
              recipient_delivery_v1: registry([ALPHA, BETA, GAMMA]),
            },
          }),
        };
      }) as unknown as typeof fetch,
    );
    const result = await mintSimpleDoneReviewRecipientLinkRows({
      agreementId: "ag_34c0",
      draft: {
        id: "ag_34c0",
        parties: [
          { name: "Alpha IP Holdings LLC", role: "owner", email: "a@example.com" },
          { name: "Beta Research LLC", role: "reviewer", email: "b@example.com" },
          { name: "Gamma Distribution LLC", role: "reviewer", email: "c@example.com" },
        ],
      } as AgreementDraft,
      includeOwnerWithReadyReviewEmail: true,
    });
    expect(mint).not.toHaveBeenCalled();
    expect(result.attemptedMintCount).toBe(0);
    expect(result.alreadyReady).toBe(true);
    expect(result.lastMintErrorCode).toBeUndefined();
  });

  it("never mints without a recovered party id on a three-party draft", async () => {
    const mint = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/recipient-access-token")) {
          mint();
          return { ok: true, json: async () => ({ token: "x" }) };
        }
        return { ok: true, json: async () => ({ draft: { parties: [] } }) };
      }) as unknown as typeof fetch,
    );
    const result = await mintSimpleDoneReviewRecipientLinkRows({
      agreementId: "ag_34c0",
      draft: {
        id: "ag_34c0",
        parties: [
          { name: "Alpha IP Holdings LLC", role: "owner", email: "a@example.com" },
          { name: "Beta Research LLC", role: "reviewer", email: "b@example.com" },
          { name: "Gamma Distribution LLC", role: "reviewer", email: "c@example.com" },
        ],
      } as AgreementDraft,
      includeOwnerWithReadyReviewEmail: true,
    });
    expect(mint).not.toHaveBeenCalled();
    expect(result.lastMintErrorCode).toBe("recipient_party_id_required");
    expect(result.attemptedMintCount).toBe(0);
  });

  it("explicit regeneration is not implied by remint merge", () => {
    const merged = mergeReviewLinkRowsByPartyId(
      [{ displayName: "Beta", reviewHref: "https://x/original-beta", recipientPartyId: BETA }],
      [{ displayName: "Alpha", reviewHref: "https://x/a", recipientPartyId: ALPHA }],
    );
    expect(existingReviewLinkRowForParty(merged, BETA)?.reviewHref).toBe("https://x/original-beta");
    expect(tryBeginReviewLinkPartyMint("ag", BETA)).toBe(true);
    expect(tryBeginReviewLinkPartyMint("ag", BETA)).toBe(false);
    endReviewLinkPartyMint("ag", BETA);
  });
});
