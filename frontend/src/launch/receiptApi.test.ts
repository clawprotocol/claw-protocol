import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerApiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/ownerApiClient", () => ({ ownerApiFetch: ownerApiFetchMock }));

import { fetchUsageBundle, fetchUsageReceipt } from "./receiptApi";

describe("usage receipt owner API calls", () => {
  beforeEach(() => ownerApiFetchMock.mockReset());

  it("loads both receipt forms through owner authentication", async () => {
    ownerApiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ usage_event_id: "usage_1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ bundle: true }), { status: 200 }));

    expect((await fetchUsageReceipt("usage_1")).error).toBeNull();
    expect((await fetchUsageBundle("usage_1")).error).toBeNull();

    expect(ownerApiFetchMock).toHaveBeenNthCalledWith(
      1,
      "/v1/usage/usage_1/receipt",
      expect.objectContaining({ method: "GET" }),
    );
    expect(ownerApiFetchMock).toHaveBeenNthCalledWith(
      2,
      "/v1/usage/usage_1/bundle",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
