import { describe, expect, it } from "vitest";
import {
  GUIDED_MIN_AUTHORITATIVE_BODY_LEN,
  canDisplayPaidProAgreementDuringGuided,
  resolveGuidedCompletionRenderDocument,
  shouldBlockProEmptyDocumentFallback,
  updateLastKnownGoodAuthoritativeDraftRef,
} from "./guidedCompletionRenderAuthority";

const LONG_AUTH = "SERVICES AGREEMENT\n" + "x".repeat(GUIDED_MIN_AUTHORITATIVE_BODY_LEN);
const LONG_PREVIEW = "Preview agreement\n" + "y".repeat(400);
const SHORT = "too short";

describe("resolveGuidedCompletionRenderDocument", () => {
  it("prefers authoritative hydrated over preview during guided completion", () => {
    const r = resolveGuidedCompletionRenderDocument({
      guidedCompletionActive: true,
      authoritativeHydratedPlain: LONG_AUTH,
      renderedPreviewPlain: LONG_PREVIEW,
      lastKnownGoodPlain: "",
    });
    expect(r.source).toBe("authoritative_hydrated_premium");
    expect(r.plainText).toBe(LONG_AUTH);
    expect(r.blockedEmptyState).toBe(true);
  });

  it("uses lastKnownGood when picker and hydrated are empty during guided apply race", () => {
    const r = resolveGuidedCompletionRenderDocument({
      guidedCompletionActive: true,
      authoritativeHydratedPlain: "",
      pickerPlain: "",
      lastKnownGoodPlain: LONG_AUTH,
      renderedPreviewPlain: LONG_PREVIEW,
    });
    expect(r.source).toBe("last_known_good_authoritative");
    expect(r.usedLastKnownGood).toBe(true);
    expect(r.plainText).toBe(LONG_AUTH);
  });

  it("never prefers rendered preview over lastKnownGood during guided completion", () => {
    const r = resolveGuidedCompletionRenderDocument({
      guidedCompletionActive: true,
      lastKnownGoodPlain: LONG_AUTH,
      renderedPreviewPlain: LONG_PREVIEW + "z".repeat(2000),
    });
    expect(r.source).toBe("last_known_good_authoritative");
  });

  it("blocks empty state when authoritative length exists", () => {
    const r = resolveGuidedCompletionRenderDocument({
      guidedCompletionActive: true,
      authoritativeHydratedPlain: LONG_AUTH,
      pickerPlain: SHORT,
    });
    expect(shouldBlockProEmptyDocumentFallback(r)).toBe(true);
  });

  it("allows display during guided when canProceed flickers false but lastKnownGood exists", () => {
    const r = resolveGuidedCompletionRenderDocument({
      guidedCompletionActive: true,
      lastKnownGoodPlain: LONG_AUTH,
    });
    expect(
      canDisplayPaidProAgreementDuringGuided({
        canProceedWithPaidProDocument: false,
        guidedCompletionActive: true,
        renderDocument: r,
      }),
    ).toBe(true);
  });

  it("updateLastKnownGoodAuthoritativeDraftRef persists corpus across transitions", () => {
    const ref = { current: "" };
    expect(updateLastKnownGoodAuthoritativeDraftRef(ref, LONG_AUTH, "test")).toBe(true);
    expect(ref.current).toBe(LONG_AUTH);
    expect(updateLastKnownGoodAuthoritativeDraftRef(ref, LONG_AUTH, "dup")).toBe(false);
    expect(updateLastKnownGoodAuthoritativeDraftRef(ref, SHORT, "short")).toBe(false);
  });
});
