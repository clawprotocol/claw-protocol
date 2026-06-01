import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAgreementPreviewText } from "../../agreementPreviewFromDraft";
import {
  assertNoPostAcceptanceStructuralMutation,
  clearAuthoritativeAgreementDocument,
  clearPostAcceptanceMutationAuditBuffer,
  establishAuthoritativeAgreementDocument,
  readPostAcceptanceMutationAuditBuffer,
  returnAuthoritativeTextForIllegalPostAcceptanceGeneration,
  setPostAcceptanceMutationAuditCapture,
} from "../../authoritativeAgreementDocument";
import { resolveAuthoritativePaidProReviewPlain } from "../../authoritativePaidProReview";
import { buildPremiumAgreementReadonlyHtml } from "../../premiumAgreementDocumentHtml";
import {
  paidProAuthoritativeRenderGateMeta,
  resolvePaidProAuthoritativeDisplayPlain,
  shouldUsePaidProSourceOfTruthDisplayOnly,
} from "../../paidProAuthoritativeRenderGate";
import { applyProCorpusIntegrity } from "../../proCorpusIntegrity";
import { stabilizeFinalAgreementCompilerOutput } from "../../finalAgreementCompilerIntegrity";
import { countPaidProExecutionBlocks } from "../../paidProExecutionBlockAuthority";
import { findSignatureRegionStart } from "../../guidedDealCompletion/signatureRegion";
import { resolvePremiumSignaturePreviewMode } from "../../premiumAgreementDocumentHtml";
import {
  clearPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "../../paidProSourceOfTruth";
import { resetPaidProMutationTraceForTests } from "../../paidProMutationTrace";
import {
  armPaidProHardeningSession,
  loadTest219HardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
  TEST219_INTAKE_PROMPT,
} from "./paidProHardeningFixtures";
import { normalizeCorpusForCopyCompare } from "../paidProCorpusIntegrity/paidProCorpusIntegrityMetrics";

describe("paidPro Test219 first-review corpus authority", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeAgreementDocument();
    clearPostAcceptanceMutationAuditBuffer();
    setPostAcceptanceMutationAuditCapture(false);
    resetPaidProMutationTraceForTests();
    vi.restoreAllMocks();
  });

  function armTest219Session() {
    const fixture = loadTest219HardeningFixture();
    expect(fixture.intakeText).toContain(TEST219_INTAKE_PROMPT.slice(0, 40));
    const { acceptedText } = armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    expect(acceptedText.length).toBeGreaterThan(10_000);
    const record = getPaidProSourceOfTruth()!;
    establishAuthoritativeAgreementDocument({
      fullCorpusText: acceptedText,
      generationMetadata: { source: "server_full_draft", rawAcceptedLen: acceptedText.length },
    });
    return { fixture, acceptedText, record };
  }

  it("accepted authoritative body length remains above 10k and display gate is active", () => {
    const { acceptedText, record } = armTest219Session();
    expect(record.hash).toBeTruthy();
    expect(shouldUsePaidProSourceOfTruthDisplayOnly()).toBe(true);
    const gate = paidProAuthoritativeRenderGateMeta();
    expect(gate?.len).toBeGreaterThan(10_000);
    expect(gate?.hash).toBe(record.hash);
    expect(resolvePaidProAuthoritativeDisplayPlain().length).toBe(acceptedText.length);
  });

  it("first Pro review plain matches SoT hash without integrity or compiler repair", () => {
    const { fixture, acceptedText, record } = armTest219Session();
    const opts = { draft: fixture.draft, intakeText: fixture.intakeText };
    const reviewPlain = resolveAuthoritativePaidProReviewPlain(opts);
    expect(reviewPlain.length).toBeGreaterThan(10_000);
    expect(hashPaidProCorpus(reviewPlain)).toBe(record.hash);

    const integrity = applyProCorpusIntegrity(acceptedText, {
      intakeText: fixture.intakeText,
      surface: "draft_ready_for_review",
    });
    expect(integrity.repairs).toEqual([]);
    expect(hashPaidProCorpus(integrity.text)).toBe(record.hash);

    const compiler = stabilizeFinalAgreementCompilerOutput(acceptedText, {
      intakeText: fixture.intakeText,
      surface: "draft_ready_for_review",
    });
    expect(compiler.repairs).toEqual([]);
    expect(hashPaidProCorpus(compiler.text)).toBe(record.hash);
  });

  it("preview_starter and independent builders cannot replace paid review after acceptance", () => {
    const { fixture, acceptedText, record } = armTest219Session();
    setPostAcceptanceMutationAuditCapture(true);

    const starterAttempt = buildAgreementPreviewText(fixture.draft, {
      starterPreview: true,
      intakeText: fixture.intakeText,
    });
    expect(normalizeCorpusForCopyCompare(starterAttempt)).toBe(
      normalizeCorpusForCopyCompare(acceptedText),
    );
    expect(hashPaidProCorpus(starterAttempt)).toBe(record.hash);

    expect(() =>
      assertNoPostAcceptanceStructuralMutation({
        surface: "draft_ready_for_review",
        mutation: "integrity_repair_mutation",
        inputText: acceptedText,
        outputText: `${acceptedText.slice(0, 4000)}\n\n9. Injected after acceptance.`,
      }),
    ).toThrow(/illegal-post-acceptance-mutation-attempt/);

    expect(() =>
      returnAuthoritativeTextForIllegalPostAcceptanceGeneration({
        surface: "preview_starter",
        builder: "buildAgreementPreviewText",
        generatedText: "Starter short preview body.",
      }),
    ).toThrow(/illegal-post-acceptance-mutation-attempt/);

    const events = readPostAcceptanceMutationAuditBuffer();
    expect(events.some((e) => e.mutation.includes("integrity_repair_mutation"))).toBe(true);
  });

  it("preserves single execution block with correct roles and no post-execution numbered sections", () => {
    const { fixture } = armTest219Session();
    const reviewPlain = resolveAuthoritativePaidProReviewPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);

    const witnessIdx = reviewPlain.search(/\bIN WITNESS WHEREOF\b/i);
    expect(witnessIdx).toBeGreaterThan(0);
    const tail = reviewPlain.slice(witnessIdx);
    expect(tail).toMatch(/CLIENT\s*:\s*\nBlue Canyon Analytics LLC/i);
    expect(tail).toMatch(/SERVICE\s+PROVIDER\s*:\s*\nIron Vale Systems Inc/i);
    expect(tail).not.toMatch(
      /CLIENT\s*:\s*[\s\S]*Iron Vale Systems Inc[\s\S]*SERVICE\s+PROVIDER\s*:\s*[\s\S]*Blue Canyon Analytics LLC/i,
    );

    const executionTail = reviewPlain.slice(witnessIdx);
    expect(executionTail).not.toMatch(/\n\s*\d+\.\s+[A-Z]/);
    expect(findSignatureRegionStart(reviewPlain)).toBe(witnessIdx);

    const previewMode = resolvePremiumSignaturePreviewMode(reviewPlain, 2, {
      forceEmbeddedCorpusSignature: true,
    });
    expect(previewMode.hasCorpusSignatureBlock).toBe(true);
    expect(previewMode.mode).toBe("embedded_corpus_signature_block");

    const html = buildPremiumAgreementReadonlyHtml(reviewPlain, {
      signatureSectionMode: "collaboration",
      partyNames: [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      suppressDocumentIntelligenceCallouts: true,
      forceEmbeddedCorpusSignature: true,
    });
    expect(html).not.toContain("claw-premium-signature-section");
    expect(html).not.toMatch(/The lines below mirror a traditional signature page/i);
  });
});
