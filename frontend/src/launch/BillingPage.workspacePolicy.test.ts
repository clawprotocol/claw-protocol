import { afterEach, describe, expect, it, vi } from "vitest";
import { isBillingWorkspaceIdEditable } from "./BillingPage";

describe("billing workspace identity policy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not allow customers to edit server-bound workspace identity in production", () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_CLAW_ACCESS_DEV_TOOLS", "0");
    expect(isBillingWorkspaceIdEditable()).toBe(false);
  });

  it("keeps the workspace diagnostic available to explicit development tooling", () => {
    vi.stubEnv("VITE_CLAW_ACCESS_DEV_TOOLS", "1");
    expect(isBillingWorkspaceIdEditable()).toBe(true);
  });
});
