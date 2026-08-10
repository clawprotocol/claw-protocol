/**
 * GTM retest (2026-08-09): 4-party collaboration painted, signers filled, but finalize
 * failed with "could not save… Tap Retry" because pipeline paint lacked review-session
 * authority. Also: Agreement12. NOTICES fuse on display; Sample Corp / ABC LLC stale slots.
 * Universal — not prompt-specific.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { repairFusedNoticesHeadingToPriorClause } from "./paidProPartyNoticeDetails";
import {
  clearPaidProReviewSessionAuthorityForTests,
  ensurePaidProReviewSessionAuthorityFromVisibleCorpus,
  hasPaidProReviewSessionAuthority,
  resolvePaidProReviewSessionAuthorityPersistPlain,
} from "./paidProReviewSessionAuthority";
import { resolveSignerPartyLegalEntityDisplayValue } from "./signerSetupPartyIdentity";
import type { SignerSetupPartyIdentity } from "./signerSetupPartyIdentity";

const FUSED_NOTICES_BODY = [
  "COLLABORATION AGREEMENT",
  "",
  "This Agreement is among Alpha LLC, Beacon Inc, Cedar LP, and Delta Co.",
  "",
  "10. Termination",
  "Either Party may terminate this Agreement at any time by written notice. Termination will not affect accrued rights as stated in this Agreement12. NOTICES",
  "",
  "Any notice under this Agreement must be in writing.",
  "",
  "If to Alpha LLC:",
  "Alpha LLC",
  "provided during signer setup.",
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n");

function padCorpus(base: string, minLen = 2200): string {
  if (base.length >= minLen) return base;
  return `${base}\n\n${"Commercial implementation details. ".repeat(Math.ceil((minLen - base.length) / 34))}`;
}

describe("paidPro 4-party finalize persist + fused notices (universal)", () => {
  afterEach(() => {
    clearPaidProReviewSessionAuthorityForTests();
  });

  it("establishes review-session authority from visible pipeline corpus when missing", () => {
    expect(hasPaidProReviewSessionAuthority()).toBe(false);
    const corpus = padCorpus(FUSED_NOTICES_BODY);
    const result = ensurePaidProReviewSessionAuthorityFromVisibleCorpus({
      corpusPlain: corpus,
      source: "test_visible_pipeline",
    });
    expect(result.established).toBe(true);
    expect(hasPaidProReviewSessionAuthority()).toBe(true);
    expect(resolvePaidProReviewSessionAuthorityPersistPlain().length).toBeGreaterThanOrEqual(2200);
    // Idempotent
    expect(
      ensurePaidProReviewSessionAuthorityFromVisibleCorpus({ corpusPlain: corpus }).established,
    ).toBe(false);
  });

  it("ensureReviewAgreementWorkspaceId latches visible corpus before paint-ready gate", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const ensureIdx = intake.indexOf("const ensureReviewAgreementWorkspaceId = React.useCallback");
    expect(ensureIdx).toBeGreaterThan(-1);
    const block = intake.slice(ensureIdx, ensureIdx + 4500);
    expect(block).toContain("ensurePaidProReviewSessionAuthorityFromVisibleCorpus");
    expect(block).toContain("ensure_workspace_visible_corpus");
    expect(block.indexOf("ensurePaidProReviewSessionAuthorityFromVisibleCorpus")).toBeLessThan(
      block.indexOf("isPaidProReviewBodyVisiblyPaintReady"),
    );
    expect(block).not.toMatch(/Alpha LLC|Beacon Inc|collaboration|partyCount\s*===/i);
  });

  it("defuses Agreement12. NOTICES (any casing) on display prep — not freeze-only", () => {
    const bare = repairFusedNoticesHeadingToPriorClause(
      "rights as stated in this Agreement12. NOTICES\n\nAny notice",
    );
    expect(bare.repairs.length).toBeGreaterThan(0);
    expect(bare.text).toMatch(/12\.\s+NOTICES/i);
    expect(bare.text).not.toMatch(/Agreement12\.\s*NOTICES/i);

    const display = preparePaidProReviewDisplayPlain(FUSED_NOTICES_BODY);
    // Outcome lock: fused heading must never reach the user-visible review body.
    expect(display.text).not.toMatch(/Agreement\d+\.\s*NOTICES/i);
    expect(display.text).toMatch(/\n\d+\.\s+NOTICES\n/i);
    // Display prep must run the fused-notices defuser (or an equivalent normalize) before structure logs.
    const prepSrc = readFileSync(join(__dirname, "paidProFlattenedDocumentNormalize.ts"), "utf8");
    expect(prepSrc).toContain("repairFusedNoticesHeadingToPriorClause");
    expect(prepSrc.indexOf("repairFusedNoticesHeadingToPriorClause")).toBeLessThan(
      prepSrc.indexOf('applySectionStructureIntegrity(out, { source: "preparePaidProReviewDisplayPlain" })'),
    );
  });

  it("disposable demo seeds never override canonical intake party names in signer fields", () => {
    const identities: SignerSetupPartyIdentity[] = [
      { legalEntityName: "Alpha LLC", displayName: "Alpha LLC", source: "intake" },
      { legalEntityName: "Beacon Inc", displayName: "Beacon Inc", source: "intake" },
      { legalEntityName: "Cedar LP", displayName: "Cedar LP", source: "intake" },
      { legalEntityName: "Delta Co", displayName: "Delta Co", source: "intake" },
    ];
    expect(
      resolveSignerPartyLegalEntityDisplayValue({
        slotIndex: 0,
        currentInputValue: "ABC LLC",
        slotIdentities: identities,
      }),
    ).toBe("Alpha LLC");
    expect(
      resolveSignerPartyLegalEntityDisplayValue({
        slotIndex: 1,
        currentInputValue: "Sample Corp",
        slotIdentities: identities,
      }),
    ).toBe("Beacon Inc");
    expect(
      resolveSignerPartyLegalEntityDisplayValue({
        slotIndex: 3,
        currentInputValue: "Delta Co",
        slotIdentities: identities,
      }),
    ).toBe("Delta Co");
  });
});
