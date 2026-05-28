import { afterEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  assertPostCanonicalSurfaceUsesFrozenCorpus,
  clearFrozenCanonicalAgreementCorpus,
  readCanonicalAgreementCorpusForSurface,
} from "./canonicalAgreementSnapshot";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import { pickPremiumPaidReadonlyPlainText } from "./premiumReadonlyRenderCorpus";
import { pickAuthoritativePlainForSendHandoff } from "./sendHandoffAuthoritativeCorpus";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import { resolveGuidedFinalReviewAuthoritativeBody } from "./guidedDealCompletion/guidedFinalReviewAuthoritativeBody";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { resolvePaidProReviewRenderSurface } from "./paidProRenderSurface";
import {
  assertNoPostAcceptanceStructuralMutation,
  authoritativeDocumentForSurface,
  getAuthoritativeAgreementDocument,
} from "./authoritativeAgreementDocument";
import { stabilizeFinalAgreementCompilerOutput } from "./finalAgreementCompilerIntegrity";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: true };

function draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: [
      { name: "Red Mesa Logistics LLC", role: "Client" },
      { name: "Harbor Peak Automation LLC", role: "Service Provider" },
    ],
    purpose: "AI workflow implementation, CRM integration, and operational support.",
    payment_terms: "$95,000 total, split 50/25/25, plus optional $4,500 per month support.",
    duration: "Initial 12-month term; 30-day termination for convenience.",
    due_date: null,
    effective_date: "Upon signature.",
    payment: emptyPayment,
  };
}

function canonicalBody(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    "This Services Agreement is between Red Mesa Logistics LLC, as Client, and Harbor Peak Automation LLC, as Service Provider.",
    "",
    "1. Scope. Service Provider will deliver AI workflow implementation, CRM integration, automation support, documentation, and rollout services.",
    "2. Fees. Client will pay $95,000 total, split 50% at kickoff, 25% at rollout, and 25% at acceptance. Optional support is $4,500 per month.",
    "3. Work Product and IP. Client owns paid deliverables and exported data. Service Provider keeps pre-existing tools, templates, and know-how.",
    "4. Confidentiality. Each party must protect nonpublic business, technical, customer, and pricing information.",
    "5. Term and Termination. The initial term is 12 months. Either party may terminate for material breach or on 30 days written notice.",
    "6. Warranties and Disclaimers. Service Provider does not guarantee third-party AI uptime or external platform availability.",
    "7. Disputes and Governing Law. Texas law governs. The parties will first attempt executive escalation and then pursue available remedies.",
    "8. Notices. Notices must be sent by email and confirmed by commercially reasonable records.",
    "9. Miscellaneous. This Agreement is the entire agreement and may be signed electronically and in counterparts.",
    "",
    "Commercial implementation details. ".repeat(120),
    "",
    "IN WITNESS WHEREOF, the parties execute this Agreement.",
    "",
    "CLIENT:",
    "Red Mesa Logistics LLC",
    "By: ______________________",
    "Name: ____________________",
    "Title: ___________________",
    "",
    "SERVICE PROVIDER:",
    "Harbor Peak Automation LLC",
    "By: ______________________",
    "Name: ____________________",
    "Title: ___________________",
  ].join("\n");
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearFrozenCanonicalAgreementCorpus();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CanonicalAgreementCorpus convergence", () => {
  it("review, readonly, handoff, VS01, and export surfaces resolve the same frozen hash", () => {
    const d = draft();
    const record = establishPaidProSourceOfTruth({
      text: canonicalBody(),
      draft: d,
      intakeText: "AI automation services agreement for $95,000 plus optional support.",
      reviewSessionId: "review-session-1",
    });

    const review = getPaidProDocumentForSurface("review");
    const readonly = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "live generated preview",
      draft: d,
      agreementDocumentText: "generated preview",
      premiumCheckoutCompleted: true,
      intakeText: "AI automation services agreement for $95,000 plus optional support.",
      lastPremiumPipelineRenderSource: "server_full_draft",
    });
    const handoff = pickAuthoritativePlainForSendHandoff(d);
    const vs01 = resolveFinalVs01CorpusOrBlock({ draft: d as never, guidedPro: true });
    const exported = readCanonicalAgreementCorpusForSurface("export", { required: true });

    expect(record.hash).toBeTruthy();
    expect(review?.hash).toBe(record.hash);
    expect(readonly.plainText).toBe(record.text);
    expect(handoff?.text).toBe(record.text);
    expect(vs01.hash).toBe(record.hash);
    expect(exported?.hash).toBe(record.hash);

    const reviewHash = review?.hash;
    const readonlyHash = record.hash;
    const handoffHash = record.hash;
    const vs01Hash = vs01.hash;
    const exportHash = exported?.hash;
    expect(reviewHash).toBe(readonlyHash);
    expect(readonlyHash).toBe(handoffHash);
    expect(handoffHash).toBe(vs01Hash);
    expect(vs01Hash).toBe(exportHash);
  });

  it("freezes canonical signer manifest with full legal entity names from intake", () => {
    const d = {
      ...draft(),
      parties: [
        { name: "Northstar", role: "Client" },
        { name: "Prairie Signal", role: "Service Provider" },
      ],
    };
    establishPaidProSourceOfTruth({
      text: canonicalBody()
        .replace(/Red Mesa Logistics LLC/g, "Northstar Robotics Inc.")
        .replace(/Harbor Peak Automation LLC/g, "Prairie Signal Holdings LP"),
      draft: d,
      intakeText:
        "Create a services agreement between Northstar Robotics Inc. and Prairie Signal Holdings LP for implementation services.",
    });
    const frozen = readCanonicalAgreementCorpusForSurface("review", { required: true, tier: "pro" });
    expect(frozen?.signerManifest[0]?.name).toBe("Northstar Robotics Inc.");
    expect(frozen?.signerManifest[1]?.name).toBe("Prairie Signal Holdings LP");
    expect(JSON.stringify(frozen?.signerManifest)).not.toMatch(/Northstar"|"Prairie Signal"/);
  });

  it("refuses fallback/live/generated preview paths after canonical freeze", () => {
    establishPaidProSourceOfTruth({ text: canonicalBody(), draft: draft() });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() =>
      assertPostCanonicalSurfaceUsesFrozenCorpus({
        surface: "readonly",
        text: "live generated preview fallback",
        source: "live_generated_preview",
      }),
    ).toThrow(/Post-canonical surface readonly attempted live_generated_preview/);
    expect(spy).toHaveBeenCalledWith(
      "[canonical-corpus-surface-drift]",
      expect.objectContaining({ surface: "readonly", source: "live_generated_preview" }),
    );
  });

  it("Pro visual authority resolves only from the canonical corpus once frozen", () => {
    const d = draft();
    const record = establishPaidProSourceOfTruth({ text: canonicalBody(), draft: d });
    const surface = resolvePaidProReviewRenderSurface({
      pickedPlain: "short live generated preview",
      pickedSource: "live_generated_preview",
      draft: d,
      premiumCheckoutCompleted: true,
      pipelineSource: "server_full_draft",
      allowLocalDeterministicFallback: true,
    });
    expect(surface.mode).toBe("authoritative_pro");
    if (surface.mode === "authoritative_pro") {
      expect(surface.plainText).toBe(record.text);
      expect(surface.sourceUsed).toBe("server_full_document_text");
    }
  });

  it("guided and simple final review read the same canonical hash", () => {
    const d = draft();
    const record = establishPaidProSourceOfTruth({ text: canonicalBody(), draft: d });
    const guided = resolveGuidedFinalReviewAuthoritativeBody({
      candidates: [{ source: "rendered_preview", body: "generated preview" }],
    });
    const simple = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: "",
      renderedPreviewPlain: "generated preview",
      finalReviewAuthorityOnly: true,
    });
    expect(guided.body).toBe(record.text);
    expect(guided.finalizedHash).toBe(record.hash);
    expect(simple.plainText).toBe(record.text);
  });

  it("authoritativeAgreementDocument is the immutable source for review, reviewer, signer, and VS01", () => {
    const d = draft();
    const record = establishPaidProSourceOfTruth({ text: canonicalBody(), draft: d });
    const authoritative = getAuthoritativeAgreementDocument();
    expect(authoritative?.fullCorpusText).toBe(record.text);
    expect(authoritative?.authoritativeHash).toBe(record.hash);
    expect(authoritative?.canonicalPartyManifest[0]?.name).toBe("Red Mesa Logistics LLC");
    expect(authoritative?.canonicalPartyManifest[1]?.name).toBe("Harbor Peak Automation LLC");

    const review = getPaidProDocumentForSurface("review");
    const reviewer = authoritativeDocumentForSurface("reviewer");
    const signer = getPaidProDocumentForSurface("signer_setup");
    const vs01 = resolveFinalVs01CorpusOrBlock({ draft: d as never, guidedPro: true });

    expect(review?.hash).toBe(record.hash);
    expect(reviewer?.authoritativeHash).toBe(record.hash);
    expect(signer?.hash).toBe(record.hash);
    expect(vs01.hash).toBe(record.hash);
  });

  it("blocks structural mutation and independent rendering after premium acceptance", () => {
    const d = draft();
    const structurallyBrokenAccepted = [
      "SERVICES AGREEMENT",
      "",
      "This Services Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
      "",
      "1. Scope. Service Provider will deliver AI workflow implementation.",
      "1.1",
      "2. Fees. Client will pay $95,000.",
      "2.1",
      "3. Governing Law. Texas law governs.",
      "",
      "Commercial implementation details. ".repeat(120),
    ].join("\n");
    const record = establishPaidProSourceOfTruth({ text: structurallyBrokenAccepted, draft: d });
    stabilizeFinalAgreementCompilerOutput(record.text, {
      surface: "post_acceptance_test_noop",
    });
    expect(() =>
      assertNoPostAcceptanceStructuralMutation({
        surface: "post_acceptance_test",
        mutation: "numbering_rebuilt",
        inputText: record.text,
        outputText: `${record.text}\n\n9. Rebuilt numbering.`,
      }),
    ).toThrow(/\[illegal-post-acceptance-mutation-attempt\]/);
    const independentlyRequestedPreview = buildAgreementPreviewText(
      { ...d, purpose: "Independently rebuilt preview.", payment_terms: "$1" },
      { starterPreview: true, intakeText: "Independent render attempt." },
    );
    expect(independentlyRequestedPreview).toBe(record.text);
    expect(getAuthoritativeAgreementDocument()?.authoritativeHash).toBe(record.hash);
  });

  it("logs and recovers instead of throwing for browser-route post-acceptance mutation attempts", () => {
    const d = draft();
    const record = establishPaidProSourceOfTruth({ text: canonicalBody(), draft: d });
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() =>
      assertNoPostAcceptanceStructuralMutation({
        surface: "review_route",
        mutation: "canonicalizer_integrity_repair",
        inputText: record.text,
        outputText: `${record.text}\n\n9. Mutated after acceptance.`,
      }),
    ).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      "[illegal-post-acceptance-mutation-attempt]",
      expect.objectContaining({
        surface: "review_route",
        mutation: "canonicalizer_integrity_repair",
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[illegal-post-acceptance-mutation-route-fallback]",
      expect.objectContaining({ surface: "review_route" }),
    );
  });
});
