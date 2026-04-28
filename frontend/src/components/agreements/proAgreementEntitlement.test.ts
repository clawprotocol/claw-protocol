import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  draftPremiumRenderSourceIndicatesPro,
  isProEntitledForAgreement,
} from "./proAgreementEntitlement";

function minimalDraft(overrides: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "Test",
    jurisdiction: "DE",
    parties: [{ name: "A", role: "party" }, { name: "B", role: "party" }],
    purpose: "Purpose",
    payment_terms: "$1",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
    ...overrides,
  };
}

describe("proAgreementEntitlement", () => {
  it("draftPremiumRenderSourceIndicatesPro recognizes authoritative resolver tiers", () => {
    expect(draftPremiumRenderSourceIndicatesPro("server_full_document_text")).toBe(true);
    expect(draftPremiumRenderSourceIndicatesPro("server_repair_document_text")).toBe(true);
    expect(draftPremiumRenderSourceIndicatesPro("live_generated_preview")).toBe(false);
  });

  it("isProEntitledForAgreement true for premium tier even without draft bodies", () => {
    expect(
      isProEntitledForAgreement({
        tier: "premium",
        draft: minimalDraft(),
        premiumSendPathUnlocked: false,
        premiumPersistedFlowActive: false,
        premiumCompletionSnapshot: null,
      }),
    ).toBe(true);
  });

  it("isProEntitledForAgreement true when premium snapshot accepted with long corpus", () => {
    expect(
      isProEntitledForAgreement({
        tier: "free",
        draft: minimalDraft(),
        premiumSendPathUnlocked: false,
        premiumPersistedFlowActive: false,
        premiumCompletionSnapshot: {
          savedAt: Date.now(),
          premiumDraft: minimalDraft(),
          premiumParties: [],
          recipientCandidates: [],
          premiumAccepted: true,
          premiumWinningBodyText: "x".repeat(600),
        },
      }),
    ).toBe(true);
  });

  it("isProEntitledForAgreement true for free tier with authoritative premium body on draft", () => {
    expect(
      isProEntitledForAgreement({
        tier: "free",
        draft: minimalDraft({
          premium_server_full_document_text: "y".repeat(600),
          premium_render_source: "server_full_document_text",
        } as ParsedDraftShape & { premium_render_source?: string }),
        premiumSendPathUnlocked: false,
        premiumPersistedFlowActive: false,
        premiumCompletionSnapshot: null,
      }),
    ).toBe(true);
  });

  it("isProEntitledForAgreement false for thin free draft without flags", () => {
    expect(
      isProEntitledForAgreement({
        tier: "free",
        draft: minimalDraft(),
        premiumSendPathUnlocked: false,
        premiumPersistedFlowActive: false,
        premiumCompletionSnapshot: null,
      }),
    ).toBe(false);
  });
});
