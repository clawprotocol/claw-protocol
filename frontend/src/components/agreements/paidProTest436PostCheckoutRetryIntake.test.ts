/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stashCreateComplexityResume } from "./agreementCreateComplexityResume";
import { persistStarterReviewBeforeCheckout } from "./checkoutBackRestore";
import {
  resolvePremiumCheckoutIntakeCorpus,
  resolvePremiumRequestIntakeText,
} from "./premiumCheckoutIntakeCorpus";
import { buildReviewCoercionRawIntakeFromDraft } from "./premiumCheckoutRawIntake";
import {
  readOriginalUserIntakeRaw,
  writeOriginalUserIntakeRawAtDraftCommit,
} from "./originalUserIntakeRawStorage";
import { test435Draft } from "./paidProTest435Fixtures";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import {
  buildTest435ServerFullDraftWithRepairableStructureBreaks,
  TEST435_HARBOR_PEAK,
  TEST435_INTAKE_WITH_SIGNERS,
  TEST435_RED_MESA,
} from "./paidProTest435Fixtures";
import { TEST436_HOMEPAGE_INTAKE } from "./paidProTest436Fixtures";

describe("TEST436 — post-checkout retry uses full original intake, not stale coercion", () => {
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
    clearPaidProSourceOfTruth();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("short checkout-back + resume coercion loses to session original prompt", () => {
    const shortCoerced = buildReviewCoercionRawIntakeFromDraft(test435Draft(), "");
    expect(shortCoerced.length).toBeGreaterThan(200);

    writeOriginalUserIntakeRawAtDraftCommit(TEST436_HOMEPAGE_INTAKE);
    stashCreateComplexityResume({
      rawIntake: shortCoerced,
      pending: test435Draft(),
      awaitingProCheckout: true,
      resume_kind: "optional_full_upgrade",
    });
    persistStarterReviewBeforeCheckout({
      intakeText: shortCoerced,
      draft: test435Draft(),
      previewText: "Starter preview body for TEST436 — not deal intake.",
    });

    const resolved = resolvePremiumCheckoutIntakeCorpus({
      structuredDraft: test435Draft(),
      intakeCombined: "",
      agreementDocumentText: "Starter preview body for TEST436 — not deal intake.",
      allowDocumentFallback: false,
    });

    expect(resolved.corpus).toContain("Create a consulting services agreement");
    expect(resolved.chosenSource).toBe("session_original");
    expect(resolved.corpus).not.toBe(shortCoerced);
  });

  it("retry request intake upgrades short merged retry to full session original", () => {
    const shortCoerced = buildReviewCoercionRawIntakeFromDraft(test435Draft(), "");
    writeOriginalUserIntakeRawAtDraftCommit(TEST436_HOMEPAGE_INTAKE);
    stashCreateComplexityResume({
      rawIntake: shortCoerced,
      pending: test435Draft(),
      awaitingProCheckout: true,
      resume_kind: "optional_full_upgrade",
    });

    const retry = resolvePremiumRequestIntakeText({
      mergedOrRetryIntake: shortCoerced,
      structuredDraft: test435Draft(),
      intakeCombined: "",
      agreementDocumentText: "Starter preview only",
      finalTranscript: "",
    });

    expect(retry.intakeText).toContain(TEST436_HOMEPAGE_INTAKE.slice(0, 40));
    expect(retry.intakeText).toContain("Create a consulting services agreement");
    expect(retry.resolved.chosenSource).toBe("session_original");
    expect(readOriginalUserIntakeRaw()).toContain("Red Mesa Logistics LLC");
  });

  it("long server response freeze + SoT + review render (production-like checkout retry state)", () => {
    writeOriginalUserIntakeRawAtDraftCommit(TEST436_HOMEPAGE_INTAKE);
    const shortCoerced = buildReviewCoercionRawIntakeFromDraft(test435Draft(), "");
    stashCreateComplexityResume({
      rawIntake: shortCoerced,
      pending: test435Draft(),
      awaitingProCheckout: true,
      resume_kind: "optional_full_upgrade",
    });

    const intake = resolvePremiumRequestIntakeText({
      mergedOrRetryIntake: shortCoerced,
      structuredDraft: test435Draft(),
      intakeCombined: "",
      agreementDocumentText: shortCoerced,
    }).intakeText;

    expect(intake).toContain("Create a consulting services agreement");
    expect(intake).toContain(TEST435_RED_MESA);

    const serverDraft = buildTest435ServerFullDraftWithRepairableStructureBreaks();
    const prepared = preparePaidProServerDocumentForAcceptance(
      serverDraft,
      test435Draft(),
      TEST435_INTAKE_WITH_SIGNERS,
      { surface: "test436_prepare" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test435Draft(),
      intakeText: intake,
      surface: "test436_freeze",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.text.length).toBeGreaterThan(5000);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test435Draft(),
      intakeText: intake,
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);

    const review = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: freezeCommit.text,
      agreementDocumentPlain: freezeCommit.text,
    });
    expect(review.plainText.length).toBeGreaterThan(5000);
    expect(review.plainText).toContain(TEST435_RED_MESA);
    expect(review.plainText).toContain(TEST435_HARBOR_PEAK);
    expect(getPaidProSourceOfTruthText().length).toBeGreaterThan(5000);
  });
});
