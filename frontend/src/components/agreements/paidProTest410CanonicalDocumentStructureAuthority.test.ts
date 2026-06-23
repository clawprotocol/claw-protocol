/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  classifyPaidProDocumentBlocks,
  summarizePaidProDocumentBlockClassifications,
} from "./paidProDocumentBlockClassifier";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  applyPaidProCanonicalDocumentStructureAuthority,
  resetPaidProCanonicalDocumentStructureAuthorityLogsForTests,
} from "./paidProCanonicalDocumentStructureAuthority";
import { splitGluedNumberedSectionLine } from "./paidProNumberedSectionHeadingBodySplit";
import * as paidProSectionRenderNormalize from "./paidProSectionRenderNormalize";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import {
  TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
  test407Draft,
} from "./paidProTest407Fixtures";
import { TEST400_PRODUCTION_PROSE_INTAKE } from "./paidProTest400DegradedJsonParseQuadPartyProseRecovery.test";
import { buildPremiumAgreementReadonlyHtml } from "./premiumAgreementDocumentHtml";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import { preparePaidProFrozenDisplayPlain } from "./paidProFlattenedDocumentNormalize";

const WITNESS = "IN WITNESS WHEREOF, the Parties execute this Agreement.";

function test407DraftShape() {
  return test407Draft();
}

function buildGluedProductionFailureCorpus(): string {
  const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
    draft: test407DraftShape(),
    rawIntake: TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
  });
  if (!fallback.ok) throw new Error(`fallback failed: ${fallback.reasons.join(",")}`);
  return fallback.body
    .replace(
      /^3\. PAYMENT AND CONSIDERATION\n\nFees,/m,
      "3. PAYMENT AND CONSIDERATION Fees, revenue sharing, provider fees, and payment timing are as follows: Total project value is $185,000.",
    )
    .replace(
      /^10\. NOTICES\n\nNotices under this Agreement/m,
      "10. NOTICES Notices under this Agreement must be in writing and may be delivered by email to the primary business email of each Party.",
    );
}

function assertIsolatedSectionHeadings(plain: string): void {
  const blocks = classifyPaidProDocumentBlocks(plain);
  for (const block of blocks) {
    if (block.kind !== "main_section_heading") continue;
    expect(block.block.trim()).toBe(block.firstLine.trim());
    expect(block.block).not.toMatch(/\b(?:shall|will|must|Fees|Notices under)\b/);
  }
}

function assertNoInlineHeadingBodyGlue(plain: string): void {
  for (const block of classifyPaidProDocumentBlocks(plain)) {
    if (block.kind !== "main_section_heading") continue;
    expect(block.block.trim()).toBe(block.firstLine.trim());
  }
  expect(plain).not.toContain("PAYMENT AND CONSIDERATION Fees");
  expect(plain).not.toContain("NOTICES Notices under this Agreement");
}

describe("TEST410 — Canonical Document Structure Authority", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPaidProPostAcceptanceValidatorCache();
    resetPaidProCanonicalDocumentStructureAuthorityLogsForTests();
    vi.restoreAllMocks();
  });

  it("A — repairs production PAYMENT and NOTICES heading collapse before freeze", () => {
    const glued = buildGluedProductionFailureCorpus();
    expect(glued).toMatch(/3\. PAYMENT AND CONSIDERATION Fees,/);
    expect(glued).toMatch(/10\. NOTICES Notices under this Agreement/);

    const repaired = applyPaidProCanonicalDocumentStructureAuthority(glued, {
      source: "test410_production_failure",
    });
    expect(repaired.diagnostics.headingBodyCollapseCount).toBeGreaterThan(0);
    expect(repaired.text).toContain("3. PAYMENT AND CONSIDERATION\n\nFees,");
    expect(repaired.text).toContain("10. NOTICES\n\nNotices under this Agreement");
    assertIsolatedSectionHeadings(repaired.text);
    assertNoInlineHeadingBodyGlue(repaired.text);

    const html = buildPremiumAgreementReadonlyHtml(repaired.text, {
      surface: "test410_production_failure",
      signatureSectionMode: "collaboration",
      partyNames: ["Red Mesa Logistics LLC", "Blue Canyon Analytics LLC", "Harbor Peak Automation LLC", "Iron Vale Systems Inc."],
    });
    expect(html).toMatch(/<h2[^>]*>\s*3\. PAYMENT AND CONSIDERATION\s*<\/h2>/i);
    expect(html).not.toMatch(/PAYMENT AND CONSIDERATION Fees,/);
  });

  it("B/C — preserves long wrapped heading continuations without absorbing body prose", () => {
    const wrapped = [
      "1. SERVICES AND SCOPE",
      "Each Party may provide professional services.",
      "",
      "3. PAYMENT AND CONSIDERATION FOR",
      "ADDITIONAL PROFESSIONAL SERVICES",
      "",
      "Fees are payable according to the schedules the Parties agree in writing.",
      "",
      WITNESS,
    ].join("\n");

    const repaired = applyPaidProCanonicalDocumentStructureAuthority(wrapped, {
      source: "test410_wrapped_heading",
    });
    expect(repaired.text).toMatch(
      /3\. PAYMENT AND CONSIDERATION FOR(?:\nADDITIONAL PROFESSIONAL SERVICES| ADDITIONAL PROFESSIONAL SERVICES)/,
    );
    expect(repaired.text).toContain("\n\nFees are payable according to the schedules");
    assertIsolatedSectionHeadings(repaired.text);
  });

  it("D — splits numbered heading followed immediately by prose on one line", () => {
    const split = splitGluedNumberedSectionLine(
      "1. Services and Scope The Provider will deliver the services described in this Agreement.",
    );
    expect(split?.heading).toBe("1. Services and Scope");
    expect(split?.body).toMatch(/^The Provider will deliver/);

    const repaired = applyPaidProCanonicalDocumentStructureAuthority(
      [
        "MUTUAL SERVICES AGREEMENT",
        "",
        "1. Services and Scope The Provider will deliver the services described in this Agreement.",
        "",
        WITNESS,
      ].join("\n\n"),
      { source: "test410_immediate_prose" },
    );
    expect(repaired.text).toContain("1. Services and Scope\n\nThe Provider will deliver");
  });

  it("E — deterministic fallback corpus keeps isolated headings through acceptance", () => {
    const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
      draft: test407DraftShape(),
      rawIntake: TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    expect(fallback.ok).toBe(true);

    const accepted = applyAcceptedProCorpusSafeDisplay(fallback.body, {
      draft: test407DraftShape(),
      intakeText: TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
      surface: "test410_deterministic_fallback",
    });
    assertIsolatedSectionHeadings(accepted.text);
    expect(summarizePaidProDocumentBlockClassifications(accepted.text).mainSectionHeadingCount).toBeGreaterThan(8);
  });

  it("F — local recovery corpus receives structure authority before freeze", () => {
    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: test407DraftShape(),
      rawIntake: TEST400_PRODUCTION_PROSE_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recovery.ok).toBe(true);

    const glued = recovery.body.replace(
      /^3\. PAYMENT AND CONSIDERATION\n\nFees,/m,
      "3. PAYMENT AND CONSIDERATION Fees, revenue sharing, and payment timing are as follows.",
    );
    const accepted = applyAcceptedProCorpusSafeDisplay(glued, {
      draft: test407DraftShape(),
      intakeText: TEST400_PRODUCTION_PROSE_INTAKE,
      surface: "test410_local_recovery",
    });
    expect(accepted.text).toContain("3. PAYMENT AND CONSIDERATION\n\nFees,");
    assertIsolatedSectionHeadings(accepted.text);
  });

  it("G — server degraded corpus repairs before canonical freeze without post-freeze section render", () => {
    const raw = buildGluedProductionFailureCorpus();
    markPaidProPipelineValidationPassed({ text: raw, source: "server_full_draft" });

    const prepared = preparePaidProServerDocumentForAcceptance(raw, test407DraftShape(), TEST407_PRODUCTION_QUAD_PARTY_INTAKE, {
      surface: "test410_server_degraded",
    });
    assertIsolatedSectionHeadings(prepared.text);

    establishPaidProSourceOfTruth({
      text: prepared.text,
      source: "server_full_draft",
      draft: test407DraftShape(),
      intakeText: TEST407_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    const frozen = getPaidProSourceOfTruthText();
    assertIsolatedSectionHeadings(frozen);
    assertNoInlineHeadingBodyGlue(frozen);

    const sectionRenderSpy = vi.spyOn(paidProSectionRenderNormalize, "normalizePaidProSectionRender");
    const frozenDisplay = preparePaidProFrozenDisplayPlain(frozen).text;
    expect(frozenDisplay).toBe(frozen.trimEnd());
    expect(sectionRenderSpy).not.toHaveBeenCalled();

    const hashAfterFreeze = hashPaidProCorpus(frozen);
    expect(hashPaidProCorpus(getPaidProSourceOfTruthText())).toBe(hashAfterFreeze);
    expect(hashPaidProCorpus(frozenDisplay)).toBe(hashAfterFreeze);
  });
});
