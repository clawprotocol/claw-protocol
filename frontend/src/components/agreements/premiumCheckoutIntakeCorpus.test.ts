/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistStarterReviewBeforeCheckout } from "./checkoutBackRestore";
import { buildReviewCoercionRawIntakeFromDraft } from "./premiumCheckoutRawIntake";
import {
  resolvePremiumCheckoutIntakeCorpus,
} from "./premiumCheckoutIntakeCorpus";
import { writeOriginalUserIntakeRawAtDraftCommit } from "./originalUserIntakeRawStorage";
import { test435Draft } from "./paidProTest435Fixtures";
import { TEST436_HOMEPAGE_INTAKE } from "./paidProTest436Fixtures";

describe("premiumCheckoutIntakeCorpus", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    storage.clear();
  });

  afterEach(() => {
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("does not prefer starter preview document over session original", () => {
    writeOriginalUserIntakeRawAtDraftCommit(TEST436_HOMEPAGE_INTAKE);
    const resolved = resolvePremiumCheckoutIntakeCorpus({
      structuredDraft: test435Draft(),
      intakeCombined: "",
      agreementDocumentText: "A".repeat(800),
      allowDocumentFallback: false,
    });
    expect(resolved.corpus).toContain("Red Mesa Logistics LLC");
    expect(resolved.chosenSource).toBe("session_original");
  });

  it("without session original, falls back to structured coercion", () => {
    const short = buildReviewCoercionRawIntakeFromDraft(test435Draft(), "");
    storage.set(
      "claw_create_complexity_resume_v1",
      JSON.stringify({
        version: 1,
        rawIntake: short,
        pending: test435Draft(),
        awaitingProCheckout: true,
        savedAt: Date.now(),
        resume_kind: "optional_full_upgrade",
      }),
    );
    persistStarterReviewBeforeCheckout({
      intakeText: short,
      draft: test435Draft(),
    });
    const resolved = resolvePremiumCheckoutIntakeCorpus({
      structuredDraft: test435Draft(),
      allowDocumentFallback: false,
    });
    expect(resolved.corpus).toBe(short);
    expect(["resume_raw", "checkout_back", "structured_coercion"]).toContain(resolved.chosenSource);
  });
});
