/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  loadRecipientMagicLinkSession,
  saveRecipientMagicLinkSession,
} from "./recipientMagicLinkSession";
import { recipientLinkTokenFingerprint } from "./recipientLinkTokenFingerprint";

describe("recipientMagicLinkSession", () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it("scopes storage by agreement id + token fingerprint so two reviewers do not clobber each other", () => {
    const agreementId = "ag_scope_test";
    saveRecipientMagicLinkSession({
      agreementId,
      token: "token-aaa",
      recipientPartyId: "p-a",
    });
    saveRecipientMagicLinkSession({
      agreementId,
      token: "token-bbb",
      recipientPartyId: "p-b",
    });
    expect(loadRecipientMagicLinkSession(agreementId, "token-aaa")?.recipientPartyId).toBe("p-a");
    expect(loadRecipientMagicLinkSession(agreementId, "token-bbb")?.recipientPartyId).toBe("p-b");
    expect(loadRecipientMagicLinkSession(agreementId, "token-nope")).toBeNull();
    const fp = recipientLinkTokenFingerprint("token-bbb");
    expect(sessionStorage.getItem(`claw_rml_v2:${agreementId}:${fp}`)).toContain("p-b");
  });
});
