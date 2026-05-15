import { describe, expect, it, vi } from "vitest";
import { postReviewDeliveryDryRun } from "./reviewDeliveryDryRunApi";

describe("postReviewDeliveryDryRun", () => {
  it("parses payload_count from API response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          review_delivery_mode: "manual",
          payload_count: 4,
          payloads: Array.from({ length: 4 }, (_, i) => ({
            to: `u${i}@x.com`,
            party_name: `P${i}`,
            reviewer_name: `P${i}`,
            agreement_title: "T",
            review_url: null,
          })),
        }),
      })) as unknown as typeof fetch,
    );
    const out = await postReviewDeliveryDryRun("ag_1");
    expect(out?.payload_count).toBe(4);
    expect(out?.payloads?.length).toBe(4);
    vi.unstubAllGlobals();
  });
});
