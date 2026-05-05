import { describe, expect, it } from "vitest";
import { normalizeMintRecipientAccessTokenBody } from "./recipientAccessMintNormalize";

describe("normalizeMintRecipientAccessTokenBody", () => {
  it("accepts canonical token + locked_version_id", () => {
    const n = normalizeMintRecipientAccessTokenBody({
      token: "tok_a",
      expires_in_seconds: 120,
      locked_version_id: "lv1",
    });
    expect(n?.token).toBe("tok_a");
    expect(n?.locked_version_id).toBe("lv1");
    expect(n?.expires_in_seconds).toBe(120);
  });

  it("accepts snake_case review_url without token", () => {
    const n = normalizeMintRecipientAccessTokenBody({
      review_url: "/agreements/ag_x/review?t=tok_snake",
      locked_version_id: "lv2",
    });
    expect(n?.review_url).toContain("/review?t=tok_snake");
    expect(n?.token).toBeUndefined();
  });

  it("accepts camelCase reviewUrl under nested data", () => {
    const n = normalizeMintRecipientAccessTokenBody({
      data: { reviewUrl: "https://app.example/agreements/ag/review?t=t", locked_version_id: "lv3" },
    });
    expect(n?.review_url).toContain("https://app.example");
  });

  it("reads first links[] entry", () => {
    const n = normalizeMintRecipientAccessTokenBody({
      links: [{ review_url: "https://x.test/r" }],
      locked_version_id: "lv",
    });
    expect(n?.review_url).toBe("https://x.test/r");
  });

  it("matches recipients[] row by party id when requested", () => {
    const n = normalizeMintRecipientAccessTokenBody(
      {
        recipients: [
          { party_id: "p_other", review_url: "https://ignore" },
          { recipient_party_id: "p_rev", reviewUrl: "https://match/r" },
        ],
      },
      "p_rev",
    );
    expect(n?.review_url).toBe("https://match/r");
  });

  it("returns null when nothing usable is present", () => {
    expect(normalizeMintRecipientAccessTokenBody({ locked_version_id: "only" })).toBeNull();
  });
});
