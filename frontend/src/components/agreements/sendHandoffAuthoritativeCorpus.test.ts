import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPaidPremiumCompletionSession, markPaidPremiumCompletionSession } from "./premiumCompletionStorage";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import {
  SEND_HANDOFF_AUTHORITATIVE_MIN_LEN,
  authoritativeProBypassSimpleSendPaywall,
  bypassSimpleHomeWatermarkSendGate,
  buildSendRouteReadonlyHtmlFromPlain,
  describePaidProSendModalBranch,
  longestPlainForAgreementPersist,
  mergePremiumRenderSourceField,
  paidProSendAllowed,
  pickAuthoritativePlainForSendHandoff,
  shouldBypassFlexibleSendRecipientValidationForPremiumReview,
  shouldKeepReviewDisplayAfterProHydrate,
  shouldMinimalProSendRecipientChrome,
} from "./sendHandoffAuthoritativeCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

function minimalParsed(overrides: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "T",
    jurisdiction: "DE",
    parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
    purpose: "short",
    payment_terms: "p",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
    ...overrides,
  };
}

describe("sendHandoffAuthoritativeCorpus", () => {
  it("pickAuthoritativePlainForSendHandoff prefers premium_full_document_text over short purpose", () => {
    const body = "y".repeat(15_000);
    const d: AgreementDraft = {
      id: "a1",
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "party" }],
      purpose: "thin",
      payment_terms: "p",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [{ version: 1, created_at: "" }],
      audit_log: [{ event_type: "created", at: "" }],
      premium_full_document_text: body,
    };
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(pick?.field).toBe("premium_full_document_text");
    expect(pick?.text.length).toBe(15_000);
  });

  it("longestPlainForAgreementPersist chooses longest premium / editor / purpose", () => {
    const longPremium = "z".repeat(800);
    const parsed = minimalParsed({
      premium_full_document_text: longPremium,
      purpose: "x".repeat(100),
    });
    expect(longestPlainForAgreementPersist(parsed, "e".repeat(50))).toBe(longPremium);
  });

  it("regression: ~15k persisted draft must not resolve to starter-length preview via picker", () => {
    const corpus = "y".repeat(15_000);
    expect(corpus.length).toBeGreaterThan(SEND_HANDOFF_AUTHORITATIVE_MIN_LEN);
    const d: AgreementDraft = {
      id: "x",
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
      purpose: "stub preview line only",
      payment_terms: "p",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [{ version: 1, created_at: "" }],
      audit_log: [{ event_type: "created", at: "" }],
      premium_full_document_text: corpus,
    };
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(pick?.text.length).toBe(corpus.length);
    expect(pick?.field).toBe("premium_full_document_text");
  });

  it("shouldMinimalProSendRecipientChrome: server_full_document_text forces minimal chrome even when pick is thin", () => {
    expect(
      shouldMinimalProSendRecipientChrome({
        premiumRenderSourceResolved: "server_full_document_text",
        authoritativePick: null,
        readonlyPlainText: "",
      }),
    ).toBe(true);
  });

  it("shouldMinimalProSendRecipientChrome: server_repair_document_text bypasses without long corpus pick", () => {
    expect(
      shouldMinimalProSendRecipientChrome({
        premiumRenderSourceResolved: "server_repair_document_text",
        authoritativePick: null,
        readonlyPlainText: "",
        draft: { purpose: "x" } as AgreementDraft,
      }),
    ).toBe(true);
  });

  it("shouldMinimalProSendRecipientChrome: premium corpus >=500 and not purpose enables minimal chrome", () => {
    const corpus = "z".repeat(600);
    const d: AgreementDraft = {
      id: "a",
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "party" }],
      purpose: "short",
      payment_terms: "p",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [{ version: 1, created_at: "" }],
      audit_log: [{ event_type: "created", at: "" }],
      premium_server_full_document_text: corpus,
    };
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(
      shouldMinimalProSendRecipientChrome({
        premiumRenderSourceResolved: "live_generated_preview",
        authoritativePick: pick,
        readonlyPlainText: corpus,
      }),
    ).toBe(true);
  });

  it("shouldMinimalProSendRecipientChrome: purpose-only long body does not enable minimal chrome", () => {
    const purposeLong = `p${"y".repeat(SEND_HANDOFF_AUTHORITATIVE_MIN_LEN)}`;
    const d: AgreementDraft = {
      id: "b",
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "party" }],
      purpose: purposeLong,
      payment_terms: "p",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [{ version: 1, created_at: "" }],
      audit_log: [{ event_type: "created", at: "" }],
    };
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(pick?.field).toBe("purpose");
    expect(
      shouldMinimalProSendRecipientChrome({
        premiumRenderSourceResolved: null,
        authoritativePick: pick,
        readonlyPlainText: purposeLong,
        draft: d,
      }),
    ).toBe(false);
  });

  it("regression: RECIPIENTS-stage minimal chrome flags for ~15k premium_server_full_document_text", () => {
    const corpus = "y".repeat(15_651);
    const d: AgreementDraft = {
      id: "c",
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
      purpose: "short structured stub",
      payment_terms: "p",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "",
      updated_at: "",
      versions: [{ version: 1, created_at: "" }],
      audit_log: [{ event_type: "created", at: "" }],
      premium_server_full_document_text: corpus,
    };
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(pick?.text.length).toBeGreaterThanOrEqual(500);
    expect(pick?.field).toBe("premium_server_full_document_text");
    const minimal = shouldMinimalProSendRecipientChrome({
      premiumRenderSourceResolved: "server_full_document_text",
      authoritativePick: pick,
      readonlyPlainText: corpus,
    });
    expect(minimal).toBe(true);
  });

  it("authoritativeProBypassSimpleSendPaywall: server_full_document_text source bypasses paywall", () => {
    const d = {
      premium_render_source: "server_full_document_text",
      purpose: "short",
    } as unknown as AgreementDraft;
    expect(authoritativeProBypassSimpleSendPaywall(d)).toBe(true);
  });

  it("authoritativeProBypassSimpleSendPaywall: purpose-only starter does not bypass", () => {
    const purposeLong = `p${"y".repeat(SEND_HANDOFF_AUTHORITATIVE_MIN_LEN)}`;
    const d = {
      purpose: purposeLong,
    } as unknown as AgreementDraft;
    expect(authoritativeProBypassSimpleSendPaywall(d)).toBe(false);
  });

  it("authoritativeProBypassSimpleSendPaywall: premium corpus >=500 bypasses", () => {
    const corpus = "z".repeat(600);
    const d = {
      premium_server_full_document_text: corpus,
      purpose: "stub",
    } as unknown as AgreementDraft;
    expect(authoritativeProBypassSimpleSendPaywall(d)).toBe(true);
  });

  it("describePaidProSendModalBranch: server_render_source reason for telemetry", () => {
    const d = {
      premium_render_source: "server_full_document_text",
      purpose: "short",
    } as unknown as AgreementDraft;
    const m = describePaidProSendModalBranch(d);
    expect(m.bypass).toBe(true);
    expect(m.paidProSendAllowed).toBe(true);
    expect(m.reason).toBe("strict_server_render_source");
    expect(m.premium_render_source).toBe("server_full_document_text");
    expect(m.hasMaterialPremiumPipelineCorpus).toBe(false);
  });

  it("describePaidProSendModalBranch: server_repair_document_text bypasses send upsell", () => {
    const d = {
      premium_render_source: "server_repair_document_text",
      purpose: "short",
    } as unknown as AgreementDraft;
    const m = describePaidProSendModalBranch(d);
    expect(m.paidProSendAllowed).toBe(true);
    expect(m.reason).toBe("strict_server_render_source");
  });

  it("paidProSendAllowed: live preview render source but material premium corpus still bypasses upsell", () => {
    const corp = "z".repeat(900);
    const d = {
      premium_render_source: "live_generated_preview",
      purpose: "short",
      premium_server_full_document_text: corp,
    } as unknown as AgreementDraft;
    expect(paidProSendAllowed(d)).toBe(true);
    expect(describePaidProSendModalBranch(d).reason).toBe("long_authoritative_corpus");
  });

  it("paidProSendAllowed mirrors bypass for simple send gate regression", () => {
    const corpus = "y".repeat(15_000);
    const d = {
      premium_render_source: "live_generated_preview",
      premium_full_document_text: corpus,
      purpose: "stub",
    } as unknown as AgreementDraft;
    const m = describePaidProSendModalBranch(d);
    expect(m.paidProSendAllowed).toBe(m.bypass);
    expect(m.paidProSendAllowed).toBe(true);
  });

  it("describePaidProSendModalBranch: corpus_authoritative when long premium body", () => {
    const corpus = "z".repeat(600);
    const d = {
      premium_render_source: "live_generated_preview",
      premium_full_document_text: corpus,
      purpose: "stub",
    } as unknown as AgreementDraft;
    const m = describePaidProSendModalBranch(d);
    expect(m.bypass).toBe(true);
    expect(m.reason).toBe("long_authoritative_corpus");
    expect(m.authoritativeLen).toBeGreaterThanOrEqual(500);
  });

  describe("paid checkout return session", () => {
    const sessionStore = new Map<string, string>();
    beforeEach(() => {
      sessionStore.clear();
      vi.stubGlobal("sessionStorage", {
        getItem: (k: string) => (sessionStore.has(k) ? sessionStore.get(k)! : null),
        setItem: (k: string, v: string) => void sessionStore.set(k, v),
        removeItem: (k: string) => void sessionStore.delete(k),
      } as Storage);
      vi.stubGlobal("window", {
        location: { href: "https://example.test/app/create" },
      } as unknown as Window & typeof globalThis);
      markPaidPremiumCompletionSession();
    });
    afterEach(() => {
      clearPaidPremiumCompletionSession();
      vi.unstubAllGlobals();
    });

    it("describePaidProSendModalBranch bypasses thin draft while paid-return session is active", () => {
      const d = { purpose: "short" } as unknown as AgreementDraft;
      const m = describePaidProSendModalBranch(d);
      expect(m.bypass).toBe(true);
      expect(m.paidProSendAllowed).toBe(true);
      expect(m.reason).toBe("paid_premium_completion_session");
    });
  });

  it("mergePremiumRenderSourceField prefers server_full_document_text from either side", () => {
    expect(mergePremiumRenderSourceField("live_generated_preview", "server_full_document_text")).toBe(
      "server_full_document_text",
    );
    expect(mergePremiumRenderSourceField("server_full_document_text", null)).toBe("server_full_document_text");
  });

  it("pickAuthoritativePlainForSendHandoff prefers paid corpus over longer purpose when both >= min", () => {
    const purposeLong = `p${"y".repeat(SEND_HANDOFF_AUTHORITATIVE_MIN_LEN + 100)}`;
    const premiumCorpus = "z".repeat(SEND_HANDOFF_AUTHORITATIVE_MIN_LEN + 50);
    const d = {
      purpose: purposeLong,
      premium_full_document_text: premiumCorpus,
    } as unknown as AgreementDraft;
    const pick = pickAuthoritativePlainForSendHandoff(d);
    expect(pick?.field).toBe("premium_full_document_text");
    expect(pick?.text.length).toBe(premiumCorpus.length);
  });

  it("bypassSimpleHomeWatermarkSendGate: economics tier paid skips watermark gate", () => {
    const thin = { purpose: "short" } as unknown as AgreementDraft;
    expect(bypassSimpleHomeWatermarkSendGate(thin, { tier: "paid" })).toBe(true);
  });

  it("bypassSimpleHomeWatermarkSendGate: free tier + thin draft uses draft branch (no bypass)", () => {
    const thin = { purpose: "short", premium_render_source: "live_generated_preview" } as unknown as AgreementDraft;
    expect(bypassSimpleHomeWatermarkSendGate(thin, { tier: "free" })).toBe(false);
  });

  it("bypassSimpleHomeWatermarkSendGate: stale free economics but server_render_source on draft bypasses", () => {
    const d = {
      premium_render_source: "server_full_document_text",
      purpose: "x",
    } as unknown as AgreementDraft;
    expect(bypassSimpleHomeWatermarkSendGate(d, { tier: "free" })).toBe(true);
  });

  it("shouldKeepReviewDisplayAfterProHydrate: long server_full_document_text without premium_* stays in review", () => {
    const body = "w".repeat(600);
    const d = {
      premium_render_source: "live_generated_preview",
      server_full_document_text: body,
      premium_server_full_document_text: "",
      premium_full_document_text: "",
    } as unknown as AgreementDraft;
    expect(shouldKeepReviewDisplayAfterProHydrate(d)).toBe(true);
  });

  it("describePaidProSendModalBranch includes hasMaterialPremiumPipelineCorpus for server body only", () => {
    const body = "w".repeat(600);
    const d = {
      premium_render_source: "server_full_document_text",
      server_full_document_text: body,
      premium_server_full_document_text: "",
      premium_full_document_text: "",
      purpose: "stub",
    } as unknown as AgreementDraft;
    const m = describePaidProSendModalBranch(d);
    expect(m.hasMaterialPremiumPipelineCorpus).toBe(true);
    expect(m.materialPremiumCorpusLen).toBeGreaterThanOrEqual(SEND_HANDOFF_AUTHORITATIVE_MIN_LEN);
  });

  it("buildSendRouteReadonlyHtmlFromPlain uses Agreement preview label for paid authoritative handoff", () => {
    const html = buildSendRouteReadonlyHtmlFromPlain("Clause one.", { documentLabel: "Agreement preview" });
    expect(html).toContain("Agreement preview");
    expect(html).not.toContain("Draft Agreement (non-binding template)");
  });

  it("buildSendRouteReadonlyHtmlFromPlain defaults to draft disclaimer for free/starter", () => {
    const html = buildSendRouteReadonlyHtmlFromPlain("Short body");
    expect(html).toContain("Draft Agreement (non-binding template)");
  });

  it("shouldBypassFlexibleSendRecipientValidationForPremiumReview is true only for authoritative minimal review send", () => {
    expect(
      shouldBypassFlexibleSendRecipientValidationForPremiumReview({
        isWorkspace: true,
        isSimpleHomeReview: true,
        simpleFlowPhase: "send",
        simpleSendAuthoritativeMinimalChrome: true,
        streamlinedPremiumIntentForCopy: "review",
      }),
    ).toBe(true);
    expect(
      shouldBypassFlexibleSendRecipientValidationForPremiumReview({
        isWorkspace: true,
        isSimpleHomeReview: true,
        simpleFlowPhase: "send",
        simpleSendAuthoritativeMinimalChrome: true,
        streamlinedPremiumIntentForCopy: "signature",
      }),
    ).toBe(false);
    expect(
      shouldBypassFlexibleSendRecipientValidationForPremiumReview({
        isWorkspace: true,
        isSimpleHomeReview: true,
        simpleFlowPhase: "send",
        simpleSendAuthoritativeMinimalChrome: false,
        streamlinedPremiumIntentForCopy: "review",
      }),
    ).toBe(false);
  });
});
