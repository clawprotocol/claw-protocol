/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as paidProAgreementRecitalRepair from "./paidProAgreementRecitalRepair";
import * as paidProOpeningRecitalGuard from "./paidProOpeningRecitalGuard";
import * as paidProReviewRenderCorpus from "./paidProReviewRenderCorpus";
import { shouldDeferPaidProReviewRenderSignerRepair } from "./paidProSignerMetadataCommitPolicy";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth, hashPaidProCorpus } from "./paidProSourceOfTruth";
import {
  armPaidProHardeningSession,
  loadPaidProHardeningFixture,
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";

const FIXTURE = "freeProQaTemplateATest204";

describe("paidProSignerMetadataStagingPerformance", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("staging deferral is active while signer metadata session is open without snapshot", () => {
    armPaidProHardeningSession({ fixture: loadPaidProHardeningFixture(FIXTURE), withSignerMetadata: false });
    expect(
      shouldDeferPaidProReviewRenderSignerRepair({ signerMetadataSessionActive: true }),
    ).toBe(true);
    // Tip only defers while the signer-metadata session is active.
    expect(
      shouldDeferPaidProReviewRenderSignerRepair({ signerMetadataSessionActive: false }),
    ).toBe(false);
  });

  it("repeated resolve with deferSignerMetadataRepair does not run repair or opening guards", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });

    const guardSpy = vi.spyOn(paidProReviewRenderCorpus, "guardPaidProReviewRenderCorpus");
    const sanitizeSpy = vi.spyOn(paidProReviewRenderCorpus, "applyPaidProReviewRenderSanitizer");
    const openingSpy = vi.spyOn(paidProOpeningRecitalGuard, "ensurePaidProServicesAgreementOpening");
    const recitalSpy = vi.spyOn(paidProAgreementRecitalRepair, "repairMalformedPaidProAgreementRecital");

    const baseline = paidProReviewRenderCorpus.resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
      deferSignerMetadataRepair: true,
    });
    const baselineHash = hashPaidProCorpus(baseline);

    for (let i = 0; i < 3; i += 1) {
      const next = paidProReviewRenderCorpus.resolvePaidProReviewRenderPlain({
        draft: fixture.draft,
        intakeText: fixture.intakeText,
        deferSignerMetadataRepair: true,
      });
      expect(hashPaidProCorpus(next)).toBe(baselineHash);
    }

    expect(guardSpy).not.toHaveBeenCalled();
    expect(sanitizeSpy).not.toHaveBeenCalled();
    expect(openingSpy).not.toHaveBeenCalled();
    expect(recitalSpy).not.toHaveBeenCalled();

    guardSpy.mockRestore();
    sanitizeSpy.mockRestore();
    openingSpy.mockRestore();
    recitalSpy.mockRestore();
  });

  it("parenthetical inversion reconcile on defer path does not invoke opening guard or sanitizer", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    // Start from a substantive clean corpus, then invert only the signature parentheticals.
    const base = expandOperativeCorpusWithUniqueSupplements(
      [
        "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
        "",
        `This Agreement is entered into between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
        "",
        "1. SCOPE. Provider will deliver AI workflow implementation services.",
        "2. FEES. Client will pay a fixed fee of $8,500.",
        "3. GOVERNING LAW. Delaware law governs.",
        "4. ELECTRONIC SIGNATURES. Counterparts and e-signatures are permitted.",
        "",
        "IN WITNESS WHEREOF, the Parties execute this Agreement.",
        "",
        "CLIENT:",
        PAID_PRO_HARDENING_CLIENT,
        "By: __________________________",
        "",
        "SERVICE PROVIDER:",
        PAID_PRO_HARDENING_PROVIDER,
        "By: __________________________",
      ].join("\n"),
      SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 1600,
    );
    const witnessIdx = base.search(/\bIN WITNESS WHEREOF\b/i);
    const inverted = [
      base.slice(0, witnessIdx).trimEnd(),
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      `${PAID_PRO_HARDENING_CLIENT} (Service Provider)`,
      "By: __________________________",
      "",
      `${PAID_PRO_HARDENING_PROVIDER} (Client)`,
      "By: __________________________",
    ].join("\n");
    establishPaidProSourceOfTruth({
      text: inverted,
      intakeText: fixture.intakeText,
      draft: fixture.draft,
      source: "server_full_draft",
    });

    const sanitizeSpy = vi.spyOn(paidProReviewRenderCorpus, "applyPaidProReviewRenderSanitizer");
    const openingSpy = vi.spyOn(paidProOpeningRecitalGuard, "ensurePaidProServicesAgreementOpening");

    const renderPlain = paidProReviewRenderCorpus.resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: fixture.intakeText,
      deferSignerMetadataRepair: true,
    });
    expect(renderPlain).toMatch(/CLIENT\s*:\s*(?:\n\s*)?Blue Canyon Analytics LLC/i);
    expect(sanitizeSpy).not.toHaveBeenCalled();
    expect(openingSpy).not.toHaveBeenCalled();

    sanitizeSpy.mockRestore();
    openingSpy.mockRestore();
  });

  it("partial address staging uses defer path without fused-party guard", () => {
    const fixture = loadPaidProHardeningFixture(FIXTURE);
    armPaidProHardeningSession({ fixture, withSignerMetadata: false });
    const intake = `between ${PAID_PRO_HARDENING_CLIENT} and ${PAID_PRO_HARDENING_PROVIDER}`;

    const guardSpy = vi.spyOn(paidProReviewRenderCorpus, "guardPaidProReviewRenderCorpus");

    paidProReviewRenderCorpus.resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: intake,
      deferSignerMetadataRepair: true,
    });
    const lasVegas = paidProReviewRenderCorpus.resolvePaidProReviewRenderPlain({
      draft: fixture.draft,
      intakeText: intake,
      deferSignerMetadataRepair: true,
    });

    expect(lasVegas.length).toBeGreaterThan(500);
    expect(guardSpy).not.toHaveBeenCalled();
    guardSpy.mockRestore();
  });
});
