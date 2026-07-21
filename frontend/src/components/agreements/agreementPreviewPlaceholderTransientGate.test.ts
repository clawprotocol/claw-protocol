import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { describe, expect, it } from "vitest";
import {
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
} from "../../../e2e/fixtures/ironcladFivePartyRollout";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  finalizeUserVisibleAgreementPlainText,
  PLACEHOLDER_SAFETY_PREVIEW_BLOCKED,
} from "./agreementTemplatePlaceholderSafety";
import {
  isPlaceholderSafetyBlockedPreviewText,
  resolveEffectiveStarterHasDraftPayload,
  resolveStarterPreviewLoadingReleaseReason,
  shouldDeferStarterPreviewToLoadingShell,
  shouldSkipPlaceholderScanForTransientPreview,
  stripPlaceholderBlockerFromPersistPlain,
} from "./agreementPreviewPlaceholderTransientGate";

function ironcladDraft(): ParsedDraftShape {
  return enrichStarterPreviewPartiesFromIntake(
    {
      title: "Joint AI Rollout",
      jurisdiction: "Texas",
      purpose: "Joint AI software rollout.",
      payment_terms: "$187,500 paid over six milestone payments.",
      duration: "24 months",
      due_date: "",
      effective_date: "Upon full execution",
      payment: { amount: 187_500, cadence: null, valid: true },
      parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
      agreement_family: "generic_business_agreement",
    },
    IRONCLAD_JOINT_ROLLOUT_INTAKE,
  );
}

function thinPlaceholderDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "",
    purpose: "",
    payment_terms: "",
    duration: "",
    due_date: "",
    effective_date: "",
    payment: { amount: null, cadence: null, valid: false },
    parties: [
      { name: "[Client Name]", role: "client" },
      { name: "[Provider Name]", role: "provider" },
    ],
    agreement_family: "generic_business_agreement",
  };
}

describe("agreementPreviewPlaceholderTransientGate", () => {
  it("detects blocker preview text", () => {
    expect(isPlaceholderSafetyBlockedPreviewText(PLACEHOLDER_SAFETY_PREVIEW_BLOCKED)).toBe(true);
    expect(isPlaceholderSafetyBlockedPreviewText("SERVICES AGREEMENT\n\n1. Scope")).toBe(false);
  });

  it("skips fatal scan for empty, generating, no payload, and rejected authoritative sources", () => {
    expect(
      shouldSkipPlaceholderScanForTransientPreview({
        text: "",
        hasDraftPayload: false,
        authoritativeSource: "none",
      }),
    ).toBe(true);
    expect(
      shouldSkipPlaceholderScanForTransientPreview({
        text: "short",
        len: 3,
        hasDraftPayload: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipPlaceholderScanForTransientPreview({
        text: PLACEHOLDER_SAFETY_PREVIEW_BLOCKED,
        hasDraftPayload: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipPlaceholderScanForTransientPreview({
        text: "x".repeat(500),
        hasDraftPayload: true,
        isGenerating: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipPlaceholderScanForTransientPreview({
        text: "x".repeat(500),
        authoritativeSource: "blocked_short_preview",
      }),
    ).toBe(true);
  });

  it("free starter sequence: transient gate avoids blocker, then valid server draft preview", () => {
    const transientGate = {
      isGenerating: false,
      hasDraftPayload: false,
      authoritativeSource: "none" as const,
      createFlowPhase: "generating_draft" as const,
      displayPhase: "generating_draft" as const,
    };
    const earlyPreview = buildStarterAgreementPreviewForReview(thinPlaceholderDraft(), {
      intakeText: "Consulting for [Client Name]",
      placeholderGate: transientGate,
    });
    expect(earlyPreview).not.toContain("LawDog blocked this preview");
    expect(isPlaceholderSafetyBlockedPreviewText(earlyPreview)).toBe(false);

    const finWouldBlock = finalizeUserVisibleAgreementPlainText(earlyPreview, {
      intakeRaw: "Consulting for [Client Name]",
      partyNames: ["[Client Name]", "[Provider Name]"],
      surface: "preview_starter",
      hasDraftPayload: false,
      authoritativeSource: "none",
    });
    expect(finWouldBlock.ok).toBe(true);

    const readyPreview = buildStarterAgreementPreviewForReview(ironcladDraft(), {
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      placeholderGate: {
        hasDraftPayload: true,
        isGenerating: false,
        createFlowPhase: "draft_ready_for_review",
        displayPhase: "review",
      },
    });
    expect(readyPreview.length).toBeGreaterThan(400);
    expect(readyPreview).not.toContain("LawDog blocked this preview");
    expect(readyPreview).toMatch(/\n\n1\.\s+Scope/i);
  });

  it("defer loading shell when local draft exists but server payload not ready", () => {
    expect(
      shouldDeferStarterPreviewToLoadingShell({
        text: "",
        hasLocalDraft: true,
        hasDraftPayload: false,
        isGenerating: false,
      }),
    ).toBe(true);
    expect(
      shouldDeferStarterPreviewToLoadingShell({
        text: PLACEHOLDER_SAFETY_PREVIEW_BLOCKED,
        hasLocalDraft: true,
        hasDraftPayload: false,
      }),
    ).toBe(true);
    expect(
      shouldDeferStarterPreviewToLoadingShell({
        text: "x".repeat(600),
        hasLocalDraft: true,
        hasDraftPayload: true,
        isGenerating: false,
        createFlowPhase: "draft_ready_for_review",
        displayPhase: "review",
      }),
    ).toBe(false);
  });

  it("valid_preview_fallback releases shell when draft_ready and preview > 400 without server ref", () => {
    const preview = SHARED_ACCEPTED_PAID_BODY;
    expect(
      resolveEffectiveStarterHasDraftPayload({
        hasDraftPayload: false,
        createFlowPhase: "draft_ready_for_review",
        displayPhase: "review",
        previewLen: preview.length,
        isGenerating: false,
      }),
    ).toBe(true);
    expect(
      shouldDeferStarterPreviewToLoadingShell({
        text: preview,
        len: preview.length,
        hasLocalDraft: true,
        hasDraftPayload: false,
        isGenerating: false,
        createFlowPhase: "draft_ready_for_review",
        displayPhase: "review",
      }),
    ).toBe(false);
    expect(
      resolveStarterPreviewLoadingReleaseReason({
        hasLocalDraft: true,
        hasDraftPayload: false,
        isGenerating: false,
        createFlowPhase: "draft_ready_for_review",
        displayPhase: "review",
        previewText: preview,
      }),
    ).toBe("valid_preview_fallback");
  });

  it("free starter sequence: generating defers, server payload releases preview", () => {
    const generatingGate = {
      isGenerating: true,
      hasDraftPayload: false,
      createFlowPhase: "generating_draft" as const,
      displayPhase: "generating_draft" as const,
    };
    const earlyPreview = buildStarterAgreementPreviewForReview(thinPlaceholderDraft(), {
      intakeText: "Consulting for [Client Name]",
      placeholderGate: generatingGate,
    });
    expect(earlyPreview).not.toContain("LawDog blocked this preview");
    expect(
      shouldDeferStarterPreviewToLoadingShell({
        text: earlyPreview,
        len: earlyPreview.length,
        hasLocalDraft: true,
        ...generatingGate,
      }),
    ).toBe(true);

    const readyPreview = buildStarterAgreementPreviewForReview(ironcladDraft(), {
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      placeholderGate: {
        isGenerating: false,
        hasDraftPayload: true,
        createFlowPhase: "draft_ready_for_review",
        displayPhase: "review",
      },
    });
    expect(readyPreview.length).toBeGreaterThan(400);
    expect(readyPreview).not.toContain("LawDog blocked this preview");
    expect(
      shouldDeferStarterPreviewToLoadingShell({
        text: readyPreview,
        len: readyPreview.length,
        hasLocalDraft: true,
        hasDraftPayload: true,
        isGenerating: false,
        createFlowPhase: "draft_ready_for_review",
        displayPhase: "review",
      }),
    ).toBe(false);
    expect(
      resolveStarterPreviewLoadingReleaseReason({
        hasLocalDraft: true,
        hasDraftPayload: true,
        isGenerating: false,
        createFlowPhase: "draft_ready_for_review",
        displayPhase: "review",
        previewText: readyPreview,
      }),
    ).toBe("server_payload_ready");
  });

  it("stripPlaceholderBlockerFromPersistPlain removes blocker from persist candidates", () => {
    expect(stripPlaceholderBlockerFromPersistPlain(PLACEHOLDER_SAFETY_PREVIEW_BLOCKED)).toBe("");
    expect(stripPlaceholderBlockerFromPersistPlain("valid body")).toBe("valid body");
  });
});
