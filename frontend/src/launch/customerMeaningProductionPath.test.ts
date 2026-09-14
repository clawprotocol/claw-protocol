/**
 * Offline production-path proof for the failed live Harbor increment.
 * Replay boundary: captured parse + premium bodies are evidence of the live
 * model. Transforms, sanitizer, date distinction, and checkers are current
 * product code. This is not fresh-model evidence.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "./corePaidJourneyAcceptanceMatrix";
import {
  applyChangesExplainedByAnswers,
  checkHarborFirstDraftMeaning,
  checkSaasCustomerMeaning,
} from "./qualityEvalCustomerPaper";
import {
  clearUnconfirmedServiceStartEffectiveDate,
  normalizeParsedDraftLegalConcepts,
} from "../components/agreements/intakeDraftLegalNormalize";
import { parseIntakeToStructuredAgreement } from "../components/agreements/intakeStructuredAgreementModel";
import { dateMeaningMaterialItem } from "../components/agreements/paidProDateMeaning";
import { sanitizePaidProDomainScopeContamination } from "../components/agreements/paidProDomainScopeGuard";
import { preserveFullLegalPartyNames } from "../components/agreements/paidProPartyNamePreserve";
import {
  detectPremiumCommercialSignals,
  injectCoreClausesConservative,
  synthesizePremiumScopeAndOperativeFields,
} from "../components/agreements/premiumDraftTransform";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";

const LIVE_DIR = join(
  process.cwd(),
  "..",
  "evals/commercial-readiness/results/quality-eval-live/20260914T195201Z-5037",
);

const HARBOR_INTAKE = CORE_PAID_JOURNEY_FILLED_INTAKE;
const QUALITY_EVAL_SAAS =
  "Draft a 12-month SaaS subscription agreement between Orion Harbor LLC (Provider) and Northwind Retail Inc. (Customer). Scope: hosted platform access and standard onboarding, hosted platform only, no professional services. Fee $48,000 annually, net 30. Governing law New York.";

const HARBOR_ANSWERS = [
  "The agreement effective date is the same as the October 1, 2026 service start.",
  "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
].join("\n");

function liveJson<T>(name: string): T {
  const path = join(LIVE_DIR, name);
  if (!existsSync(path)) throw new Error(`preserved live evidence missing: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function liveText(name: string): string {
  const path = join(LIVE_DIR, name);
  if (!existsSync(path)) throw new Error(`preserved live evidence missing: ${path}`);
  return readFileSync(path, "utf8");
}

function asDraft(parsed: Record<string, unknown>): ParsedDraftShape {
  return {
    title: String(parsed.title || "Services Agreement"),
    jurisdiction: String(parsed.jurisdiction || "Delaware"),
    parties: (parsed.parties as ParsedDraftShape["parties"]) || [],
    purpose: String(parsed.purpose || ""),
    payment_terms: String(parsed.payment_terms || ""),
    duration: parsed.duration == null ? null : String(parsed.duration),
    due_date: parsed.due_date == null ? null : String(parsed.due_date),
    effective_date: parsed.effective_date == null ? null : String(parsed.effective_date),
    payment: { amount: 48000, cadence: null, valid: true },
    agreement_family: "services_agreement",
  };
}

describe("customer-meaning production path from preserved live Harbor evidence", () => {
  it("identifies the replay boundary on the captured endpoints", () => {
    const endpoints = liveJson<Array<{ path: string; request?: { context?: { purpose?: string; additional_terms?: string; effective_date?: string; termination_summary?: string } } }>>(
      "consulting-desktop-model-endpoints.json",
    );
    const parsePremium = endpoints.find((row) => row.path === "/api/agreements/parse" && row.request);
    const premium = endpoints.find((row) => row.path === "/api/agreements/premium-full-draft");
    expect(parsePremium).toBeTruthy();
    expect(premium?.request?.context?.purpose).toMatch(/Biotech, manufacturing/i);
    expect(premium?.request?.context?.additional_terms).toMatch(/CRM/i);
    expect(premium?.request?.context?.effective_date).toMatch(/October 1, 2026/);
    expect(premium?.request?.context?.termination_summary).toMatch(/for convenience/i);
  });

  it("rebuilds a clean outgoing premium request from the captured parse", () => {
    const endpoints = liveJson<Array<{ path: string; request?: { ai_model_class?: string }; body?: { draft?: Record<string, unknown> } }>>(
      "consulting-desktop-model-endpoints.json",
    );
    const parse = endpoints.find(
      (row) => row.path === "/api/agreements/parse" && row.request?.ai_model_class === "premium",
    );
    const structured = parseIntakeToStructuredAgreement(HARBOR_INTAKE);
    expect(structured.scope).toMatch(/AI workflow implementation/i);
    let draft = asDraft(parse?.body?.draft || {});
    draft = {
      ...draft,
      termination_summary:
        "Either party may terminate this Agreement for material breach not cured within thirty (30) days after written notice, or for convenience upon thirty (30) days prior written notice to the other party.",
    };
    draft = normalizeParsedDraftLegalConcepts(draft, HARBOR_INTAKE, { applyStarterTerminationDefault: false });
    draft = synthesizePremiumScopeAndOperativeFields(draft, HARBOR_INTAKE);
    draft = injectCoreClausesConservative(draft, HARBOR_INTAKE);
    draft = clearUnconfirmedServiceStartEffectiveDate(draft, HARBOR_INTAKE);
    expect(draft.purpose).toMatch(/AI workflow implementation/i);
    expect(draft.purpose).not.toMatch(/Biotech, manufacturing/i);
    expect(draft.additional_terms || "").not.toMatch(/\bCRM\b/i);
    expect(draft.additional_terms || "").not.toMatch(/campaign/i);
    expect(draft.additional_terms || "").not.toMatch(/sales representative/i);
    expect(draft.effective_date).toBeNull();
    expect(draft.termination_summary || "").not.toMatch(/for convenience/i);
    expect(detectPremiumCommercialSignals(HARBOR_INTAKE).contractorServices).toBe(false);
  });

  it("paints the captured server paper without deleting supplied scope", () => {
    const premium = liveJson<{ document_text?: string }>("consulting-desktop-premium-result.json");
    const paintedBefore = liveText("consulting-desktop-first-draft.txt");
    expect(checkHarborFirstDraftMeaning(paintedBefore).reasons).toContain("missing_supplied_scope");
    const guarded = sanitizePaidProDomainScopeContamination(premium.document_text || "", HARBOR_INTAKE, {
      providerLabel: "Harbor Peak Analytics LLC",
      clientLabel: "Ironvale Manufacturing Inc.",
    }).text;
    expect(guarded).toMatch(/AI workflow implementation/i);
    expect(guarded).toMatch(/twelve \(12\) months/i);
    expect(guarded).not.toMatch(/Service Provider will perform professional consulting/i);
    const named = preserveFullLegalPartyNames(guarded, ["Harbor Peak Analytics LLC", "Ironvale Manufacturing Inc."], HARBOR_INTAKE);
    expect(named).not.toMatch(/Inc\. Manufacturing/);
    const first = checkHarborFirstDraftMeaning(guarded);
    expect(first.reasons).not.toContain("missing_supplied_scope");
    expect(first.reasons).not.toContain("missing_term_duration");
  });

  it("keeps the service-start / effective-date question optional and unanswered", () => {
    const ask = dateMeaningMaterialItem({ intakeRaw: HARBOR_INTAKE, body: "" });
    expect(ask?.canProceedWithoutAnswer).toBe(true);
    expect(ask?.question).toMatch(/October 1, 2026 service start/);
  });

  it("does not invent dates or completion when Apply is not answered", () => {
    const first =
      'This Consulting Services Agreement is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").\n\n1. Services\nConsultant will provide consulting services focused on AI workflow implementation.\n\n2. Term\nThe term begins on October 1, 2026 and continues for twelve (12) months.\n\n3. Fees\nClient will pay $48,000.\n\n11. Governing Law\nDelaware.';
    const invented = first.replace(
      "is entered into by and between",
      'is entered into as of October 1, 2026 (the "Effective Date") by and between',
    );
    expect(checkHarborFirstDraftMeaning(invented).reasons).toContain("invented_effective_date_before_answer");
    expect(applyChangesExplainedByAnswers(first, invented, "").reasons).toContain(
      "effective_date_not_from_customer_answer",
    );
    expect(applyChangesExplainedByAnswers(first, first, HARBOR_ANSWERS).reasons).not.toContain(
      "unauthorized_operative_change",
    );
  });

  it("treats equivalent labeled and prose scope as the same customer fact", () => {
    const labeled = parseIntakeToStructuredAgreement(
      "Between Harbor Peak Analytics LLC and Ironvale Holdings LLC. Scope: AI workflow implementation. $48,000. Delaware.",
    );
    const prose = parseIntakeToStructuredAgreement(
      "Between Harbor Peak Analytics LLC and Ironvale Holdings LLC. Scope is AI workflow implementation. $48,000. Delaware.",
    );
    expect(labeled.scope).toMatch(/AI workflow implementation/i);
    expect(prose.scope).toMatch(/AI workflow implementation/i);
    expect(labeled.scopeInferred).toBe(false);
    expect(prose.scopeInferred).toBe(false);
  });

  it("does not change service scope when only the client company name changes", () => {
    const manufacturing = parseIntakeToStructuredAgreement(
      "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation.",
    );
    const holdings = parseIntakeToStructuredAgreement(
      "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Holdings Inc. (Client). Scope is AI workflow implementation.",
    );
    const biotechName = parseIntakeToStructuredAgreement(
      "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Biotech Manufacturing Inc. (Client). Scope is AI workflow implementation.",
    );
    expect(manufacturing.scope).toMatch(/AI workflow implementation/i);
    expect(holdings.scope).toBe(manufacturing.scope);
    expect(biotechName.scope).toBe(manufacturing.scope);
    expect(biotechName.scope).not.toMatch(/Biotech, manufacturing/i);
  });

  it("keeps mixed valid scope while stripping unsupported additions", () => {
    const mixed = [
      "1. Services",
      "Consultant will perform AI workflow implementation and also manage CRM campaigns, sales outreach, and configuration support.",
      "",
      "2. Term",
      "The term is twelve (12) months.",
    ].join("\n");
    const { text } = sanitizePaidProDomainScopeContamination(mixed, HARBOR_INTAKE);
    expect(text).toMatch(/AI workflow implementation/i);
    expect(text).not.toMatch(/configuration support/i);
    expect(text).not.toMatch(/Service Provider will perform professional consulting/i);
  });

  it("keeps hosted SaaS free of consulting/project obligations", () => {
    const saas = [
      "This SaaS Subscription Agreement is entered into by and between Orion Harbor LLC (\"Provider\") and Northwind Retail Inc. (\"Customer\").",
      "1. Services",
      "Provider shall provide hosted platform access and standard onboarding. Scope is the hosted platform only. Provider shall not perform professional services.",
      "2. Fees",
      "Customer shall pay $48,000 annually. Invoices are due net 30.",
      "3. Term",
      "The initial term is twelve (12) months.",
      "4. Governing Law",
      "New York.",
    ].join("\n");
    const guarded = sanitizePaidProDomainScopeContamination(saas, QUALITY_EVAL_SAAS).text;
    expect(checkSaasCustomerMeaning(guarded).ok).toBe(true);
    expect(guarded).not.toMatch(/AI workflow implementation/i);
    expect(guarded).not.toMatch(/Consultant shall perform/i);
  });
});
