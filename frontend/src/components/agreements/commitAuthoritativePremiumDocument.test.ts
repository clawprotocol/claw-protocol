import { describe, expect, it } from "vitest";
import {
  commitAuthoritativePremiumDocument,
  isAuthoritativeVisibleSurfaceAligned,
  probeAuthoritativeVisibleSurfaces,
  syncAuthoritativePremiumDocumentRefs,
} from "./commitAuthoritativePremiumDocument";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

function minimalDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "TX",
    agreement_family: "services_agreement",
    parties: [{ name: "A LLC", role: "party" }],
    purpose: "Rollout",
    payment_terms: "$100k",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
  };
}

function makeRefs(initial = "") {
  return {
    agreementDocumentTextRef: { current: initial },
    agreementDocumentDirtyRef: { current: false },
    hydratedPremiumBodyRef: { current: "" },
    lastPremiumWinningCorpusRef: { current: "" },
    premiumPipelineOutputBodyRef: { current: "" },
    lastPremiumPipelineRenderSourceRef: { current: null as string | null },
  };
}

describe("commitAuthoritativePremiumDocument", () => {
  it("syncs agreementDocumentTextRef before React re-render", () => {
    const refs = makeRefs("starter short");
    const body = "x".repeat(12_000);
    syncAuthoritativePremiumDocumentRefs(body, refs, {
      pipelineSource: "server_full_draft",
      premiumRenderResolveSource: "server_full_document_text",
    });
    expect(refs.agreementDocumentTextRef.current.length).toBe(12_000);
    expect(refs.hydratedPremiumBodyRef.current.length).toBe(12_000);
    expect(refs.lastPremiumPipelineRenderSourceRef.current).toBe("server_full_draft");
  });

  it("commitAuthoritativePremiumDocument merges draft premium fields", () => {
    const refs = makeRefs();
    const body = "y".repeat(8_000);
    const out = commitAuthoritativePremiumDocument(body, minimalDraft(), refs, {
      pipelineSource: "server_full_draft",
      premiumRenderResolveSource: "server_full_document_text",
    });
    expect(out?.mergedDraft.premium_server_full_document_text?.length).toBe(8_000);
    expect(refs.agreementDocumentTextRef.current.length).toBe(8_000);
  });

  it("isAuthoritativeVisibleSurfaceAligned accepts hydrated ref when agreementDocumentText lags", () => {
    expect(
      isAuthoritativeVisibleSurfaceAligned(10_000, {
        agreementDocumentTextLen: 400,
        hydratedBodyLen: 9_900,
        reviewDraftPlainLen: 9_800,
        premiumRenderResolveSource: "server_full_document_text",
      }),
    ).toBe(true);
  });

  it("isAuthoritativeVisibleSurfaceAligned rejects live_generated_preview", () => {
    expect(
      isAuthoritativeVisibleSurfaceAligned(10_000, {
        agreementDocumentTextLen: 10_000,
        hydratedBodyLen: 10_000,
        reviewDraftPlainLen: 10_000,
        premiumRenderResolveSource: "live_generated_preview",
      }),
    ).toBe(false);
  });

  it("probeAuthoritativeVisibleSurfaces reads draft premium fields", () => {
    const refs = makeRefs("z".repeat(500));
    const draft = {
      ...minimalDraft(),
      premium_full_document_text: "a".repeat(6_000),
      premium_server_full_document_text: "a".repeat(6_000),
    };
    const probe = probeAuthoritativeVisibleSurfaces({ refs, draft });
    expect(probe.reviewDraftPlainLen).toBe(6_000);
  });
});
