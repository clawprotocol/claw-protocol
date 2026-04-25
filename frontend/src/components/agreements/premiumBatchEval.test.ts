import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { detectAgreementFamily } from "./agreementFamilyRouter";
import { extractIntakePayment } from "./intakeCurrencyParse";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import { getPremiumDualTrackStats, resetPremiumDualTrackStats, runPremiumCompletion } from "./premiumCompletionPipeline";

type PromptCase = {
  id: string;
  prompt: string;
  expectedType: "consulting" | "services" | "referral" | "contractor" | "nda";
  requestedSignals: string[];
};

const CASES: PromptCase[] = [
  { id: "p01", prompt: "Need marketing growth deal: $4,000 monthly + 8% commission on closed deals, clawback 45 days, CRM leads ours, Phoenix exclusivity if 10 SQL/mo, ad claims pre-approval, noncircumvent, nonsolicit, 12 month auto-renew, terminate for fraud, reimburse preapproved travel, arbitration AZ.", expectedType: "services", requestedSignals: ["commission","clawback","ownership","exclusivity","compliance","noncircumvent","nonsolicit","renewal","termination","reimbursement","dispute"] },
  { id: "p02", prompt: "Independent contractor videographer retainer 2500/mo plus bonus per booked wedding, client owns edits, reimbursement for mileage preapproved, 6 month term, 30 day termination notice.", expectedType: "contractor", requestedSignals: ["ownership","reimbursement","termination"] },
  { id: "p03", prompt: "Mutual NDA between startup and agency, no service scope, just confidential product roadmap sharing, injunctive relief, Delaware law.", expectedType: "nda", requestedSignals: ["confidentiality","dispute"] },
  { id: "p04", prompt: "Business development referral agreement: 10% commission on net receipts for introduced accounts, non-circumvent for 18 months, payout monthly net-15, chargeback offsets.", expectedType: "referral", requestedSignals: ["commission","noncircumvent","clawback"] },
  { id: "p05", prompt: "Consulting advisor for SaaS GTM: 6000 monthly plus 5% expansion revenue, exclusivity in fintech segment if quota hit, compliance approval on outbound claims, customer data ownership stays with client.", expectedType: "consulting", requestedSignals: ["commission","exclusivity","compliance","ownership"] },
  { id: "p06", prompt: "Pool company growth partner messy prompt: 6500 monthly + 12% after deposit clears, clawback 30 days cancel, CRM/ad accounts ours, no misleading claims, noncircumvent + nonsolicit, auto renew yearly, terminate immediately for fraud/brand harm, arbitration Arizona.", expectedType: "services", requestedSignals: ["commission","clawback","ownership","compliance","noncircumvent","nonsolicit","renewal","termination","dispute"] },
  { id: "p07", prompt: "Cleaning services contract for office: flat 2200 monthly, reimburse supplies only if preapproved, term 1 year, renew monthly after.", expectedType: "services", requestedSignals: ["reimbursement","renewal"] },
  { id: "p08", prompt: "Contractor developer agreement: milestone fees, IP assignment to client, confidentiality, non-solicit employees 12 months post term.", expectedType: "contractor", requestedSignals: ["ownership","confidentiality","nonsolicit"] },
  { id: "p09", prompt: "Lead gen partner: commission 15% on collected revenue, clawback for refunds first 60 days, territory exclusivity Dallas if 20 MQL/mo for 2 months.", expectedType: "referral", requestedSignals: ["commission","clawback","exclusivity"] },
  { id: "p10", prompt: "Agency services agreement with pharma ad compliance approvals required, no unapproved efficacy claims, client owns all campaign data and creative deliverables.", expectedType: "services", requestedSignals: ["compliance","ownership"] },
  { id: "p11", prompt: "Simple NDA and mutual confidentiality only, no fees.", expectedType: "nda", requestedSignals: ["confidentiality"] },
  { id: "p12", prompt: "Sales consultant retainer + commission and reimbursements, terminate for repeated bad leads, dispute arbitration NY.", expectedType: "consulting", requestedSignals: ["commission","reimbursement","termination","dispute"] },
  { id: "p13", prompt: "Influencer management deal, revenue split, chargeback clawback, content ownership by brand, FTC disclosures required, exclusivity by vertical.", expectedType: "services", requestedSignals: ["commission","clawback","ownership","compliance","exclusivity"] },
  { id: "p14", prompt: "B2B referral channel partner with anti-bypass, anti-solicit of team, payout true-up monthly, disputes under JAMS California.", expectedType: "referral", requestedSignals: ["noncircumvent","nonsolicit","dispute"] },
  { id: "p15", prompt: "Freelance copywriter contract, monthly fee, NDA, client approval before publishing any claims, immediate termination for criminal conduct.", expectedType: "contractor", requestedSignals: ["confidentiality","compliance","termination"] },
  { id: "p16", prompt: "Marketing services for roofing leads; leads in CRM remain client property; exclusivity in county if minimum 12 qualified leads/mo; reimburse approved ad spend pass-through.", expectedType: "services", requestedSignals: ["ownership","exclusivity","reimbursement"] },
  { id: "p17", prompt: "Consulting agreement with 9 month initial term and automatic 3 month renewals unless 45-day non-renewal notice.", expectedType: "consulting", requestedSignals: ["renewal","termination"] },
  { id: "p18", prompt: "Strategic advisor receives 7% of closed enterprise deals and $3k monthly base; commission only after invoice paid.", expectedType: "consulting", requestedSignals: ["commission"] },
  { id: "p19", prompt: "Two-party confidentiality and invention assignment for pre-launch collaboration.", expectedType: "nda", requestedSignals: ["confidentiality","ownership"] },
  { id: "p20", prompt: "Business dev rep agreement: no circumvention of introduced accounts for 24 months; no solicitation of staff; fee clawback on cancellations.", expectedType: "referral", requestedSignals: ["noncircumvent","nonsolicit","clawback"] },
  { id: "p21", prompt: "Outdoor living installer + media partner deal, 5k retainer, 10% closed project commission, Phoenix territory exclusivity with performance gates, arbitration Delaware.", expectedType: "services", requestedSignals: ["commission","exclusivity","dispute"] },
  { id: "p22", prompt: "Independent contractor social media manager, ad account ownership client side, pre-approval required, reimbursement for approved software tools.", expectedType: "contractor", requestedSignals: ["ownership","compliance","reimbursement"] },
  { id: "p23", prompt: "Mutual NDA with non-solicit and non-circumvent tied to acquisition talks.", expectedType: "nda", requestedSignals: ["confidentiality","nonsolicit","noncircumvent"] },
  { id: "p24", prompt: "Referral + marketing hybrid: monthly management fee + commission, refund clawback, immediate cause termination for fraud or reputational harm.", expectedType: "services", requestedSignals: ["commission","clawback","termination"] },
  { id: "p25", prompt: "Consulting growth ops with dispute arbitration Arizona or Delaware, twelve month term auto renew, termination for repeated KPI misses.", expectedType: "consulting", requestedSignals: ["dispute","renewal","termination"] },
];

const SIGNAL_PATTERNS: Record<string, RegExp> = {
  commission: /\bcommission|%\s*(?:of\s+)?(?:sales|revenue|net|gross)\b/i,
  clawback: /\bclawback|chargeback|refund|reversal\b/i,
  ownership: /\bownership|own(?:ed|s)?|lead|crm|data|work\s+product|intellectual\s+property\b/i,
  compliance: /\bcompliance|approval|misleading|ftc|claims?\b/i,
  exclusivity: /\bexclusive|exclusivity|territory|qualified\s+leads?\b/i,
  nonsolicit: /\bnon[-\s]?solicit\b/i,
  noncircumvent: /\bnon[-\s]?circumvent|anti[-\s]?bypass|bypass\b/i,
  renewal: /\bauto[-\s]?renew|renewal|non[-\s]?renew|initial\s+term\b/i,
  reimbursement: /\breimburs|pre-?approved\s+expenses?\b/i,
  termination: /\btermination|terminate|for\s+cause|fraud|criminal|brand\s+harm\b/i,
  dispute: /\bdispute|arbitrat|jams|aaa|governing\s+law|jurisdiction\b/i,
  confidentiality: /\bconfidential|non[-\s]?disclosure|nda\b/i,
};

function isSparseCase(c: PromptCase): boolean {
  return c.prompt.trim().length < 170 || c.requestedSignals.length <= 3;
}

function buildStarterDraft(prompt: string): ParsedDraftShape {
  const structured = parseIntakeToStructuredAgreement(prompt);
  const family = detectAgreementFamily(prompt);
  const titleByFamily: Record<string, string> = {
    nda: "Confidentiality Agreement",
    confidentiality_commercial_protections_agreement: "Confidentiality and Commercial Protections Agreement",
    consulting_agreement: "Consulting Agreement",
    services_agreement: "Services Agreement",
    independent_contractor_agreement: "Independent Contractor Agreement",
    operating_agreement: "Operating Agreement",
    generic_business_agreement: "Business Agreement",
  };
  return {
    title: titleByFamily[family] || "Agreement",
    jurisdiction: structured.governing_law || "Delaware",
    parties:
      structured.parties.length >= 2
        ? [
            { name: structured.parties[0], role: "party" },
            { name: structured.parties[1], role: "party" },
          ]
        : [
            { name: "Party A", role: "party" },
            { name: "Party B", role: "party" },
          ],
    purpose: structured.scope || "Services.",
    payment_terms: structured.payment || "To be agreed.",
    duration: structured.term || null,
    due_date: null,
    effective_date: null,
    payment: extractIntakePayment(prompt),
    termination_summary: structured.termination || null,
    additional_terms: structured.confidentiality || null,
    agreement_family: family,
  };
}

function typeOk(title: string, expected: PromptCase["expectedType"]): boolean {
  const t = title.toLowerCase();
  if (expected === "nda") return /nda|confidential|non[-\s]?disclosure/.test(t);
  if (expected === "contractor") return /contractor|independent/.test(t);
  if (expected === "consulting") return /consulting|services|business|marketing/.test(t);
  if (expected === "services") return /services|marketing|business|consulting/.test(t);
  if (expected === "referral") return /referral|business development|services|consulting|marketing/.test(t);
  return false;
}

describe("premium batch eval 25 messy prompts", () => {
  it("scores and prints weakest 5", async () => {
    resetPremiumDualTrackStats();
    const rows: Array<Record<string, unknown>> = [];
    for (const c of CASES) {
      const starter = buildStarterDraft(c.prompt);
      const freeText = buildAgreementPreviewText(starter, { starterPreview: true });
      const premium = await runPremiumCompletion({
        intakeText: c.prompt,
        originalUserIntakeRawForMerge: c.prompt,
        structuredDraft: starter,
        simpleProductFlow: true,
        partyRoleLabels: defaultIntakePartyRoleLabels(),
        parseDraft: async () => ({ ...starter }),
      });
      const premiumText = buildAgreementPreviewText(premium.premiumDraft, { starterPreview: false, premiumDeliverablePreview: true });
      const correctType = typeOk(premium.premiumDraft.title, c.expectedType);
      let protectionsAdded = 0;
      const missing: string[] = [];
      for (const sig of c.requestedSignals) {
        const re = SIGNAL_PATTERNS[sig];
        const inPremium = re?.test(premiumText) ?? false;
        const inFree = re?.test(freeText) ?? false;
        if (inPremium && !inFree) protectionsAdded += 1;
        if (!inPremium) missing.push(sig);
      }
      const sparse = isSparseCase(c);
      const premiumStructured =
        /\b(scope|confidential information|independent contractor status|change-order|change order|ownership|ip|work product)\b/i.test(premiumText) &&
        /\b(termination|terminate)\b/i.test(premiumText) &&
        /\b(dispute|governing law|jurisdiction|venue|arbitration)\b/i.test(premiumText);
      const clearlyBetter = sparse
        ? premiumText.length > freeText.length * 1.2 && (protectionsAdded >= 1 || premiumStructured)
        : premiumText.length > freeText.length * 1.2 && (protectionsAdded >= 2 || (protectionsAdded >= 1 && premiumStructured));
      const wouldPayAgain = correctType && clearlyBetter && missing.length <= 2;
      const score =
        (correctType ? 25 : 0) +
        Math.min(30, protectionsAdded * 3) +
        (clearlyBetter ? 25 : 0) +
        Math.max(0, 20 - missing.length * 4) +
        (sparse && clearlyBetter ? 8 : 0);
      rows.push({
        id: c.id,
        correctType,
        protectionsAdded,
        premiumClearlyBetter: clearlyBetter,
        missingTerms: missing,
        payAgain: wouldPayAgain ? "yes" : "no",
        score,
        title: premium.premiumDraft.title,
        sparse,
      });
    }
    const weakest = [...rows]
      .sort((a, b) => (a.payAgain === b.payAgain ? Number(a.score) - Number(b.score) : a.payAgain === "no" ? -1 : 1))
      .slice(0, 5);
    const dualtrack = getPremiumDualTrackStats();
    const sparseImprovedCount = rows.filter((r) => r.sparse === true && r.premiumClearlyBetter === true).length;
    const mislabelsCount = rows.filter((r) => r.correctType === false).length;
    // eslint-disable-next-line no-console
    console.log(
      "[premium-batch-eval]",
      JSON.stringify({ total: rows.length, dualtrack, sparseImprovedCount, mislabelsCount, weakest5: weakest, all: rows }, null, 2),
    );
    expect(rows).toHaveLength(25);
  });
});

