import { describe, expect, it, vi, beforeEach } from "vitest";
import { getApiReachabilityState, probeApiHealth } from "./apiReachability";

vi.mock("./clawApi", () => ({
  apiUrl: (p: string) => `http://127.0.0.1:8000${p}`,
  getApiBase: () => "",
  resolveApiBase: () => "http://127.0.0.1:8000",
  isProductionApiMisconfigured: () => false,
}));

describe("apiReachability", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true }),
    );
  });

  it("marks ok when health responds", async () => {
    const state = await probeApiHealth(true);
    expect(state).toBe("ok");
    expect(getApiReachabilityState()).toBe("ok");
  });
});
