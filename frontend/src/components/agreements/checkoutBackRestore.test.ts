/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildCreateReturnToWithStarterReviewRestore,
  clearCheckoutBackRestoreSnapshot,
  hasCheckoutBackRestoreSnapshot,
  isCheckoutBackRestoreRequested,
  persistStarterReviewBeforeCheckout,
  readCheckoutBackRestoreSnapshot,
} from "./checkoutBackRestore";
import {
  readCreateReviewDraftReadyMarker,
  readCreateReviewDraftSnapshot,
} from "./agreementIntakeStorage";

const SAMPLE_DRAFT: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Acme LLC", role: "vendor" },
    { name: "Beta Inc.", role: "client" },
  ],
  purpose: "Monthly SaaS support",
  payment_terms: "Net 30",
  payment: { amount: null, cadence: null, valid: false },
  duration: "1 year",
  due_date: null,
  effective_date: null,
  additional_terms: null,
};

describe("checkoutBackRestore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCheckoutBackRestoreSnapshot();
  });

  it("persists intake, draft snapshot, and draft-ready marker before checkout", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: "SaaS between Acme LLC and Beta Inc.",
      draft: SAMPLE_DRAFT,
      previewText: "SERVICES AGREEMENT\n\nBetween Acme and Beta.",
    });
    expect(hasCheckoutBackRestoreSnapshot()).toBe(true);
    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap?.intakeText).toContain("Acme");
    expect(snap?.draft.title).toBe("Services Agreement");
    expect(snap?.previewText).toContain("SERVICES");
    expect(readCreateReviewDraftReadyMarker()).toBe(true);
    expect(readCreateReviewDraftSnapshot<ParsedDraftShape>()?.title).toBe("Services Agreement");
  });

  it("builds create return URL with restore query", () => {
    expect(buildCreateReturnToWithStarterReviewRestore()).toBe("/app/create?restore=starterReview");
    expect(isCheckoutBackRestoreRequested("?restore=starterReview")).toBe(true);
    expect(isCheckoutBackRestoreRequested("")).toBe(false);
  });

  it("clears stale snapshot after max age", () => {
    persistStarterReviewBeforeCheckout({ intakeText: "x".repeat(12), draft: SAMPLE_DRAFT });
    const raw = sessionStorage.getItem("claw_checkout_back_starter_review_v1");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { savedAt: number };
    parsed.savedAt = Date.now() - 25 * 60 * 60 * 1000;
    sessionStorage.setItem("claw_checkout_back_starter_review_v1", JSON.stringify(parsed));
    expect(readCheckoutBackRestoreSnapshot()).toBeNull();
  });
});
