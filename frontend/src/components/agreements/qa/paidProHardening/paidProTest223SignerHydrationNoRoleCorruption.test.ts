import { afterEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "../../authoritativeSignerHydration";
import { clearAuthoritativeSigningSnapshot } from "../../authoritativeSigningSnapshot";
import {
  buildExpandedTest223PreSignerCorpus,
  buildTest223SignerAuthority,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
  TEST219_INTAKE_PROMPT,
} from "./paidProHardeningFixtures";
import type { PaidProHardeningFixtureBundle } from "./paidProHardeningFixtures";
import { applyAcceptedProCorpusSafeDisplay } from "../../acceptedProCorpusSafeDisplay";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  resolvePaidProFinalHydratedCorpusForSurface,
  setPaidProPinnedSignerAppliedCorpus,
} from "../../paidProFinalHydratedCorpus";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "../../paidProSignerMetadataAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "../../paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "../../paidProReviewRenderCorpus";
import { normalizeCorpusForCopyCompare } from "../paidProCorpusIntegrity/paidProCorpusIntegrityMetrics";
import { analyzePaidProExecutionBlockInvariant } from "../../paidProExecutionBlockAuthority";

const MIN_CORPUS = 10_000;

function test223Fixture(): PaidProHardeningFixtureBundle {
  return {
    name: "freeProQaTemplateATest223",
    rawCorpus: buildExpandedTest223PreSignerCorpus(),
    intakeText: TEST219_INTAKE_PROMPT,
    draft: {
      parties: [
        { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
        { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
      ],
    },
  } as PaidProHardeningFixtureBundle;
}

function signatureTail(corpus: string): string {
  const idx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  return idx >= 0 ? corpus.slice(idx) : corpus;
}

function clientBlock(corpus: string): string {
  const tail = signatureTail(corpus);
  const m = tail.match(/CLIENT\s*:\s*([\s\S]*?)(?=SERVICE\s+PROVIDER\s*:|$)/i);
  return m?.[1] ?? "";
}

function providerBlock(corpus: string): string {
  const tail = signatureTail(corpus);
  const m = tail.match(/SERVICE\s+PROVIDER\s*:\s*([\s\S]*?)$/i);
  return m?.[1] ?? "";
}

describe("paidProTest223SignerHydrationNoRoleCorruption", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("pre-signer corpus is >10k with two parties; post-signer stays >10k without role corruption", () => {
    const fixture = test223Fixture();
    const safe = applyAcceptedProCorpusSafeDisplay(fixture.rawCorpus, {
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    const preSigner = safe.text;
    expect(preSigner.length).toBeGreaterThan(MIN_CORPUS);
    expect(preSigner).toMatch(new RegExp(`${PAID_PRO_HARDENING_CLIENT.replace(/\./g, "\\.")}.*\\("Client"\\)`, "i"));
    expect(preSigner).toMatch(new RegExp(`${PAID_PRO_HARDENING_PROVIDER.replace(/\./g, "\\.")}.*\\("Service Provider"\\)`, "i"));

    establishPaidProSourceOfTruth({ text: preSigner, source: "server_full_draft" });
    const authority = buildTest223SignerAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: preSigner,
      authority,
      intakeRaw: fixture.intakeText,
      surface: "test223_finalize",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).toBe(false);
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);

    const postSigner = resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
    });
    expect(postSigner.length).toBeGreaterThan(MIN_CORPUS);

    expect(postSigner).not.toMatch(/Party\s+3\s*:/i);
    expect(postSigner).not.toMatch(/Party\s+1\s*:\s*\n\s*Blue Canyon/i);
    expect(postSigner).not.toMatch(/Party Notice Details:/i);
    expect(postSigner).toMatch(/Email for Notice:\s*\S+@/i);
    expect((postSigner.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);

    const exec = analyzePaidProExecutionBlockInvariant(postSigner, { expectedParties: 2 });
    expect(exec.ok).toBe(true);

    const client = clientBlock(postSigner);
    const provider = providerBlock(postSigner);
    expect(client).toMatch(/Blue Canyon Analytics LLC/i);
    expect(client).not.toMatch(/Iron Vale/i);
    expect(provider).toMatch(/Iron Vale Systems Inc/i);
    expect(provider).not.toMatch(/Blue Canyon/i);

    expect(client).toMatch(/Anthem H Blanchard/i);
    expect(client).not.toMatch(/Ira Banks/i);
    expect(provider).toMatch(/Ira Banks/i);
    expect(provider).not.toMatch(/Anthem H Blanchard/i);

    const renderOpts = { draft: fixture.draft, intakeText: fixture.intakeText };
    const copy = resolvePaidProFinalHydratedCorpusForSurface("copy", renderOpts).text;
    const display = getPaidProDocumentForSurface("display", renderOpts)!.text;
    expect(normalizeCorpusForCopyCompare(copy)).toBe(normalizeCorpusForCopyCompare(postSigner));
    expect(normalizeCorpusForCopyCompare(display)).toBe(normalizeCorpusForCopyCompare(postSigner));
  });
});
