import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  mintSimpleDoneReviewRecipientLinkRows,
  readSimpleDoneReviewRecipientLinks,
  writeSimpleDoneReviewRecipientLinks,
} from "./simpleDoneReviewRecipientLinks";

describe("simpleDoneReviewRecipientLinks session handoff", () => {
  const sessionStore = new Map<string, string>();

  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (sessionStore.has(k) ? sessionStore.get(k)! : null),
      setItem: (k: string, v: string) => void sessionStore.set(k, v),
      removeItem: (k: string) => void sessionStore.delete(k),
    } as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips recipient rows without persisting tokens in a separate log channel", () => {
    writeSimpleDoneReviewRecipientLinks({
      agreementId: "ag_test_1",
      recipients: [{ displayName: "Sarah Collins", reviewHref: "https://example.com/agreements/ag_test_1/review?t=tok_abc" }],
    });
    const read = readSimpleDoneReviewRecipientLinks("ag_test_1");
    expect(read?.recipients.length).toBe(1);
    expect(read?.recipients[0]?.displayName).toBe("Sarah Collins");
    expect(read?.recipients[0]?.reviewHref).toContain("/review?t=");
    expect(read?.recipients[0]?.reviewHref).not.toContain("/verify/");
  });

  it("drops rows with empty href on read", () => {
    writeSimpleDoneReviewRecipientLinks({
      agreementId: "ag_x",
      recipients: [{ displayName: "A", reviewHref: "   " }],
    });
    const read = readSimpleDoneReviewRecipientLinks("ag_x");
    expect(read?.recipients.length).toBe(0);
  });

  it("round-trips reviewLinksPending flag", () => {
    writeSimpleDoneReviewRecipientLinks({
      agreementId: "ag_pending",
      recipients: [],
      reviewLinksPending: true,
    });
    const read = readSimpleDoneReviewRecipientLinks("ag_pending");
    expect(read?.recipients.length).toBe(0);
    expect(read?.reviewLinksPending).toBe(true);
  });
});

describe("mintSimpleDoneReviewRecipientLinkRows", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mints review links for ready non-owner parties", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ token: "tok_mint_test", expires_in_seconds: 3600, locked_version_id: "lv1" }),
      })) as unknown as typeof fetch,
    );
    const draft = {
      id: "ag_mint",
      parties: [
        { id: "p_owner", name: "Owner", role: "owner", email: "o@example.com" },
        { id: "p_rev", name: "Sarah Collins", role: "reviewer", email: "sarah@example.com" },
      ],
    } as AgreementDraft;
    const { rows, attemptedMintCount, firstErrorStatus } = await mintSimpleDoneReviewRecipientLinkRows({
      agreementId: "ag_mint",
      draft,
    });
    expect(rows.length).toBe(1);
    expect(attemptedMintCount).toBe(1);
    expect(firstErrorStatus).toBeUndefined();
    expect(rows[0]!.displayName).toBe("Sarah Collins");
    expect(rows[0]!.reviewHref).toContain("/agreements/ag_mint/review?t=tok_mint_test");
    expect(rows[0]!.reviewHref).not.toContain("/verify/");
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalled();
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/recipient-access-token");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.mode).toBe("review");
    expect(body.recipient_party_id).toBe("p_rev");
  });

  it("returns empty rows on 503 with attempted count and error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ detail: "unavailable" }),
      })) as unknown as typeof fetch,
    );
    const draft = {
      id: "ag_503",
      parties: [
        { id: "p_owner", name: "Owner", role: "owner", email: "o@example.com" },
        { id: "p_rev", name: "Sarah Collins", role: "reviewer", email: "sarah@example.com" },
      ],
    } as AgreementDraft;
    const { rows, attemptedMintCount, firstErrorStatus } = await mintSimpleDoneReviewRecipientLinkRows({
      agreementId: "ag_503",
      draft,
    });
    expect(rows.length).toBe(0);
    expect(attemptedMintCount).toBe(1);
    expect(firstErrorStatus).toBe(503);
  });
});
