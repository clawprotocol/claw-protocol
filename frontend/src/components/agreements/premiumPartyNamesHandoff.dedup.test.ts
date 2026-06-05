/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  persistPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
} from "./premiumPartyNamesHandoff";

describe("premiumPartyNamesHandoff dedup", () => {
  afterEach(() => {
    resetPremiumRecipientHandoffDedupForTests();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("skips session write and handoff-write log when payload is unchanged", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    persistPremiumRecipientHandoff({
      party1: {
        name: "Blue Canyon Analytics LLC",
        email: "a@example.com",
        role: "Client",
        signerName: "Sarah Mitchell",
        signerTitle: "CEO",
      },
      party2: {
        name: "Iron Vale Systems Inc.",
        email: "b@example.com",
        role: "Service Provider",
        signerName: "Michael Torres",
        signerTitle: "President",
      },
    });
    persistPremiumRecipientHandoff({
      party1: {
        name: "Blue Canyon Analytics LLC",
        email: "a@example.com",
        role: "Client",
        signerName: "Sarah Mitchell",
        signerTitle: "CEO",
      },
      party2: {
        name: "Iron Vale Systems Inc.",
        email: "b@example.com",
        role: "Service Provider",
        signerName: "Michael Torres",
        signerTitle: "President",
      },
    });
    const writes = info.mock.calls.filter((c) => c[0] === "[review-link-signer-metadata-handoff-write]");
    expect(writes).toHaveLength(1);
  });
});
