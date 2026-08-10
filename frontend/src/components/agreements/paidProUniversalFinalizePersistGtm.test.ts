/**
 * Universal GTM lock: signer-finalize persist + fused Notices + demo-seed identity
 * must work for any user prompt / deal family / 2–4 party count — not one retest case.
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
} from "./paidProReviewSessionAuthority";
import { resolveSignerPartyLegalEntityDisplayValue } from "./signerSetupPartyIdentity";
import type { SignerSetupPartyIdentity } from "./signerSetupPartyIdentity";
import { isRecipientHandoffSeedDisposable } from "./reviewPlaceholderGuard";

function padCorpus(base: string, minLen = 2200): string {
  if (base.length >= minLen) return base;
  return `${base}\n\n${"Commercial implementation details. ".repeat(Math.ceil((minLen - base.length) / 34))}`;
}

function fusedTermNoticesBody(args: {
  title: string;
  amongLine: string;
}): string {
  return [
    args.title,
    "",
    args.amongLine,
    "",
    "10. Termination",
    "Either Party may terminate this Agreement at any time by written notice. Termination will not affect accrued rights as stated in this Agreement12. NOTICES",
    "",
    "Any notice under this Agreement must be in writing.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  ].join("\n");
}

const SPECTRUM: ReadonlyArray<{
  family: string;
  title: string;
  amongLine: string;
  parties: readonly string[];
}> = [
  {
    family: "nda_2",
    title: "MUTUAL NON-DISCLOSURE AGREEMENT",
    amongLine: "This Agreement is between Anthem Blanchard and Acme LLC.",
    parties: ["Anthem Blanchard", "Acme LLC"],
  },
  {
    family: "services_2",
    title: "SERVICES AGREEMENT",
    amongLine: "This Agreement is between Red Mesa Logistics LLC and Harbor Peak Automation LLC.",
    parties: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
  },
  {
    family: "saas_2",
    title: "SAAS SUBSCRIPTION AGREEMENT",
    amongLine: "This Agreement is between Northstar Analytics LLC and PixelForge Labs.",
    parties: ["Northstar Analytics LLC", "PixelForge Labs"],
  },
  {
    family: "msa_3",
    title: "MASTER SERVICES AGREEMENT",
    amongLine: "This Agreement is among Orion Labs LLC, Vega Systems Inc, and Quill Partners LP.",
    parties: ["Orion Labs LLC", "Vega Systems Inc", "Quill Partners LP"],
  },
  {
    family: "collaboration_4",
    title: "COLLABORATION AGREEMENT",
    amongLine: "This Agreement is among Alpha LLC, Beacon Inc, Cedar LP, and Delta Co.",
    parties: ["Alpha LLC", "Beacon Inc", "Cedar LP", "Delta Co"],
  },
];

describe("paidPro universal finalize persist GTM (all prompt types)", () => {
  afterEach(() => {
    clearPaidProReviewSessionAuthorityForTests();
  });

  it("workspace mint path has no family / jurisdiction / fixture-party branching", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const ensureIdx = intake.indexOf("const ensureReviewAgreementWorkspaceId = React.useCallback");
    const finalizeIdx = intake.indexOf(
      "const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback",
    );
    expect(ensureIdx).toBeGreaterThan(-1);
    expect(finalizeIdx).toBeGreaterThan(-1);
    const ensureBlock = intake.slice(ensureIdx, ensureIdx + 5000);
    const finalizeEnd = intake.indexOf(
      "finalizePaidProSignerMetadataAndOpenReviewDecisionRef.current",
      finalizeIdx,
    );
    const finalizeBlock = intake.slice(finalizeIdx, finalizeEnd);
    for (const block of [ensureBlock, finalizeBlock]) {
      expect(block).toContain("ensureReviewAgreementWorkspaceId");
      expect(block).not.toMatch(
        /\b(?:nda|msa|sow|saas|collaboration|florida|new york|delaware)\b/i,
      );
      expect(block).not.toMatch(/Alpha LLC|Beacon Inc|Cedar LP|Delta Co|Anthem|PixelForge/i);
      expect(block).not.toMatch(/partyCount\s*===|agreement_family|dealFamily/i);
    }
    expect(ensureBlock).toContain("ensurePaidProReviewSessionAuthorityFromVisibleCorpus");
    expect(finalizeBlock).toContain("ensureReviewAgreementWorkspaceId");
    expect(finalizeBlock).toMatch(/Tap Retry to save/i);
  });

  it("latches session authority from any visible corpus across deal families and 2–4 parties", () => {
    for (const case_ of SPECTRUM) {
      clearPaidProReviewSessionAuthorityForTests();
      const corpus = padCorpus(
        fusedTermNoticesBody({ title: case_.title, amongLine: case_.amongLine }),
      );
      const result = ensurePaidProReviewSessionAuthorityFromVisibleCorpus({
        corpusPlain: corpus,
        source: `spectrum_${case_.family}`,
      });
      expect(result.established, case_.family).toBe(true);
      expect(hasPaidProReviewSessionAuthority(), case_.family).toBe(true);
    }
  });

  it("defuses Agreement12. NOTICES on every spectrum family in display prep", () => {
    for (const case_ of SPECTRUM) {
      const body = fusedTermNoticesBody({ title: case_.title, amongLine: case_.amongLine });
      const bare = repairFusedNoticesHeadingToPriorClause(
        `stated in this Agreement12. NOTICES\n\nAny notice (${case_.family})`,
      );
      expect(bare.text, case_.family).not.toMatch(/Agreement12\.\s*NOTICES/i);
      expect(bare.text, case_.family).toMatch(/12\.\s+NOTICES/i);

      const display = preparePaidProReviewDisplayPlain(body);
      expect(display.text, case_.family).not.toMatch(/Agreement\d+\.\s*NOTICES/i);
      expect(display.text, case_.family).toMatch(/\n\d+\.\s+NOTICES\n/i);
    }
  });

  it("demo seeds yield to arbitrary intake names for 2–4 party slots", () => {
    for (const case_ of SPECTRUM) {
      const identities: SignerSetupPartyIdentity[] = case_.parties.map((name) => ({
        legalEntityName: name,
        displayName: name,
        source: "intake_manifest" as const,
      }));
      const demos = ["ABC LLC", "Sample Corp", "LawDog Demo LLC"];
      for (let i = 0; i < identities.length; i++) {
        const demo = demos[i % demos.length]!;
        expect(isRecipientHandoffSeedDisposable(demo)).toBe(true);
        expect(
          resolveSignerPartyLegalEntityDisplayValue({
            slotIndex: i,
            currentInputValue: demo,
            slotIdentities: identities,
          }),
          `${case_.family} slot ${i}`,
        ).toBe(case_.parties[i]);
      }
    }
  });
});
