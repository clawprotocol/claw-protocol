import { describe, expect, it, vi } from "vitest";
import {
  assessGuidedAuthoritativeReviewSync,
  logGuidedAuthoritativeReviewSync,
} from "./guidedAuthoritativeReviewSync";

describe("guidedAuthoritativeReviewSync", () => {
  it("reports synced when authoritative and rendered lengths match within 5%", () => {
    const body = "Agreement text\n" + "a".repeat(1200);
    const r = assessGuidedAuthoritativeReviewSync({
      authoritativePlain: body,
      renderedPreviewPlain: body,
      reviewDraft: { premium_full_document_text: body } as import("../intakeSmartDefaults").ParsedDraftShape,
    });
    expect(r.synced).toBe(true);
    expect(r.authoritativeLen).toBe(body.length);
  });

  it("warns when review render drifts from authoritative body", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const auth = "x".repeat(1000);
    const stale = "y".repeat(500);
    const r = logGuidedAuthoritativeReviewSync({
      authoritativePlain: auth,
      renderedPreviewPlain: stale,
      reviewDraft: { premium_full_document_text: stale } as import("../intakeSmartDefaults").ParsedDraftShape,
    });
    expect(r.synced).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
