/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetRuntimeEnvironmentCacheForTests } from "../config/runtimeEnvironment";
import { fetchRecipientDeliveryStatus } from "./recipientDeliveryStatus";

describe("recipientDeliveryStatus API routing", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        review_sent: true,
        signing_invites_sent: false,
        recipients: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VITE_CLAW_API_BASE", "https://claw-protocol-production.up.railway.app");
    // Runtime env is memoized; clear after stub so apiUrl sees the configured production base.
    resetRuntimeEnvironmentCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetRuntimeEnvironmentCacheForTests();
  });

  it("uses configured API base instead of window.location.origin", async () => {
    await fetchRecipientDeliveryStatus("10737cbf-7b9a-491a-ad50-065486e70a25");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      "https://claw-protocol-production.up.railway.app/api/agreements/10737cbf-7b9a-491a-ad50-065486e70a25/recipient-delivery-status",
    );
    expect(url).not.toContain("believable-gentleness");
  });
});
