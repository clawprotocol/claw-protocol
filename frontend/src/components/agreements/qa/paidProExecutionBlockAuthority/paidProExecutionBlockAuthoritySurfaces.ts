import { buildPremiumAgreementReadonlyHtml } from "../../premiumAgreementDocumentHtml";
import { resolvePaidProReviewRenderPlain } from "../../paidProReviewRenderCorpus";
import {
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruthText,
} from "../../paidProSourceOfTruth";
import type { PaidProHardeningFixtureBundle } from "../paidProHardening/paidProHardeningFixtures";
import { normalizeCorpusForCopyCompare } from "../paidProCorpusIntegrity/paidProCorpusIntegrityMetrics";

export type PaidProExecutionBlockSurfaceLabel =
  | "review"
  | "signer_setup"
  | "send_cta"
  | "esign_handoff"
  | "authoritative_corpus";

export type PaidProExecutionBlockSurfaceCapture = {
  texts: Record<PaidProExecutionBlockSurfaceLabel, string>;
  pdfHtml: string;
};

export function capturePaidProExecutionBlockSurfaces(
  fixture: PaidProHardeningFixtureBundle,
): PaidProExecutionBlockSurfaceCapture {
  const opts = { draft: fixture.draft, intakeText: fixture.intakeText };
  const review = resolvePaidProReviewRenderPlain(opts);
  const signerSetup = getPaidProDocumentForSurface("signer_setup", opts)?.text ?? "";
  const esign = getPaidProDocumentForSurface("vs01", opts)?.text ?? review;
  const partyNames = [
    fixture.draft.parties?.[0]?.name ?? "Party 1",
    fixture.draft.parties?.[1]?.name ?? "Party 2",
  ].filter(Boolean) as string[];
  const pdfHtml = buildPremiumAgreementReadonlyHtml(review, {
    signatureSectionMode: "execution",
    partyNames,
    forceEmbeddedCorpusSignature: true,
    suppressDocumentIntelligenceCallouts: true,
  });
  return {
    texts: {
      review,
      signer_setup: signerSetup,
      send_cta: review,
      esign_handoff: esign,
      authoritative_corpus: getPaidProSourceOfTruthText(),
    },
    pdfHtml,
  };
}

export function normalizedSurfaceBody(text: string): string {
  return normalizeCorpusForCopyCompare(text);
}
