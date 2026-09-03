/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import {
  evaluatePremiumRefineCandidate,
  premiumRefineBaselineIsResolvedNamedCorpus,
  restorePremiumRefinePlaceholdersFromResolvedBaseline,
} from "./premiumRefineAcceptance";
import { resolvePremiumRefineApplyOutcome } from "./premiumRefineLateFeeFallback";
import {
  applyDeterministicSurgicalRevisionFallback,
  parseQuotedSentenceInsertInstruction,
} from "./premiumRefineDeterministicSurgicalFallback";
import {
  invalidatePaidProDisplayCachesAfterSuccessfulRefine,
  shouldPersistPaidProRefineToDisplayAuthority,
} from "./paidProAskLawDogForcedFirstReview";
import { establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  storeVerifiedCommercialDisplayCorpus,
  sha256CorpusDigest,
  readVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";

const AGREEMENT_ID = "4e18814c-c8fe-4eb9-85ae-a3e694cb596e";
const CERT_MARKER =
  "CERT_AI_REVISE_MARKER_POST175_0902T1958 — Notices for this agreement may also be delivered by confirmed electronic mail to the addresses on file.";
const CERT_INSTR = `In the Notices section, add this exact sentence as its own short paragraph (do not remove existing text): "${CERT_MARKER}" Keep all other sections unchanged.`;

function namedBaseline(): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(80);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    'This Agreement is entered into as of the Effective Date by and between Cedar Peak Advisors LLC ("Client") and Blue Harbor Logistics LLC ("Service Provider").',
    "1. SCOPE OF SERVICES",
    "1.1 Blue Harbor Logistics LLC shall deliver consulting and implementation services.",
    "2. PAYMENT",
    "2.1 Cedar Peak Advisors LLC shall pay invoices within thirty days.",
    "8. NOTICES",
    "8.1 Notices shall be delivered as set forth herein.",
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Cedar Peak Advisors LLC",
    "SERVICE PROVIDER:",
    "Blue Harbor Logistics LLC",
  ].join("\n\n");
}

function hollowStarter(): string {
  const pad = "Scope operational paragraph with mutual obligations for the applicable parties. ".repeat(40);
  return [
    "SERVICES AGREEMENT",
    'This Agreement is between [ORG_1] ("Client") and [ORG_2] ("Service Provider").',
    "1. SCOPE OF SERVICES",
    "[ORG_2] shall perform the services.",
    "2. PAYMENT",
    "[ORG_1] shall pay [ORG_2].",
    pad,
  ].join("\n\n");
}

describe("premium refine resolved-party restore", () => {
  it("treats Cedar Peak / Blue Harbor corpus as resolved", () => {
    expect(premiumRefineBaselineIsResolvedNamedCorpus(namedBaseline())).toBe(true);
    expect(premiumRefineBaselineIsResolvedNamedCorpus(hollowStarter())).toBe(false);
  });

  it("restores [ORG_1]/[ORG_2] when prior corpus had real org names", () => {
    const base = namedBaseline();
    const remint = base
      .replace(/Cedar Peak Advisors LLC/g, "[ORG_1]")
      .replace(/Blue Harbor Logistics LLC/g, "[ORG_2]");
    const out = restorePremiumRefinePlaceholdersFromResolvedBaseline(remint, base);
    expect(out.restored).toBe(true);
    expect(out.text).toContain("Cedar Peak Advisors LLC");
    expect(out.text).toContain("Blue Harbor Logistics LLC");
    expect(out.text).not.toMatch(/\[ORG_1\]|\[ORG_2\]/);
  });

  it("does not invent names for a hollow placeholder-only starter", () => {
    const hollow = hollowStarter();
    const out = restorePremiumRefinePlaceholdersFromResolvedBaseline(hollow, hollow);
    expect(out.restored).toBe(false);
    expect(out.text).toContain("[ORG_1]");
    expect(out.text).toContain("[ORG_2]");
    const drifted = `${hollow}\n\nAdded a hollow-line revision.\n`;
    const acc = evaluatePremiumRefineCandidate(drifted, hollow, hollow.length, undefined, "Add a notice sentence.");
    expect(acc.decision).toBe("rejected_short");
  });

  it("evaluate still rejects a remint that keeps [ORG_n] against a named baseline", () => {
    const base = namedBaseline();
    const remint = base.replace(/Cedar Peak Advisors LLC/g, "[ORG_1]").replace(
      /Blue Harbor Logistics LLC/g,
      "[ORG_2]",
    );
    const raw = evaluatePremiumRefineCandidate(remint, base, base.length, undefined, CERT_INSTR);
    expect(raw.decision).toBe("rejected_short");
  });

  it("clean surgical refine without new placeholders is accepted", () => {
    const base = namedBaseline();
    const clean = `${base}\n\n${CERT_MARKER}\n`;
    const acc = evaluatePremiumRefineCandidate(clean, base, base.length, undefined, CERT_INSTR);
    expect(acc.decision).toBe("accepted");
    expect(acc.revisionIntent).toBe("surgical_revision");
  });
});

describe("quoted-sentence surgical insert + apply outcome", () => {
  it("parses the live Notices marker instruction", () => {
    const p = parseQuotedSentenceInsertInstruction(CERT_INSTR);
    expect(p?.sentence).toBe(CERT_MARKER);
    expect(p?.section?.toLowerCase()).toBe("notices");
  });

  it("inserts the marker into Notices and keeps party names", () => {
    const base = namedBaseline();
    const surg = applyDeterministicSurgicalRevisionFallback({
      currentDocumentText: base,
      userInstruction: CERT_INSTR,
    });
    expect(surg.applied).toBe(true);
    expect(surg.reason).toBe("quoted_sentence_insert");
    expect(surg.text).toContain(CERT_MARKER);
    expect(surg.text.indexOf("8. NOTICES")).toBeLessThan(surg.text.indexOf(CERT_MARKER));
    expect(surg.text.indexOf(CERT_MARKER)).toBeLessThan(surg.text.indexOf("IN WITNESS WHEREOF"));
    expect(surg.text).toContain("Cedar Peak Advisors LLC");
    expect(surg.text).toContain("Blue Harbor Logistics LLC");
    expect(surg.text).not.toMatch(/\[ORG_[12]\]/);
  });

  it("resolves a placeholder remint via restore or quoted insert and reaches accept", () => {
    const base = namedBaseline();
    const remint = base
      .replace(/Cedar Peak Advisors LLC/g, "[ORG_1]")
      .replace(/Blue Harbor Logistics LLC/g, "[ORG_2]");
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: remint,
      baselineText: base,
      baselineLen: base.length,
      summaryChanges: ["Rewrote parties"],
      userInstruction: CERT_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("accepted");
    expect(resolved.finalText).toContain(CERT_MARKER);
    expect(resolved.finalText).toContain("Cedar Peak Advisors LLC");
    expect(resolved.finalText).toContain("Blue Harbor Logistics LLC");
    expect(resolved.finalText).not.toMatch(/\[ORG_[12]\]/);
  });

  it("keeps hollow starter rejected (no CRS-ready accept)", () => {
    const hollow = hollowStarter();
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: hollow,
      baselineText: hollow,
      baselineLen: hollow.length,
      summaryChanges: ["No change"],
      userInstruction: CERT_INSTR,
    });
    expect(resolved.acceptance.decision).not.toBe("accepted");
    expect(resolved.finalText).toMatch(/\[ORG_1\]/);
    expect(resolved.finalText).toMatch(/\[ORG_2\]/);
  });
});

describe("forced-shell CRS commit hooks after clean accept", () => {
  it("accepted surgical body is the corpus persisted by forced-review display hooks", async () => {
    const base = namedBaseline();
    const resolved = resolvePremiumRefineApplyOutcome({
      apiOut: base.replace(/Cedar Peak Advisors LLC/g, "[ORG_1]").replace(
        /Blue Harbor Logistics LLC/g,
        "[ORG_2]",
      ),
      baselineText: base,
      baselineLen: base.length,
      summaryChanges: ["Added notices sentence"],
      userInstruction: CERT_INSTR,
    });
    expect(resolved.acceptance.decision).toBe("accepted");
    expect(
      shouldPersistPaidProRefineToDisplayAuthority({
        guidedBulkActive: false,
        agreementId: AGREEMENT_ID,
      }),
    ).toBe(true);

    invalidatePaidProDisplayCachesAfterSuccessfulRefine();
    const committed = resolved.finalText.trim();
    establishPaidProSourceOfTruth({
      text: committed,
      source: "server_full_draft",
      allowShorterOverwrite: true,
    });
    const sha = await sha256CorpusDigest(committed);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: "crs_after_placeholder_restore",
      corpusSha256: sha,
      corpusLength: committed.length,
      status: "pending",
      corpusPlain: committed,
    });
    const after = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
      acceptedCanonicalPlain: committed,
    });
    expect(after.plain).toContain(CERT_MARKER);
    expect(after.plain).toContain("Cedar Peak Advisors LLC");
    expect(after.plain).not.toMatch(/\[ORG_1\]/);
    expect(readVerifiedCommercialDisplayCorpus(AGREEMENT_ID)?.snapshotId).toBe(
      "crs_after_placeholder_restore",
    );
  });
});
