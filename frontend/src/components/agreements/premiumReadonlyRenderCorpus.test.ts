/** @vitest-environment jsdom */
import { SHARED_ACCEPTED_PAID_BODY } from "./paidProSharedFixtureSystem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { expandOperativeCorpusWithUniqueSupplements } from "./paidProSupplementalProvisionsFillerGate";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import * as proAgreementCanonicalizer from "./proAgreementCanonicalizer";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  logPaidProCorpusInvariant,
} from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  buildPremiumDeliverablePlainTextFromDraft,
  corpusMatchesFreeBasicDraft,
  pickPremiumPaidReadonlyPlainText,
  premiumRenderCorpusContainsSignals,
  scorePremiumReadonlyCorpusCandidate,
  shouldRejectFreeBasicDraftForPaidProPick,
} from "./premiumReadonlyRenderCorpus";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function richConsultingDraft(): ParsedDraftShape {
  return {
    title: "Consulting Agreement",
    jurisdiction: "Delaware",
    agreement_family: "consulting_agreement",
    parties: [
      { name: "Acme LLC", role: "party" },
      { name: "Beta LLC", role: "party" },
    ],
    purpose:
      "Marketing advisory including campaign analytics, CRM integration, and sales partner enablement with exclusivity in the US Northeast.",
    payment_terms:
      "Base compensation: $5,000 monthly. Commissions: 10% on qualified net revenue with 90-day clawback on refunded deals. Reimburse pre-approved travel within 14 days.",
    duration: "Initial term of twelve months with renewal as stated in a schedule.",
    due_date: null,
    effective_date: "Upon full execution.",
    termination_summary:
      "Either party may terminate for material breach, scandal or ethics concerns, or with 60 days written notice; disputes per AAA rules.",
    additional_terms:
      "Client owns deliverables and lead data exports. Exclusivity: US Northeast territory for competing engagements.",
    payment: emptyPayment,
  };
}

function acceptableFullDocumentStub(): string {
  const body = "Deliverables and services line.\n\n".repeat(120);
  return [
    "Whereas the parties wish to set forth their agreement; now therefore:",
    body,
    "1. SCOPE. Provider will perform services. 2. FEES. Payment and invoicing as set forth. 3. IP. Work product ownership. ",
    "4. CONFIDENTIALITY. Confidential information protections. 5. TERM. Initial term and renewal. 6. Termination. Either party may terminate for material breach. ",
    "7. Indemnity. 8. Limitation of liability. 9. Dispute resolution; governing law. 10. Notices. 11. Miscellaneous including entire agreement and severability. ",
    "ELECTRONIC signature and COUNTERPARTS. Signature block for Party A. Signature block for Party B.",
  ].join("\n");
}

describe("buildPremiumDeliverablePlainTextFromDraft", () => {
  it("uses premium_full_document_text when it passes the quality bar", () => {
    const full = acceptableFullDocumentStub();
    const d: ParsedDraftShape = { ...richConsultingDraft(), premium_full_document_text: full };
    const built = buildPremiumDeliverablePlainTextFromDraft(d).trim();
    expect(built.length).toBeGreaterThan(800);
    expect(built.toLowerCase()).toMatch(/consulting|commission|agreement/);
    expect(built.toLowerCase()).toMatch(/terminat|term\b|payment/);
  });

  it("client fallback Pro output has an AI workflow services quality floor", () => {
    const draft: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "Texas",
      agreement_family: "services_agreement",
      parties: [
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
      purpose: "AI workflow setup.",
      payment_terms: "$5,000.",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: 5000, cadence: null, valid: true },
    };
    const intake =
      "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup. Red Mesa will pay Harbor Peak $5,000. Texas law. Electronic signatures allowed.";
    const built = buildPremiumDeliverablePlainTextFromDraft(draft, { intakeText: intake });
    expect(built).toMatch(/SCOPE OF SERVICES|SERVICES PROVIDED|PURPOSE/i);
    expect(built).toMatch(/PAYMENT TERMS/i);
    expect(built).toMatch(/ACCEPTANCE AND DEMONSTRATION REVIEW/i);
    expect(built).toMatch(/own(?:s|ership)[\s\S]{0,220}work product/i);
    expect(built).toMatch(/CONFIDENTIALITY/i);
    expect(built).toMatch(/TERMINATION/i);
    expect(built).toMatch(/GOVERNING LAW/i);
    expect(built).toMatch(/ELECTRONIC SIGNATURES/i);
    expect(built).toMatch(/SUPPORT AND THIRD-PARTY DEPENDENCIES/i);
    expect(built).not.toMatch(/\[Not yet specified\]/i);
  });
});

describe("pickPremiumPaidReadonlyPlainText", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
  });
  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProPipelineTestIsolation();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("hard-stops to paidProSourceOfTruth without calling canonicalizer after acceptance", () => {
    const source = SHARED_ACCEPTED_PAID_BODY;
    const record = establishPaidProSourceOfTruth({ text: source, source: "server_full_draft" });
    const spy = vi.spyOn(proAgreementCanonicalizer, "canonicalizeProAgreementText");
    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "x".repeat(624),
      premiumWinningBodyText: "y".repeat(653),
      agreementDocumentText: "z".repeat(835),
      draft: richConsultingDraft(),
      premiumCheckoutCompleted: true,
      intakeText: "Consulting agreement between Acme LLC and Beta LLC.",
    });
    expect(out.plainText).toBe(record.text);
    expect(out.audit.candidates[0]?.reason).toBe("paidProSourceOfTruth");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("readonly display corpus matches the accepted SoT length (display surface not truncated vs copy)", () => {
    const source = SHARED_ACCEPTED_PAID_BODY;
    const record = establishPaidProSourceOfTruth({ text: source, source: "server_full_draft" });
    const out = pickPremiumPaidReadonlyPlainText({
      // A shorter rendered/display candidate must never replace the accepted SoT body.
      premiumReadonlySnapshotText: "x".repeat(1_613),
      agreementDocumentText: "x".repeat(1_613),
      draft: richConsultingDraft(),
      premiumCheckoutCompleted: true,
      intakeText: "Consulting agreement between Acme LLC and Beta LLC.",
    });
    expect(out.plainText).toBe(record.text);
    expect(out.plainText.length).toBe(record.text.length);
    expect(out.plainText.length).toBeGreaterThan(1_613);
  });

  it("blocks free/live preview fallback when paid Pro is locked but authority is unavailable", () => {
    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      premiumWinningBodyText: "",
      premiumPipelineOutputBodyText: "",
      hydratedPremiumSnapshotText: "",
      draft: richConsultingDraft(),
      agreementDocumentText: "This Agreement is This Agreement is between A and B.",
      premiumCheckoutCompleted: true,
      intakeText: "Consulting agreement between Acme LLC and Beta LLC.",
    });
    // Tip may still canonicalize draft candidates for scoring, but must not surface them.
    expect(out.plainText).toBe("");
    expect(out.sourceUsed).toBe("none");
    expect(out.audit.candidates[0]?.reason).toBe("all_authority_candidates_failed");
  });

  it("Pro displayed body preserves full legal names in the opening paragraph", () => {
    const draft: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "Texas",
      agreement_family: "services_agreement",
      parties: [
        { name: "Red Mesa Logistics LLC", role: "Client" },
        { name: "Harbor Peak Automation LLC", role: "Service Provider" },
      ],
      purpose: "AI workflow setup.",
      payment_terms: "$5,000",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: 5000, cadence: null, valid: true },
    };
    const intake =
      "Create a simple services agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC for AI workflow setup.";
    // SHARED already carries full legal names in the opening after establish polish.
    const record = establishPaidProSourceOfTruth({
      text: SHARED_ACCEPTED_PAID_BODY,
      draft,
      intakeText: intake,
      source: "server_full_draft",
    });
    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "short preview",
      draft,
      agreementDocumentText: "short preview",
      premiumCheckoutCompleted: true,
      intakeText: intake,
    });
    expect(out.plainText).toBe(record.text);
    const opening = out.plainText.slice(0, 900);
    expect(opening).toMatch(/Red Mesa Logistics LLC/i);
    expect(opening).toMatch(/Harbor Peak Automation LLC/i);
    expect(opening).not.toMatch(/\bbetween Red Mesa and Harbor Peak\b/i);
  });

  it("prefers completion snapshot over thin agreementDocumentText when snapshot is richer", () => {
    const draft = richConsultingDraft();
    const snap = buildPremiumDeliverablePlainTextFromDraft(draft);
    const thinAdt = [
      "CONSULTING AGREEMENT",
      "",
      "1. SCOPE OF SERVICES / PURPOSE",
      "Cleaning services",
      "",
      "2. PAYMENT TERMS",
      "$7,500",
      "",
      "3. TERM AND EFFECTIVE DATE",
      "Term: Paid monthly",
      "",
    ].join("\n");

    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: snap,
      draft: { ...draft, purpose: "Cleaning services", payment_terms: "$7,500", duration: "Paid monthly" },
      agreementDocumentText: thinAdt,
      intakeText:
        "Marketing advisory including campaign analytics, CRM integration, and sales partner enablement with exclusivity in the US Northeast.",
    });

    expect(out.sourceUsed).toBe("legacy_snapshot");
    expect(scorePremiumReadonlyCorpusCandidate(out.plainText)).toBeGreaterThan(scorePremiumReadonlyCorpusCandidate(thinAdt));
    const sig = premiumRenderCorpusContainsSignals(out.plainText);
    expect(sig.contains_commission).toBe(true);
    expect(sig.contains_reimburs).toBe(true);
    expect(sig.contains_exclusivity).toBe(true);
    expect(sig.contains_clawback).toBe(true);
    expect(out.plainText.toLowerCase()).not.toMatch(/cleaning services/);
    expect(out.plainText).not.toMatch(/\$7,500/);
    expect(out.plainText.toLowerCase()).not.toMatch(/^term:\s*paid monthly$/m);
  });

  it("prefers authoritative hydrated body over live preview when pipeline source is authoritative", () => {
    const draft = richConsultingDraft();
    const authoritative = acceptableFullDocumentStub();
    const thinLiveWouldWin =
      "CONSULTING AGREEMENT\n\n1. SCOPE\nCleaning services\n\n2. PAYMENT\n$100\n\n" + "y".repeat(800);

    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      premiumWinningBodyText: "",
      premiumPipelineOutputBodyText: "",
      hydratedPremiumSnapshotText: "",
      authoritativeHydratedPlainText: authoritative,
      lastPremiumPipelineRenderSource: "server_full_draft",
      draft,
      agreementDocumentText: thinLiveWouldWin,
      intakeText:
        "Marketing advisory including campaign analytics, CRM integration, and sales partner enablement with exclusivity in the US Northeast.",
    });

    expect(out.sourceUsed).toBe("server_full_document_text");
    expect(out.plainText.length).toBeGreaterThan(1_000);
    expect(out.plainText.toLowerCase()).toMatch(/whereas|confidential|scope/);
    expect(out.audit.forcedPremiumSource).toBe(true);
    expect(out.plainText.toLowerCase()).not.toMatch(/cleaning services/);
  });

  it("rebuilds from draft when snapshot missing and draft is richer than agreementDocumentText", () => {
    const draft = richConsultingDraft();
    const rebuilt = buildPremiumDeliverablePlainTextFromDraft(draft);
    const thinAdt = "CONSULTING\n\nScope\nConsulting advisory services.\n\nPayment\n$7,500\n\nTerm\nPaid monthly\n";

    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      draft,
      agreementDocumentText: thinAdt,
    });

    expect(out.sourceUsed).toBe("live_generated_preview");
    expect(out.plainText.length).toBeGreaterThan(thinAdt.length + 100);
    expect(premiumRenderCorpusContainsSignals(out.plainText).contains_commission).toBe(true);
    expect(out.plainText.length).toBeGreaterThanOrEqual(rebuilt.length * 0.68);
    expect(out.plainText.toLowerCase()).toContain("commission");
  });

  it("test31: rejects free-basic draft hash for paid checkout when authoritative fallback exists", () => {
    const free = "Starter free preview ".repeat(35);
    const paid = "LawDog Pro commercial safeguards ".repeat(90);
    expect(corpusMatchesFreeBasicDraft(free, free)).toBe(true);
    expect(
      shouldRejectFreeBasicDraftForPaidProPick({
        selectedPlain: free,
        freeBaselinePlain: free,
        premiumCheckoutCompleted: true,
        paidAuthoritativeFallback: paid,
      }),
    ).toBe(true);
  });
});

describe("pickPremiumPaidReadonlyPlainText SoT byte stability with signer metadata", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
  });
  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProPipelineTestIsolation();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("readonly pick stays byte-identical when intake implies signers but SoT body has no execution block", () => {
    // Substantive corpus intentionally omits witness/execution chrome.
    const source = expandOperativeCorpusWithUniqueSupplements(
      [
        "PROFESSIONAL SERVICES AGREEMENT",
        "",
        'This Professional Services Agreement ("Agreement") is entered into by and between Acme LLC ("Client") and Beta LLC ("Service Provider").',
        "",
        "1. SCOPE OF SERVICES. Service Provider performs consulting services.",
        "2. PAYMENT. Client pays fees as stated.",
        "3. TERM. Continues until completed or terminated.",
        "4. CONFIDENTIALITY. Mutual confidentiality applies.",
        "5. OWNERSHIP. Client owns paid deliverables.",
        "6. TERMINATION. Either party may terminate for breach.",
        "7. GOVERNING LAW. Delaware law governs.",
        "8. NOTICES. Notices may be delivered by email.",
        "9. MISCELLANEOUS. Entire agreement; electronic signatures permitted.",
        "10. INDEPENDENT CONTRACTOR. Service Provider is an independent contractor.",
        "11. WARRANTIES. Services are performed professionally.",
        "12. LIMITATION OF LIABILITY. Neither party is liable for consequential damages.",
      ].join("\n"),
      SUBSTANTIVE_SERVER_DRAFT_MIN_LEN + 400,
    );
    expect(source).not.toMatch(/IN WITNESS WHEREOF/i);
    const record = establishPaidProSourceOfTruth({ text: source, source: "server_full_draft" });
    const draft = richConsultingDraft();
    (draft.parties[0] as { signerName?: string }).signerName = "Alice Signer";
    (draft.parties[1] as { signerName?: string }).signerName = "Bob Signer";
    const out = pickPremiumPaidReadonlyPlainText({
      premiumReadonlySnapshotText: "",
      draft,
      agreementDocumentText: "",
      premiumCheckoutCompleted: true,
      intakeText:
        "Signer for Acme LLC is Alice Signer, CEO. Jim Summit, President, will sign for Beta LLC.",
    });
    // Tip may attach execution chrome at establish; readonly pick must stay byte-identical to SoT
    // and must not diverge further from signer-intake metadata.
    expect(out.plainText).toBe(record.text);
    expect(out.plainText).toBe(getPaidProDocumentForSurface("display")!.text);
  });
});

describe("paid Pro displayed surface resolves to the SoT body, not decorative chrome", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
  });
  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProPipelineTestIsolation();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("the display surface length equals the accepted SoT length (decorative HTML/chrome is never the body)", () => {
    const record = establishPaidProSourceOfTruth({
      text: SHARED_ACCEPTED_PAID_BODY,
      source: "server_full_draft",
    });
    const display = getPaidProDocumentForSurface("display");
    expect(display?.text.length).toBe(record.text.length);
    expect(display?.hash).toBe(record.hash);
    // A tiny decorative signature card (~28 chars) must never be reported as the document body.
    expect(display!.text.length).toBeGreaterThan(1_000);
  });

  it("no paid-pro-corpus-invariant-violation when display/copy/review/finalized derive from the SoT", () => {
    establishPaidProSourceOfTruth({ text: SHARED_ACCEPTED_PAID_BODY, source: "server_full_draft" });
    const displayed = getPaidProDocumentForSurface("display")!.text;
    const copied = getPaidProDocumentForSurface("copy")!.text;
    const review = getPaidProDocumentForSurface("review")!.text;
    const finalized = getPaidProDocumentForSurface("finalized")!.text;
    const invariant = logPaidProCorpusInvariant({ displayed, copied, review, finalized });
    expect(invariant?.displayed_matches).toBe(true);
    expect(invariant?.copied_matches).toBe(true);
    expect(invariant?.review_matches).toBe(true);
    expect(invariant?.finalized_matches).toBe(true);
    expect(invariant?.displayed_len).toBe(invariant?.copied_len);
  });
});
