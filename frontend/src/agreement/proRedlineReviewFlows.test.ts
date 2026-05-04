/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from "vitest";
import { PRO_REDLINE_REVIEWER_SUGGEST_SUCCESS_COPY } from "./AgreementRecipientReview";
import { postProRedlineReviewerSuggestion } from "./proRedlineReviewApi";

describe("Pro redline recipient copy", () => {
  it("exposes stable success copy for reviewer submit", () => {
    expect(PRO_REDLINE_REVIEWER_SUGGEST_SUCCESS_COPY).toContain("owner chooses");
  });
});

describe("postProRedlineReviewerSuggestion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs JSON with participant and suggestion text", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, suggestion_id: "sug-1" }),
    } as unknown as Response);
    const r = await postProRedlineReviewerSuggestion({
      agreementId: "ag-99",
      participantId: "party-1",
      suggestionText: "Please shorten the term.",
      reviewerDisplayName: "Alex",
      reviewerEmail: "alex@example.com",
      recipientAccessToken: "tok",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.suggestion_id).toBe("sug-1");
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toContain("/api/agreements/ag-99/pro-redline/reviewer-suggestion");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body.participant_id).toBe("party-1");
    expect(body.suggestion_text).toBe("Please shorten the term.");
  });
});
