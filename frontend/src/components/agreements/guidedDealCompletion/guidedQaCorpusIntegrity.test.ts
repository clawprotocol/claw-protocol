import { describe, expect, it } from "vitest";
import { assertNoBareProSkeletonClauses } from "../proCorpusSkeletonSafety";
import {
  corpusHasPaymentStructureContradictions,
  extractGuidedSemanticFacts,
  reconcileGuidedSemanticCorpus,
} from "./guidedAnswerSemanticMerger";
import { mergeAllGuidedAnswersIntoCorpus } from "./guidedSectionAwareMerge";
import { finalizeGuidedProAgreementCorpus } from "./guidedFinalCorpusFinalizer";
import { resolveGuidedPreReviewSignerSlots } from "./resolveGuidedPreReviewSignerSlots";
import type { CommercialFamilyHint } from "../proAgreementCompleteness/types";
import type { GuidedCompletionSession } from "./types";

const AI_AUTOMATION_INTAKE = `
AI automation services agreement between Acme Automation LLC and Botsmith Services LLC.
Total fee $120,000. Payment 40% build/configuration, 30% rollout/onboarding, 30% support/acceptance.
Optional $6,000/month support. Oklahoma law. 30-day convenience termination.
`.trim();

const MARKETING_INTAKE = `
Marketing services agreement. $18,000 across 3 milestones over 4 months. Texas law. Ad spend approval rights.
`.trim();

const CONSULTING_INTAKE = `
Consulting and support agreement. $4,500 per month, month-to-month. 15-day termination. Delaware law.
`.trim();

function session(
  answered: Record<string, string>,
  family: CommercialFamilyHint = "services_agreement",
): GuidedCompletionSession {
  const ids = Object.keys(answered);
  return {
    sessionKey: "gen:qa",
    queue: ids,
    variables: ids.map((id) => ({
      id,
      category: "compensation" as const,
      label: id,
      question: `Q ${id}?`,
      severity: "important" as const,
      suggestedDefaults: [],
      agreementImpact: "x",
      requiredForExecution: true,
      applicableAgreementFamilies: [family],
      uiControlType: "pills" as const,
      currentValue: null,
      confidence: 0.9,
      affectsSections: [],
    })),
    answered,
    skipped: new Set(),
    currentIndex: ids.length,
    completenessPercent: 100,
    agreementFamily: family,
    frozenTotalQuestions: ids.length,
  };
}

function aiAutomationSession(): GuidedCompletionSession {
  return session({
    payment_timing: "Net 30",
    phase_payment_allocation: "40% build/configuration, 30% rollout/onboarding, 30% support/acceptance",
    project_fee_phase_confirmation: "$120,000 total project fee",
    saas_sla: "99.9% uptime for production automation",
    ip_ownership: "Company owns project deliverables",
    renewal_notice: "30 days written notice",
  });
}

function consultingSession(): GuidedCompletionSession {
  return session({
    payment_structure: "Monthly retainer $4,500 per month",
    monthly_fee: "$4,500 per month",
    renewal_notice: "15 days written notice",
    governing_law: "Delaware",
  });
}

function marketingSession(): GuidedCompletionSession {
  return session({
    payment_timing: "Net 30",
    phase_payment_allocation: "Three milestones over four months — $18,000 total",
    project_fee_phase_confirmation: "$18,000 total",
  });
}

/** Post-Q&A bad corpus: conflicting payment language from legacy merge paths. */
export const AI_AUTOMATION_BAD_POST_QA_CORPUS = `
SERVICES AGREEMENT

1. Services and Scope
Provider will deliver AI automation services.

2. Fees and Payment
Total project fee is $120,000 USD.
Schedule A phase allocation is build-heavy across build, rollout, and support.
Schedule A phase allocation splits fees evenly across build, rollout, and support/acceptance phases (approximately one-third each).
Milestone-based
Invoices are due Net 30 from receipt.
Invoices are due Net 30 from receipt unless a signed change order states otherwise.
Governing law of the State of Oklahoma applies to fees.

3. Confidentiality
Each party protects confidential information.

4. Ownership and Work Product
Company owns deliverables.

5. Support Expectations
Provider targets 99.9% monthly uptime.

6. Term and Termination
Either party may terminate with 30 days written notice.

7. Notices
Notices to addresses on file.

8. Miscellaneous
Governing law of the State of Oklahoma.

IN WITNESS WHEREOF, the parties execute this Agreement.
`.trim();

export const CONSULTING_BAD_POST_QA_CORPUS = `
CONSULTING AGREEMENT

1. Purpose and Scope
Monthly consulting and support.

2. Fees and Payment
Monthly service fee is $4,500 per month.
Milestone-based
Delaware
Invoices are due Net 30 from receipt.
Invoices are due Net 30 from receipt.

3. Confidentiality
Confidentiality terms apply.

4. Ownership
Company owns work product.

5. Term and Termination
Either party may terminate on O days written notice.

6. Notices
Formal notices required.

7. Miscellaneous
Laws of Delaware govern.

IN WITNESS WHEREOF, the parties execute this Agreement.
`.trim();

export const MARKETING_BAD_POST_QA_CORPUS = `
MARKETING SERVICES AGREEMENT

1. Purpose and Scope
Marketing campaign services.

2.1 Deliverables.

2. Fees and Payment
Total fee $18,000 in three milestones.
Contractor represents that it has authority to enter this Agreement.
Contractor represents that it has authority to enter this Agreement.

3. Confidentiality Obligations

4. Ownership
Client owns deliverables.

5.1 Confidentiality Obligations.

6. Term and Termination
Texas law applies here incorrectly in term section.

7. Notices

8. Miscellaneous
Governing law of the State of Texas.

IN WITNESS WHEREOF, the parties execute this Agreement.
`.trim();

function padCorpus(core: string): string {
  return `${core}\n\n${"Supporting operational detail. ".repeat(90)}`;
}

describe("guided Q&A corpus integrity — QA fixtures", () => {
  it("A. AI automation: reconciles 40/30/30 without build-heavy, even thirds, or raw Milestone-based", () => {
    const sem = extractGuidedSemanticFacts(aiAutomationSession(), AI_AUTOMATION_INTAKE);
    expect(sem.milestoneSplit).toBe("40_30_30");
    const merged = mergeAllGuidedAnswersIntoCorpus(padCorpus(AI_AUTOMATION_BAD_POST_QA_CORPUS), aiAutomationSession());
    const reconciled = reconcileGuidedSemanticCorpus(merged.body, sem, AI_AUTOMATION_INTAKE);
    const body = reconciled.text;

    expect(body).toMatch(/40\s*%/i);
    expect(body).not.toMatch(/\bbuild-heavy\b/i);
    expect(body).not.toMatch(/\beven\s+thirds\b/i);
    expect(body).not.toMatch(/^\s*Milestone-based\s*$/im);
    expect(corpusHasPaymentStructureContradictions(body, sem)).toEqual([]);
    const net30Count = (body.match(/Invoices are due Net 30/gi) ?? []).length;
    expect(net30Count).toBeLessThanOrEqual(1);
  });

  it("B. Consulting monthly: no milestones, Delaware only in governing section, fixes O days", () => {
    const sem = extractGuidedSemanticFacts(consultingSession(), CONSULTING_INTAKE);
    expect(sem.paymentMode).toBe("monthly_retainer");
    expect(sem.terminationDays).toBe(15);
    const reconciled = reconcileGuidedSemanticCorpus(
      padCorpus(CONSULTING_BAD_POST_QA_CORPUS),
      sem,
      CONSULTING_INTAKE,
    );
    const body = reconciled.text;

    expect(body).toMatch(/\$4,?500/i);
    expect(body).not.toMatch(/^\s*Milestone-based\s*$/im);
    expect(body).not.toMatch(/\bO\s+days\b/i);
    expect(body).toMatch(/15\s+days?\s+written\s+notice/i);
    const feesSection = body.match(/2\.\s+Fees[\s\S]*?(?=^\s*3\.\s)/im)?.[0] ?? "";
    expect(feesSection).not.toMatch(/\bDelaware\b/i);
    expect(body).toMatch(/Delaware/i);
    expect(corpusHasPaymentStructureContradictions(body, sem)).toEqual([]);
  });

  it("C. Marketing: strips bare subsection headings and duplicate contractor boilerplate", () => {
    const sem = extractGuidedSemanticFacts(marketingSession(), MARKETING_INTAKE);
    const reconciled = reconcileGuidedSemanticCorpus(
      padCorpus(MARKETING_BAD_POST_QA_CORPUS),
      sem,
      MARKETING_INTAKE,
    );
    const body = reconciled.text;

    expect(body).not.toMatch(/^\s*2\.1\s+Deliverables\.\s*$/im);
    expect(body).not.toMatch(/^\s*5\.1\s+Confidentiality Obligations\.\s*$/im);
    const contractorLines = body.match(/Contractor represents that it has authority/gi) ?? [];
    expect(contractorLines.length).toBeLessThanOrEqual(1);
    assertNoBareProSkeletonClauses(body);
  });

  it("finalizer applies semantic reconcile on AI automation bad corpus", () => {
    const result = finalizeGuidedProAgreementCorpus({
      candidates: [{ source: "hydrated_premium", body: padCorpus(AI_AUTOMATION_BAD_POST_QA_CORPUS), paid: true }],
      guidedSession: aiAutomationSession(),
      signerIdentities: [],
      signerManifest: null,
      originalIntake: AI_AUTOMATION_INTAKE,
    });
    expect(result.body.length).toBeGreaterThan(500);
    expect(result.body).not.toMatch(/\bbuild-heavy\b/i);
    expect(result.body).not.toMatch(/^\s*Milestone-based\s*$/im);
  });
});

describe("guided signer setup — marketing progression", () => {
  it("blocks when party 2 email field contains a person name instead of email", () => {
    const r = resolveGuidedPreReviewSignerSlots({
      partyCount: 2,
      partySignerNames: ["", "Jane Marketing"],
      recipient1Name: "Agency LLC",
      recipient2Name: "Client Brand Co",
      recipient1Email: "legal@agency.test",
      recipient2Email: "Jane Marketing",
      extraPartyReviewEmails: [],
      draftPartyNames: ["Agency LLC", "Client Brand Co"],
      sendMode: "review",
      recipientsDeferred: false,
    });
    expect(r.complete).toBe(false);
    expect(r.blockers.some((b) => b.reason === "name_in_email_field")).toBe(true);
    expect(r.blockerMessage).toMatch(/valid email/i);
  });

  it("allows Continue to final review when valid emails are provided", () => {
    const r = resolveGuidedPreReviewSignerSlots({
      partyCount: 2,
      partySignerNames: ["", "Jane Marketing"],
      recipient1Name: "Agency LLC",
      recipient2Name: "Client Brand Co",
      recipient1Email: "legal@agency.test",
      recipient2Email: "jane@clientbrand.test",
      extraPartyReviewEmails: [],
      draftPartyNames: ["Agency LLC", "Client Brand Co"],
      sendMode: "review",
      recipientsDeferred: false,
    });
    expect(r.complete).toBe(true);
    expect(r.blockerMessage).toBe("");
  });
});
