import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_DETAIL,
  OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_TITLE,
  OWNER_CTA_DISMISS_SUCCESS,
  OWNER_CTA_GO_TO_SIGNERS,
  OWNER_LOCK_AND_CONTINUE_TO_SIGNING,
  OWNER_NEXT_CONFIRM_SIGNERS_AND_SEND,
  OWNER_NEXT_LOCK_THEN_SEND,
  OWNER_NEXT_SEND_FOR_SIGNATURE,
  OWNER_POST_ACCEPT_LOCK_EXPLAINER,
  OWNER_SEND_FOR_SIGNATURE,
} from "./ownerRecipientSuggestedEditsCopy";

describe("ownerRecipientSuggestedEditsCopy", () => {
  it("exports post-accept signing handoff strings (LawDog-facing)", () => {
    expect(OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_TITLE).toBe("Changes accepted");
    expect(OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_DETAIL).toContain("draft has been updated");
    expect(OWNER_NEXT_CONFIRM_SIGNERS_AND_SEND).toContain("confirm signers");
    expect(OWNER_NEXT_SEND_FOR_SIGNATURE).toContain("send for signature");
    expect(OWNER_NEXT_LOCK_THEN_SEND).toMatch(/lock this version/i);
    expect(OWNER_CTA_GO_TO_SIGNERS).toBeTruthy();
    expect(OWNER_CTA_DISMISS_SUCCESS).toBeTruthy();
    expect(OWNER_SEND_FOR_SIGNATURE).toBeTruthy();
    expect(OWNER_LOCK_AND_CONTINUE_TO_SIGNING).toBe("Lock and continue to signing");
    expect(OWNER_LOCK_AND_CONTINUE_TO_SIGNING).not.toBe("Continue to signing");
    expect(OWNER_POST_ACCEPT_LOCK_EXPLAINER).toContain("locks the accepted draft");
    const src = readFileSync(join(__dirname, "ownerRecipientSuggestedEditsCopy.ts"), "utf8");
    expect(src).not.toMatch(/Continue to signing/);
    for (const line of [
      OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_TITLE,
      OWNER_ACCEPT_SUGGESTED_CHANGES_SUCCESS_DETAIL,
      OWNER_NEXT_CONFIRM_SIGNERS_AND_SEND,
      OWNER_NEXT_SEND_FOR_SIGNATURE,
      OWNER_NEXT_LOCK_THEN_SEND,
    ]) {
      expect(line).not.toMatch(/\bCLAW\b/i);
    }
  });
});
