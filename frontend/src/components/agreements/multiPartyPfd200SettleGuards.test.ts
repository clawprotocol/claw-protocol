/**
 * After BE #195, entitled Pro N≥3 premium-full-draft returns 200 with a usable
 * ~15k commercial corpus. FE placeholder / signer-count guards must settle
 * Review — not fail-close on signature/notice stubs or leftover 2-party prep.
 */
import { describe, expect, it } from "vitest";
import {
  finalizeUserVisibleAgreementPlainText,
  PAID_PRO_SIGNATURE_ACCEPT_MIN_BODY_LEN,
} from "./agreementTemplatePlaceholderSafety";
import { rejectPremiumBodyForProRender } from "./premiumFullDraftClientAcceptance";
import {
  assertPaidProFreezeCandidateManifestCountAgreement,
  commercialCorpusCarriesIntakeManifestParties,
  resolveAuthoritativeIntakeManifestCount,
  type PaidProFreezeCandidatePrepResult,
} from "./paidProFreezeCandidate";
import { mergePartyPrepIntoCreateSubmitText } from "./multiPartyCreateReviewSettle";
import {
  shouldFailCloseCreateAfterPremiumFullDraft,
  shouldSettleProReviewAfterPremiumFullDraft,
} from "./multiPartyCreateReviewSettle";
import { shouldTreatEntitledRewritePipelineResultAsGenerationFailure } from "./paidProEntitledRewriteLaunch";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN } from "./simpleProFinalReviewCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import type { CanonicalAgreementSnapshotParty } from "./canonicalAgreementSnapshot";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";

const THREE_PARTY_DUMP = "Three-party services agreement for $24,000. Governing law: Texas.";
const FOUR_PARTY_DUMP =
  "Need a four-party collaboration agreement for $80k over 12 months covering shared platform ops.";
const THREE_NAMES = ["Cedar Ridge LLC", "Harbor Point Inc", "Summit Mesa LP"] as const;
const FOUR_NAMES = ["North Wind LLC", "East Dock Inc", "South Pier LP", "West Gate Corp"] as const;
const TWO_PARTY_INTAKE =
  "Consulting agreement between Acme LLC and Beta Corp. Payment: $5,000 per month. Term: 12 months. California law governs.";
const TWO_NAMES = ["Acme LLC", "Beta Corp"] as const;

function padOperative(targetLen: number, already: string): string {
  const clause =
    "The parties shall perform their commercial obligations in good faith, keep accurate records, and cooperate on deliverables, reporting, and milestone acceptance. ";
  let t = already;
  while (t.length < targetLen) t += clause;
  return t.slice(0, targetLen);
}

/** Live-shaped ~15k salvaged multiparty corpus (under the old 18k demotion floor). */
function buildUsableMultipartyCommercialCorpus(names: readonly string[], targetLen = 15_381): string {
  const among = names.join(", ");
  const notices = names
    .map((n) => `If to ${n}:\nEmail: [EMAIL]\nAddress: provided during signer setup\n`)
    .join("\n");
  const signatures = names
    .map(
      (n) =>
        `${n}\nBy: [SIGNATURE]\nName: [NAME]\nTitle: [TITLE]\nDate: [DATE]\nEmail: [EMAIL]\n`,
    )
    .join("\n");
  const head = [
    "MULTI-PARTY SERVICES AGREEMENT",
    "",
    `This Agreement is entered into by and among ${among}.`,
    "",
    "1. SCOPE OF SERVICES",
    "The parties shall perform the professional services described in this Agreement for the fees stated herein.",
    "2. PAYMENT",
    "Fees total the amount stated in the intake and are payable in monthly installments.",
    "3. TERM",
    "The term begins on the Effective Date and continues for the stated duration unless earlier terminated.",
    "4. CONFIDENTIALITY",
    "Each party shall protect the others' confidential information using reasonable care.",
    "5. INTELLECTUAL PROPERTY",
    "Work product is assigned as set forth in this Agreement after payment of undisputed amounts.",
    "6. INDEMNIFICATION",
    "Each party shall indemnify the others against third-party claims arising from its material breach.",
    "7. LIMITATION OF LIABILITY",
    "No party is liable for indirect or consequential damages except for confidentiality or IP breach.",
    "8. GOVERNING LAW",
    "This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-law rules.",
    "9. NOTICES",
    "Notices under this Agreement must be in writing.",
    notices,
    "10. GENERAL",
    "This Agreement constitutes the entire agreement among the parties.",
    "",
  ].join("\n");
  const tail = ["", "IN WITNESS WHEREOF, the parties have executed this Agreement.", "", signatures].join("\n");
  const midBudget = Math.max(8_500, Math.min(targetLen, 17_800) - tail.length);
  const mid = padOperative(midBudget, head);
  return `${mid}${tail}`;
}

function threePartyIntake(): string {
  return mergePartyPrepIntoCreateSubmitText(THREE_PARTY_DUMP, [...THREE_NAMES]);
}

function fourPartyIntake(): string {
  return mergePartyPrepIntoCreateSubmitText(FOUR_PARTY_DUMP, [...FOUR_NAMES]);
}

function leftoverTwoPartyDraft(names: readonly string[] = ["Redwood LLC", "BlueHarbor Inc"]): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: names.map((name) => ({ name, role: "party" })),
    purpose: "Services",
    payment_terms: "$24,000",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 24000, cadence: "monthly", valid: true },
  };
}

function makePrep(names: readonly string[], corpus: string): PaidProFreezeCandidatePrepResult {
  const reviewParties: PaidProSignerMetadataParty[] = names.map((name, i) => ({
    partyIndex: i,
    partyLegalName: name,
    signerEmail: "",
    signerName: "",
    signerTitle: "",
    partyAddress: "",
  }));
  const parties: CanonicalAgreementSnapshotParty[] = names.map((name) => ({
    name,
    role: null,
    email: null,
    partyAddress: null,
  }));
  return {
    text: corpus,
    hash: "0:test",
    reviewParties,
    parties,
    repairs: [],
  };
}

describe("multiparty premium-full-draft 200 settle guards", () => {
  it("demotion floor covers salvaged ~15k corpora (below the old 18k cutoff)", () => {
    expect(PAID_PRO_SIGNATURE_ACCEPT_MIN_BODY_LEN).toBeLessThanOrEqual(8_500);
    const three = buildUsableMultipartyCommercialCorpus(THREE_NAMES);
    const four = buildUsableMultipartyCommercialCorpus(FOUR_NAMES);
    expect(three.length).toBeGreaterThan(15_000);
    expect(three.length).toBeLessThan(18_000);
    expect(four.length).toBeGreaterThan(15_000);
    expect(four.length).toBeLessThan(18_000);
  });

  it("N=3 ~15k 200 corpus does not fire placeholder-reject and settles Review", () => {
    const intake = threePartyIntake();
    const corpus = buildUsableMultipartyCommercialCorpus(THREE_NAMES);
    expect(corpus).toMatch(/\[EMAIL\]/);
    expect(corpus).toMatch(/\[NAME\]/);
    expect(corpus.length).toBeGreaterThan(GUIDED_FINAL_REVIEW_MIN_CORPUS_LEN);

    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: intake,
      partyNames: [...THREE_NAMES],
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);
    expect(fin.remainingFatal).toHaveLength(0);

    const acc = rejectPremiumBodyForProRender(corpus, {
      intakeText: intake,
      partyNames: [...THREE_NAMES],
    });
    expect(acc.ok, acc.reasons.join("|")).toBe(true);
    expect(acc.reasons.some((r) => r.startsWith("placeholder:"))).toBe(false);

    const settle = {
      winningPremiumBodyText: corpus,
      premiumRenderSource: "server_full_draft" as const,
      staleIntakeOrGeneration: false,
    };
    expect(shouldSettleProReviewAfterPremiumFullDraft(settle)).toBe(true);
    expect(shouldFailCloseCreateAfterPremiumFullDraft(settle)).toBe(false);
    expect(
      shouldTreatEntitledRewritePipelineResultAsGenerationFailure({
        premiumDraft: leftoverTwoPartyDraft(),
        premiumParties: [],
        recipientCandidates: [],
        winningPremiumBodyText: corpus,
        premiumRenderSource: "server_full_draft",
        premiumReview: null,
        premiumFinalizeAudit: null,
        premiumReviewRoute: null,
        staleIntakeOrGeneration: false,
        premiumGenerationRetryable: true,
      }),
    ).toBe(false);
  });

  it("N=4 ~15k 200 corpus does not fire placeholder-reject or signer-count mismatch", () => {
    const intake = fourPartyIntake();
    const corpus = buildUsableMultipartyCommercialCorpus(FOUR_NAMES);
    expect(resolveAuthoritativeIntakeManifestCount(intake)).toBe(4);

    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: intake,
      partyNames: [...FOUR_NAMES],
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);

    const acc = rejectPremiumBodyForProRender(corpus, {
      intakeText: intake,
      partyNames: [...FOUR_NAMES],
    });
    expect(acc.ok, acc.reasons.join("|")).toBe(true);

    expect(commercialCorpusCarriesIntakeManifestParties(corpus, intake, 4)).toBe(true);
    const leftoverPrep = makePrep(["Redwood LLC", "BlueHarbor Inc"], corpus);
    expect(() =>
      assertPaidProFreezeCandidateManifestCountAgreement(leftoverPrep, {
        text: corpus,
        intakeText: intake,
        draft: leftoverTwoPartyDraft(),
      }),
    ).not.toThrow();

    const authority = resolveAuthoritativeSignerCount({
      intakeText: intake,
      draftPartyNames: leftoverTwoPartyDraft().parties.map((p) => p.name),
      corpusPlain: corpus,
      manifestPartyCount: 4,
    });
    expect(authority.count).toBe(4);

    const settle = {
      winningPremiumBodyText: corpus,
      premiumRenderSource: "server_full_draft" as const,
      staleIntakeOrGeneration: false,
    };
    expect(shouldSettleProReviewAfterPremiumFullDraft(settle)).toBe(true);
    expect(shouldFailCloseCreateAfterPremiumFullDraft(settle)).toBe(false);
  });

  it("hollow / junk insert stubs still fail-closed", () => {
    const intake = threePartyIntake();
    const junk = [
      "AGREEMENT",
      `Among ${THREE_NAMES.join(", ")}.`,
      "Fees are [INSERT PAYMENT TERMS HERE] and notice at [INSERT ADDRESS].",
      "{{party_name}} shall perform.",
      "x".repeat(200),
    ].join("\n");
    const fin = finalizeUserVisibleAgreementPlainText(junk, {
      intakeRaw: intake,
      partyNames: [...THREE_NAMES],
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok).toBe(false);
    expect(fin.remainingFatal.length).toBeGreaterThan(0);
    const acc = rejectPremiumBodyForProRender(junk, {
      intakeText: intake,
      partyNames: [...THREE_NAMES],
    });
    expect(acc.ok).toBe(false);
    expect(shouldSettleProReviewAfterPremiumFullDraft({
      winningPremiumBodyText: junk,
      premiumRenderSource: "server_full_draft",
    })).toBe(false);
  });

  it("short stub missing declared parties still mismatches (no false open)", () => {
    const intake = fourPartyIntake();
    expect(resolveAuthoritativeIntakeManifestCount(intake)).toBe(4);
    const stub = "PLACEHOLDER CORPUS";
    expect(commercialCorpusCarriesIntakeManifestParties(stub, intake, 4)).toBe(false);
    expect(() =>
      assertPaidProFreezeCandidateManifestCountAgreement(makePrep(["Redwood LLC", "BlueHarbor Inc"], stub), {
        text: stub,
        intakeText: intake,
        draft: leftoverTwoPartyDraft(),
      }),
    ).toThrow(/authority_party_count_mismatch/);
  });

  it("two-party named intake is unchanged", () => {
    const corpus = buildUsableMultipartyCommercialCorpus(TWO_NAMES, 16_000);
    const fin = finalizeUserVisibleAgreementPlainText(corpus, {
      intakeRaw: TWO_PARTY_INTAKE,
      partyNames: [...TWO_NAMES],
      surface: "premium_completion_pipeline",
    });
    expect(fin.ok, fin.remainingFatal.join("|")).toBe(true);

    const acc = rejectPremiumBodyForProRender(corpus, {
      intakeText: TWO_PARTY_INTAKE,
      partyNames: [...TWO_NAMES],
    });
    expect(acc.ok, acc.reasons.join("|")).toBe(true);

    expect(resolveAuthoritativeIntakeManifestCount(TWO_PARTY_INTAKE)).toBe(0);
    expect(() =>
      assertPaidProFreezeCandidateManifestCountAgreement(makePrep([...TWO_NAMES], corpus), {
        text: corpus,
        intakeText: TWO_PARTY_INTAKE,
        draft: leftoverTwoPartyDraft([...TWO_NAMES]),
      }),
    ).not.toThrow();

    const authority = resolveAuthoritativeSignerCount({
      intakeText: TWO_PARTY_INTAKE,
      draftPartyNames: [...TWO_NAMES],
      corpusPlain: corpus,
    });
    expect(authority.count).toBe(2);

    expect(
      shouldSettleProReviewAfterPremiumFullDraft({
        winningPremiumBodyText: corpus,
        premiumRenderSource: "server_full_draft",
      }),
    ).toBe(true);
  });
});
