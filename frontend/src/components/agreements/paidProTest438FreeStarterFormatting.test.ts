import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import {
  isCleanFreeStarterServerPreview,
  resolveFreeStarterReviewBody,
} from "./freeStarterReviewBodyResolver";
import { writeOriginalUserIntakeRawAtDraftCommit } from "./originalUserIntakeRawStorage";
import {
  TEST438_INTAKE,
  test438Draft,
  test438DraftBareDuration,
  test438StructuredCoercionIntake,
} from "./paidProTest438Fixtures";
import { TEST435_RED_MESA, TEST435_HARBOR_PEAK } from "./paidProTest435Fixtures";

describe("TEST438 — Free Starter formatting regression (Red Mesa / Harbor Peak)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("buildStarterAgreementPreviewForReview keeps Term: 12 months and payment terms intact", () => {
    const preview = buildStarterAgreementPreviewForReview(test438Draft(), {
      intakeText: TEST438_INTAKE,
    });
    expect(preview).toMatch(/Term:\s*12 months/i);
    expect(preview).toMatch(/\$5,000 per month/i);
    expect(preview).toMatch(/15 days/i);
    expect(preview).not.toMatch(/\nmonths\s+Effective Date:/i);
    expect(preview).not.toMatch(/Term:\s*12 months Effective Date:/i);
    expect(isCleanFreeStarterServerPreview(preview)).toBe(true);
  });

  it("enriches bare duration from intake when API draft duration is only a number", () => {
    const preview = buildStarterAgreementPreviewForReview(test438DraftBareDuration(), {
      intakeText: TEST438_INTAKE,
    });
    expect(preview).toMatch(/Term:\s*12 months/i);
    expect(preview).not.toMatch(/\nmonths\s+Effective Date:/i);
  });

  it("prefers clean server/hydrated preview over repaired rebuild when hasDraftPayload is true", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    writeOriginalUserIntakeRawAtDraftCommit(TEST438_INTAKE);

    const cleanPreview = buildStarterAgreementPreviewForReview(test438Draft(), {
      intakeText: TEST438_INTAKE,
    });
    const coercion = test438StructuredCoercionIntake();
    expect(coercion.length).toBeGreaterThan(80);

    const resolved = resolveFreeStarterReviewBody({
      draft: test438DraftBareDuration(),
      rawIntake: coercion,
      currentPreview: cleanPreview,
      hasDraftPayload: true,
      apiPayload: { payment_terms: test438Draft().payment_terms },
    });

    expect(resolved.usedOriginalRaw).toBe(true);
    expect(resolved.source).toBe("current_preview_repaired");
    expect(resolved.body).toMatch(/Term:\s*12 months/i);
    expect(resolved.body).toMatch(/\$5,000 per month/i);
    expect(resolved.body).toMatch(/15 days/i);
    expect(resolved.body).not.toMatch(/\nmonths\s+Effective Date:/i);
    expect(resolved.body).toMatch(new RegExp(TEST435_RED_MESA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    expect(resolved.body).toMatch(new RegExp(TEST435_HARBOR_PEAK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("normalize path repairs split Term line artifacts from corrupted rebuild", () => {
    const corrupted = [
      "SERVICES AGREEMENT",
      "",
      `This Agreement is between ${TEST435_RED_MESA} ("Client") and ${TEST435_HARBOR_PEAK} ("Service Provider").`,
      "",
      "3. Services Term and Effective Date",
      "Term: 12",
      "months Effective Date: upon full execution by both parties",
      "",
      "4. Governing Law",
      "This Agreement shall be governed by the laws of Oklahoma, without regard to conflict-of-law principles.",
      "",
      "5. Termination",
      "Termination terms to be agreed by the Parties.",
    ].join("\n");

    const resolved = resolveFreeStarterReviewBody({
      draft: test438DraftBareDuration(),
      rawIntake: TEST438_INTAKE,
      currentPreview: corrupted,
      hasDraftPayload: true,
    });

    expect(resolved.body).toMatch(/Term:\s*12 months\nEffective Date:/i);
    expect(resolved.body).not.toMatch(/\nmonths\s+Effective Date:/i);
  });
});
