import { afterEach, describe, expect, it } from "vitest";
import { clearAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "../../authoritativeSignerHydration";
import { clearPaidProPinnedSignerAppliedCorpus } from "../../paidProFinalHydratedCorpus";
import { applyPaidProReviewRenderSanitizer } from "../../paidProReviewRenderCorpus";
import { rebuildSignatureBlocksWithPartyIdentities } from "../../guidedDealCompletion/signerPartyIdentity";
import { authorityPartiesToCanonicalPartyIdentities } from "../../paidProSignerMetadataAuthority";
import { clearConsumedPaidProSignerMetadataAuthority } from "../../paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth, getPaidProSourceOfTruthText } from "../../paidProSourceOfTruth";
import {
  analyzePaidProExecutionBlockInvariant,
  assertPaidProSingleExecutionBlock,
  countPaidProExecutionBlocks,
  forbidPaidProExecutionBlockSynthesis,
} from "../../paidProExecutionBlockAuthority";
import {
  armPaidProHardeningSession,
  buildTest204SignerAuthority,
  loadPaidProHardeningFixture,
} from "../paidProHardening/paidProHardeningFixtures";
import {
  capturePaidProExecutionBlockSurfaces,
  normalizedSurfaceBody,
} from "./paidProExecutionBlockAuthoritySurfaces";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProExecutionBlockAuthority surface invariants", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("exactly one execution block on review, signer setup, send CTA, e-sign, SoT, and PDF plain", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const { texts, pdfHtml } = capturePaidProExecutionBlockSurfaces(fixture);

    for (const [surface, corpus] of Object.entries(texts)) {
      assertPaidProSingleExecutionBlock(corpus, surface);
      expect(countPaidProExecutionBlocks(corpus)).toBe(1);
    }

    expect(pdfHtml).not.toContain("claw-premium-signature-section");
    expect(pdfHtml).not.toMatch(/The lines below mirror a traditional signature page/i);
    expect(pdfHtml).toMatch(/IN WITNESS WHEREOF/i);
  });

  it("signer setup, send CTA, e-sign, and PDF plain match review corpus", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const { texts } = capturePaidProExecutionBlockSurfaces(fixture);
    const reviewNorm = normalizedSurfaceBody(texts.review);

    expect(normalizedSurfaceBody(texts.signer_setup)).toBe(reviewNorm);
    expect(normalizedSurfaceBody(texts.send_cta)).toBe(reviewNorm);
    expect(normalizedSurfaceBody(texts.esign_handoff)).toBe(reviewNorm);
  });

  it("authoritative SoT retains a single execution block (pre-hydration signer fields)", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const sot = getPaidProSourceOfTruthText();
    expect(countPaidProExecutionBlocks(sot)).toBe(1);
    expect(forbidPaidProExecutionBlockSynthesis(sot)).toBe(true);
  });
});

describe("paidProExecutionBlockAuthority synthesis guards", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("hydration does not create a second execution block", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    const { authority } = armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const raw = getPaidProSourceOfTruthText();
    expect(countPaidProExecutionBlocks(raw)).toBe(1);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: raw,
      authority: authority!,
      intakeRaw: fixture.intakeText,
      surface: "execution_block_audit",
    });

    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);
    expect(analyzePaidProExecutionBlockInvariant(hydrated.corpus).ok).toBe(true);
  });

  it("rebuildSignatureBlocksWithPartyIdentities is a no-op when corpus already has authoritative block", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const raw = getPaidProSourceOfTruthText();
    const authority = buildTest204SignerAuthority();
    const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);

    const rebuilt = rebuildSignatureBlocksWithPartyIdentities(raw, identities);
    expect(rebuilt.count).toBe(0);
    expect(countPaidProExecutionBlocks(rebuilt.text)).toBe(1);
    expect(rebuilt.text).toBe(raw);
  });

  it("review render sanitizer does not append a second execution block", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const raw = getPaidProSourceOfTruthText();
    const authority = buildTest204SignerAuthority();
    const before = countPaidProExecutionBlocks(raw);

    const sanitized = applyPaidProReviewRenderSanitizer(raw, authority.parties);
    expect(countPaidProExecutionBlocks(sanitized.text)).toBe(before);
    expect(analyzePaidProExecutionBlockInvariant(sanitized.text).ok).toBe(true);
  });

  it("fails invariant when a second IN WITNESS block is injected", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: true });
    const raw = getPaidProSourceOfTruthText();
    const duped = `${raw}\n\nIN WITNESS WHEREOF, duplicate block.\n\nCLIENT:\nX\nBy: ___\n`;
    expect(() => assertPaidProSingleExecutionBlock(duped, "synthetic_duplicate")).toThrow(
      /execution_block_duplicate|witness_clause_duplicate/,
    );
  });
});
