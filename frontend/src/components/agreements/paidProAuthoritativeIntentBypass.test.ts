import { describe, expect, it } from "vitest";
import {
  resolveAgreementIntentContract,
  validateIntentContractForPaidProOutput,
  type AgreementIntentContract,
} from "./agreementIntentContract";
import {
  isAuthoritativePremiumPipelineProvenance,
  isPaidProFinishedAgreement,
  validatePaidProOutput,
} from "./paidProCorpusAcceptance";
import { resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import { canShowPremiumSuccess } from "./premiumSuccessGate";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function padToLen(core: string, min: number): string {
  const pad = "\n\nThe parties agree to perform. Confidentiality, IP, governing law Oklahoma, fees, termination, notices by email.\n";
  let t = core;
  while (t.length < min) t += pad;
  return t;
}

/** Operative depth: enough signals for hasOperativeProDepth at 8k+ chars; includes intake anchors. */
const OPERATIVE_WEB_BODY = padToLen(
  [
    "WEB DEVELOPMENT AND PROFESSIONAL SERVICES AGREEMENT",
    "RECITALS",
    "Whereas Client Anthem and Developer Sarah Collins engage for the CryptoSpaces.net project in Oklahoma.",
    "",
    "1. Parties. Anthem and Sarah Collins; the project site is CryptoSpaces.net.",
    "2. Compensation. Fees, payment milestones, invoice, seven thousand five hundred dollars total,",
    "deposit, and retainer as stated. May 1, 2026. thirty days. Two revision rounds.",
    "3. Intellectual property. Work product, copyright, and deliverables.",
    "4. Termination. Governing law: the State of Oklahoma. Dispute resolution and venue.",
    "5. Notices. Notices may be sent by electronic mail and email.",
    "6. Revisions. Scope, acceptance, and warranty terms.",
    "7. Confidentiality. Indemnity and limitation of liability.",
    "8. Execution. Signatures, electronic counterparts.",
    "x".repeat(3500),
  ].join("\n"),
  10_200,
);

describe("isAuthoritativePremiumPipelineProvenance", () => {
  it("treats server full draft sources as authoritative", () => {
    expect(isAuthoritativePremiumPipelineProvenance("server_full_draft")).toBe(true);
    expect(isAuthoritativePremiumPipelineProvenance("server_full_draft_retry")).toBe(true);
    expect(isAuthoritativePremiumPipelineProvenance("snapshot_server_full_draft")).toBe(true);
    expect(isAuthoritativePremiumPipelineProvenance("fallback_preview")).toBe(false);
  });
});

describe("authoritative Pro vs. intent title stem (category hint)", () => {
  const strictSoftware: AgreementIntentContract = {
    intent_id: "software_web_dev",
    expected_title_terms: ["___NEVER_APPEARS_IN_DOC___"],
    required_material_terms: ["parties", "agreement", "shall", "fees", "payment"],
    forbidden_misclassifications: [],
    minimum_section_expectations: "Scope and deliverables.",
    ambiguity_policy: "require_user_details",
    pro_strict: true,
    user_fact_summary: "test",
  };

  it("rejects impossible title stems when pipeline is not authoritative", () => {
    const r = validateIntentContractForPaidProOutput({
      contract: strictSoftware,
      text: OPERATIVE_WEB_BODY,
      rawIntake: "SaaS website work for CryptoSpaces in Oklahoma $7500",
      draftTitle: "Something else",
      authoritativeProPipelineAccepted: false,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("title_mismatch"))).toBe(true);
  });

  it("allows the same body when pipeline is authoritative and substance is operative", () => {
    const r = validateIntentContractForPaidProOutput({
      contract: strictSoftware,
      text: OPERATIVE_WEB_BODY,
      rawIntake: "SaaS website work for CryptoSpaces in Oklahoma $7500",
      draftTitle: "Professional Services Agreement",
      authoritativeProPipelineAccepted: true,
    });
    expect(r.ok).toBe(true);
  });

  it("does not relax design_creative title rules", () => {
    const design: AgreementIntentContract = {
      intent_id: "design_creative",
      expected_title_terms: ["Design"],
      required_material_terms: ["fee", "scope"],
      forbidden_misclassifications: [],
      minimum_section_expectations: "x",
      ambiguity_policy: "require_user_details",
      pro_strict: true,
      user_fact_summary: "t",
    };
    const r = validateIntentContractForPaidProOutput({
      contract: design,
      text: OPERATIVE_WEB_BODY,
      rawIntake: "logo design $1500 two rounds",
      draftTitle: "Generic Agreement",
      authoritativeProPipelineAccepted: true,
    });
    expect(r.ok).toBe(false);
  });
});

describe("end-to-end: web intake + consulting agreement_family draft + authoritative pipeline", () => {
  const intake =
    "SaaS website API work for CryptoSpaces.net. Client Anthem, developer Sarah, Oklahoma. $7,500 total. May 1, 2026. two revision rounds.";
  const contract = resolveAgreementIntentContract(intake);
  it("validatePaidProOutput passes with premiumPipelineSource server_full_draft (not enum-locked to web_dev label)", () => {
    const broadDraft: ParsedDraftShape = {
      title: "Consulting Agreement",
      jurisdiction: "Oklahoma",
      agreement_family: "consulting_agreement",
      parties: [
        { name: "Anthem", role: "party" },
        { name: "Sarah", role: "party" },
      ],
      purpose: "Services.",
      payment_terms: "$1",
      duration: "12m",
      due_date: null,
      effective_date: "Jan 1",
      payment: emptyPayment,
    };
    const v = validatePaidProOutput({
      text: OPERATIVE_WEB_BODY,
      rawIntake: intake,
      intentContract: contract,
      draft: broadDraft,
      premiumPipelineSource: "server_full_draft",
    });
    expect(v.ok).toBe(true);
  });

  it("resolvePremiumRenderSource keeps server_full_document_text for paidAuthoritativeProBody", () => {
    const broadDraft: ParsedDraftShape = {
      title: "Independent Contractor Agreement",
      jurisdiction: "Oklahoma",
      agreement_family: "independent_contractor_agreement",
      parties: [
        { name: "A", role: "party" },
        { name: "B", role: "party" },
      ],
      purpose: "Dev services.",
      payment_terms: "Fee",
      duration: "1y",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
    };
    const res = resolvePremiumRenderSource({
      draft: broadDraft,
      intakeText: intake,
      paidAuthoritativeProBody: OPERATIVE_WEB_BODY,
      buildLivePreview: () => "thin preview that would not win",
    });
    expect(res.premium_render_source).toBe("server_full_document_text");
    expect(res.premium_render_reason).toBe("paid_pipeline_authoritative");
  });

  it("isPaidProFinishedAgreement is ok for server_full_draft + broad family draft", () => {
    const broadDraft: ParsedDraftShape = {
      title: "Generic Business Agreement",
      jurisdiction: "Oklahoma",
      agreement_family: "generic_business_agreement",
      parties: [
        { name: "Anthem", role: "party" },
        { name: "Sarah", role: "party" },
      ],
      purpose: "Work.",
      payment_terms: "x",
      duration: "y",
      due_date: null,
      effective_date: null,
      payment: emptyPayment,
    };
    const fin = isPaidProFinishedAgreement({
      text: OPERATIVE_WEB_BODY,
      rawIntake: intake,
      readonlyRenderSource: "server_full_document_text",
      pipelineSource: "server_full_draft",
      stale: false,
      intentContract: contract,
      draft: broadDraft,
    });
    expect(fin.ok).toBe(true);
  });

  it("canShowPremiumSuccess is premium_success for validated body", () => {
    const v = validatePaidProOutput({
      text: OPERATIVE_WEB_BODY,
      rawIntake: intake,
      intentContract: contract,
      draft: null,
      premiumPipelineSource: "server_full_draft",
    });
    const g = canShowPremiumSuccess({
      intentContract: contract,
      renderSource: "server_full_document_text",
      validation: v,
      documentText: OPERATIVE_WEB_BODY,
      intakeText: intake,
      premiumPipelineSource: "server_full_draft",
      stale: false,
      draft: null,
    });
    expect(g.state).toBe("premium_success");
    expect(g.signerCtaAllowed).toBe(true);
  });
});
