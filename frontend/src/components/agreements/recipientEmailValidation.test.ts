import { describe, expect, it } from "vitest";
import {
  isRecipientEmailTypingInProgress,
  looksLikeEmail,
  shouldShowRecipientEmailFormatError,
  stripRecipientEmailNoise,
} from "./recipientEmailValidation";

describe("stripRecipientEmailNoise", () => {
  it("trims and strips zero-width space", () => {
    expect(stripRecipientEmailNoise("  a\u200Bb@c.com  ")).toBe("ab@c.com");
  });
});

describe("looksLikeEmail", () => {
  it("accepts typical addresses", () => {
    expect(looksLikeEmail("a@b.co")).toBe(true);
    expect(looksLikeEmail("name+tag@example.com")).toBe(true);
  });
  it("rejects missing or malformed", () => {
    expect(looksLikeEmail("")).toBe(false);
    expect(looksLikeEmail("not-an-email")).toBe(false);
    expect(looksLikeEmail("@nodomain.com")).toBe(false);
    expect(looksLikeEmail("no-at.com")).toBe(false);
    expect(looksLikeEmail("spaces in@local.com")).toBe(false);
  });
  it("accepts long single-label host (internal style)", () => {
    expect(looksLikeEmail("user@internalhost")).toBe(true);
  });
});

describe("recipient email format error surfacing", () => {
  it("suppresses errors while the user is mid-typing partial domains", () => {
    expect(isRecipientEmailTypingInProgress("crypto@domain.")).toBe(true);
    expect(shouldShowRecipientEmailFormatError("crypto@domain.")).toBe(false);
    expect(shouldShowRecipientEmailFormatError("crypto@domain.", { touched: true })).toBe(true);
  });

  it("shows clearly invalid values and blocks finalize validation", () => {
    expect(shouldShowRecipientEmailFormatError("not-an-email")).toBe(true);
    expect(looksLikeEmail("not-an-email")).toBe(false);
  });
});
