import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FREE_STARTER_REVIEW_SUBTITLE,
  FREE_STARTER_REVIEW_TITLE,
  resolveFreeStarterReviewShellActive,
  resolveReviewShellChrome,
  shouldGateGuidedRenderAuthorityForFreeReview,
} from "./freeStarterReviewShell";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { writeAgreementCreatorIntakeStorage } from "./agreementIntakeStorage";
import { CreateUiStage } from "./createUiStage";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA_INTAKE =
  "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup. Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.";

const starterDraft = (parties: ParsedDraftShape["parties"]): ParsedDraftShape => ({
  title: "AI Workflow Setup Services Agreement",
  jurisdiction: "Texas",
  parties,
  purpose: "AI workflow setup services",
  payment_terms: "$5,000",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: 5000, cadence: null, valid: true },
  agreement_family: "services_agreement",
});

describe("resolveFreeStarterReviewShellActive", () => {
  it("is true for free streamline review", () => {
    expect(
      resolveFreeStarterReviewShellActive({
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
        paidProAuthoritative: false,
      }),
    ).toBe(true);
  });

  it("is false when paid Pro surface is active", () => {
    expect(
      resolveFreeStarterReviewShellActive({
        isFreeStreamlineDraftReview: false,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: true,
        paidProAuthoritative: false,
      }),
    ).toBe(false);
  });

  it("HARD INVARIANT: never mounts after paid checkout completed even if corpus failed validation", () => {
    expect(
      resolveFreeStarterReviewShellActive({
        // Failed-corpus shape: starter signals would otherwise resolve true, but checkout completed.
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
        paidProAuthoritative: false,
        premiumCheckoutCompleted: true,
      }),
    ).toBe(false);
  });

  it("review shell chrome never resolves free starter after paid checkout completed", () => {
    const chrome = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: true,
      isFreeStarterReviewSurface: true,
      premiumPaidDocumentSurface: false,
      paidProAuthoritative: false,
      paidProReviewReadyBase: false,
      guidedCompletionActive: false,
      premiumCheckoutCompleted: true,
    });
    expect(chrome.blockPaidProShell).toBe(false);
    expect(chrome.kind).toBe("paid_pro");
  });
});

describe("resolveReviewShellChrome", () => {
  it("home_create_submit starter_review uses free title not Pro when no SoT", () => {
    const chrome = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: true,
      isFreeStarterReviewSurface: true,
      premiumPaidDocumentSurface: false,
      paidProAuthoritative: false,
      paidProReviewReadyBase: false,
      guidedCompletionActive: false,
    });
    expect(chrome.title).toBe(FREE_STARTER_REVIEW_TITLE);
    expect(chrome.title).not.toContain("Pro agreement");
    expect(chrome.subtitle).toBe(FREE_STARTER_REVIEW_SUBTITLE);
    expect(chrome.paidProReviewReady).toBe(false);
    expect(chrome.blockPaidProShell).toBe(true);
  });

  it("paid pro review keeps Pro shell when not free", () => {
    const chrome = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: false,
      isFreeStarterReviewSurface: false,
      premiumPaidDocumentSurface: true,
      paidProAuthoritative: true,
      paidProReviewReadyBase: true,
      guidedCompletionActive: true,
      simpleProductFlow: true,
      liveWorkspaceTwoPane: true,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: "review",
      authoritativeBodyLen: 2000,
    });
    expect(chrome.title).toBe("Agreement ready");
    expect(chrome.paidProReviewReady).toBe(true);
    expect(chrome.paidProReviewContentReady).toBe(true);
  });

  it("paid pro shell without corpus uses recovering title not Agreement ready", () => {
    const chrome = resolveReviewShellChrome({
      isFreeStreamlineDraftReview: false,
      isFreeStarterReviewSurface: false,
      premiumPaidDocumentSurface: true,
      paidProAuthoritative: true,
      paidProReviewReadyBase: true,
      guidedCompletionActive: false,
      simpleProductFlow: true,
      liveWorkspaceTwoPane: true,
      createUiStage: CreateUiStage.DRAFT,
      displayPhase: "review",
      proFullDraftQualityRetry: true,
      authoritativeBodyLen: 0,
    });
    expect(chrome.title).not.toBe("Agreement ready");
    expect(chrome.paidProReviewContentReady).toBe(false);
  });
});

describe("free starter review preserves full legal party names", () => {
  it("legal recital body keeps full LLC names (not Red Mesa / Harbor Peak)", () => {
    const text = buildStarterAgreementPreviewForReview(
      starterDraft([
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ]),
      { intakeText: RED_MESA_INTAKE },
    );
    expect(text).toContain("Red Mesa Logistics LLC");
    expect(text).toContain("Harbor Peak Automation LLC");
    // Short forms may appear as scope/nickname references, but the legal recital line is full.
    const recital = text.slice(0, text.toLowerCase().indexOf("scope") >= 0 ? text.toLowerCase().indexOf("scope") : 600);
    expect(recital).toMatch(/Red Mesa Logistics LLC[\s\S]*Harbor Peak Automation LLC/);
    // Must NOT be compact-only: every "Red Mesa" / "Harbor Peak" is followed by its full suffix.
    expect(text).not.toMatch(/\bRed Mesa\b(?!\s+Logistics)/);
    expect(text).not.toMatch(/\bHarbor Peak\b(?!\s+Automation)/);
  });

  it("restore=starterReview cannot truncate party names (short stored draft + full intake)", () => {
    // Restored snapshot may carry collapsed short labels; intake still has the full legal entities.
    const text = buildStarterAgreementPreviewForReview(
      starterDraft([
        { name: "Red Mesa", role: "Client" },
        { name: "Harbor Peak", role: "Service Provider" },
      ]),
      { intakeText: RED_MESA_INTAKE },
    );
    expect(text).toContain("Red Mesa Logistics LLC");
    expect(text).toContain("Harbor Peak Automation LLC");
    expect(text).not.toMatch(/\bRed Mesa\b(?!\s+Logistics)/);
    expect(text).not.toMatch(/\bHarbor Peak\b(?!\s+Automation)/);
  });

  it("restore=starterReview preserves full names when intake is only in storage (no intakeText threaded)", () => {
    // Real QA regression: after refresh the React intake buffer is empty so the caller passes no
    // intakeText, but the persisted creator intake still holds the full legal entities. The starter
    // builder must fall back to it instead of rendering "Red Mesa and Harbor Peak (collectively...)".
    const store = new Map<string, string>();
    const had = "localStorage" in globalThis;
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
    try {
      writeAgreementCreatorIntakeStorage(RED_MESA_INTAKE);
      const text = buildStarterAgreementPreviewForReview(
        starterDraft([
          { name: "Red Mesa", role: "Client" },
          { name: "Harbor Peak", role: "Service Provider" },
        ]),
        // No intakeText: simulates the post-refresh restore render path.
      );
      expect(text).toContain("Red Mesa Logistics LLC");
      expect(text).toContain("Harbor Peak Automation LLC");
      expect(text).not.toMatch(/Red Mesa and Harbor Peak \(collectively/);
      expect(text).not.toMatch(/\bRed Mesa\b(?!\s+Logistics)/);
      expect(text).not.toMatch(/\bHarbor Peak\b(?!\s+Automation)/);
    } finally {
      if (!had) delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    }
  });
});

describe("shouldGateGuidedRenderAuthorityForFreeReview", () => {
  it("gates guided authority on free starter surfaces", () => {
    expect(
      shouldGateGuidedRenderAuthorityForFreeReview({
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
      }),
    ).toBe(true);
  });

  it("does not gate guided authority when authoritative create-flow shell is paid_pro", () => {
    expect(
      shouldGateGuidedRenderAuthorityForFreeReview({
        workspaceProEntitled: true,
        isFreeStreamlineDraftReview: true,
        isFreeStarterReviewSurface: true,
        premiumPaidDocumentSurface: false,
      }),
    ).toBe(false);
  });
});

describe("AgreementBuilderIntake free starter shell wiring", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("gates paidProReviewReady and guided authority for free starter", () => {
    expect(intake).toContain("resolveFreeStarterReviewShellActive");
    expect(intake).toContain("resolveReviewShellChrome");
    expect(intake).toContain("resetStalePaidReviewShellForFreeStarter");
    expect(intake).toContain("shouldGateGuidedRenderAuthorityForFreeReview");
    expect(intake).toContain("FREE_STARTER_REVIEW_TITLE");
    expect(intake).toContain("logFreeReviewPaidShellBlocked");
  });

  it("does not show Pro agreement title on free streamline headings", () => {
    expect(intake).toMatch(/isFreeStreamlineDraftReview[^?]*\?/);
    expect(intake).toContain("STARTER_REVIEW_HEADLINE");
    expect(intake).not.toMatch(
      /isFreeStreamlineDraftReview\s*\?[\s\S]{0,200}SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE/,
    );
  });

  // Regression: post-checkout crash "Cannot access X before initialization" was a temporal
  // dead zone — unifiedPrimaryCta (a render-time useMemo) read failedPremiumCorpusActive before
  // it was declared. Every paid-review-state input must be declared before the CTA consumes it.
  it("paid review state machine is declared before unifiedPrimaryCta consumes it (TDZ guard)", () => {
    const idxReturnWait = intake.indexOf("const premiumReturnWaitActive = Boolean(");
    const idxNetworkPanel = intake.indexOf("const showPremiumNetworkRecoverablePanel = Boolean(");
    const idxReviewState = intake.indexOf("const paidProReviewState = useMemo(");
    const idxFailedActive = intake.indexOf("const failedPremiumCorpusActive =");
    const idxUnifiedCta = intake.indexOf("const unifiedPrimaryCta = useMemo(");

    for (const idx of [idxReturnWait, idxNetworkPanel, idxReviewState, idxFailedActive, idxUnifiedCta]) {
      expect(idx).toBeGreaterThan(-1);
    }
    // Inputs declared before the state machine memo.
    expect(idxReturnWait).toBeLessThan(idxReviewState);
    expect(idxNetworkPanel).toBeLessThan(idxReviewState);
    // State + derived flag declared before the CTA memo that reads them.
    expect(idxReviewState).toBeLessThan(idxUnifiedCta);
    expect(idxFailedActive).toBeLessThan(idxUnifiedCta);
    // And there is exactly one declaration of each relocated binding (no duplicate after move).
    expect(intake.indexOf("const paidProReviewState = useMemo(", idxReviewState + 1)).toBe(-1);
    expect(intake.indexOf("const premiumReturnWaitActive = Boolean(", idxReturnWait + 1)).toBe(-1);
    expect(
      intake.indexOf("const showPremiumNetworkRecoverablePanel = Boolean(", idxNetworkPanel + 1),
    ).toBe(-1);
  });
});
