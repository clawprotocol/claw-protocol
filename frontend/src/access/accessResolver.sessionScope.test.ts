import { describe, expect, it, vi } from "vitest";

vi.mock("../config/featureFlags", () => ({ featureFlags: { serverBilling: true } }));
vi.mock("./subscriptionEntitlementCache", () => ({ subscriptionTierForAccess: () => "premium" }));

import { resolveAccess } from "./accessResolver";

describe("access resolver session scope", () => {
  it("does not grant a cached paid plan until the current user session is validated", () => {
    expect(resolveAccess({ allowServerSubscription: false }).tier).toBe("free");
    expect(resolveAccess({ allowServerSubscription: true }).tier).toBe("premium");
  });
});
