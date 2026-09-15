/**
 * Offline production-path proof for the failed live Harbor increment.
 * Replay boundary: captured parse + premium bodies are evidence of the live
 * model. Transforms, sanitizer, date distinction, and checkers are current
 * product code. This is not fresh-model evidence.
 */
import { describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "./corePaidJourneyAcceptanceMatrix";
import {
  HARBOR_SANITIZED_OUTGOING_CONTEXT,
  HARBOR_SANITIZED_PAINTED_FIRST_DRAFT_MISSING_SCOPE,
  HARBOR_SANITIZED_PREMIUM_DOCUMENT,
} from "./fixtures/harborCustomerMeaning.sanitized";
import {
  HARBOR_LIVE_20260915_INTAKE,
  HARBOR_LIVE_20260915_PERSISTED_RECORD,
  HARBOR_LIVE_20260915_PREMIUM_PARSE,
  HARBOR_LIVE_20260915_VALIDATION,
} from "./fixtures/harborLive20260915.sanitized";
import {
  applyExplicitIntakeRolesToParties,
  bindRepresentativesToLegalParties,
} from "../components/agreements/legalPartyRepresentativeBind";
import { extractProtectedCommercialClusters, renderSemanticBlock } from "../components/agreements/proSemanticBlocks";
import { extractCleanPremiumParties } from "../components/agreements/premiumCompletionPipeline";
import { inferStarterCommercialPartyRoles } from "../components/agreements/starterOpeningPartyPreserve";
import { plainForCreateRecordPersist } from "../components/agreements/sendHandoffAuthoritativeCorpus";
import {
  applyChangesExplainedByAnswers,
  checkFourPartyCustomerMeaning,
  checkHarborFirstDraftMeaning,
  checkSaasCustomerMeaning,
  checkThreePartyCustomerMeaning,
} from "./qualityEvalCustomerPaper";
import {
  RELEASE_SCOPE_FOUR_PARTY_FIRST_DRAFT_SANITIZED,
  RELEASE_SCOPE_THREE_PARTY_FIRST_DRAFT_SANITIZED,
} from "./fixtures/releaseScopeMultiparty.sanitized";
import {
  clearUnconfirmedServiceStartEffectiveDate,
  normalizeParsedDraftLegalConcepts,
} from "../components/agreements/intakeDraftLegalNormalize";
import { parseIntakeToStructuredAgreement } from "../components/agreements/intakeStructuredAgreementModel";
import { dateMeaningMaterialItem } from "../components/agreements/paidProDateMeaning";
import { applyPaidProReviewRenderSanitizer } from "../components/agreements/paidProReviewRenderCorpus";
import { buildLivePaidProSignerMetadataAuthority } from "../components/agreements/paidProSignerMetadataAuthority";
import { preparePaidProServerDocumentForAcceptance } from "../components/agreements/paidProConciseServicesQuality";
import { buildPremiumFullDraftContext } from "../components/agreements/premiumFullDraftApi";
import {
  detectUnsupportedDomainContamination,
  sanitizePaidProDomainScopeContamination,
} from "../components/agreements/paidProDomainScopeGuard";
import { preserveFullLegalPartyNames } from "../components/agreements/paidProPartyNamePreserve";
import {
  detectPremiumCommercialSignals,
  injectCoreClausesConservative,
  synthesizePremiumScopeAndOperativeFields,
} from "../components/agreements/premiumDraftTransform";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import {
  applyIdentityClarificationAnswers,
  canonicalizeIdentityAnswer,
  identityClarificationResolved,
} from "../components/agreements/legalPartyIdentityClarification";

const HARBOR_INTAKE = CORE_PAID_JOURNEY_FILLED_INTAKE;
const QUALITY_EVAL_SAAS =
  "Draft a 12-month SaaS subscription agreement between Orion Harbor LLC (Provider) and Northwind Retail Inc. (Customer). Scope: hosted platform access and standard onboarding, hosted platform only, no professional services. Fee $48,000 annually, net 30. Governing law New York.";

const HARBOR_ANSWERS = [
  "The agreement effective date is the same as the October 1, 2026 service start.",
  "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
].join("\n");

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

describe("customer-meaning production path from sanitized committed Harbor fixtures", () => {
  it("records the sanitized outgoing-context defect separately from live evidence", () => {
    expect(HARBOR_SANITIZED_OUTGOING_CONTEXT.purpose).toMatch(/Biotech, manufacturing/i);
    expect(HARBOR_SANITIZED_OUTGOING_CONTEXT.additional_terms).toMatch(/CRM/i);
    expect(HARBOR_SANITIZED_OUTGOING_CONTEXT.effective_date).toMatch(/October 1, 2026/);
    expect(HARBOR_SANITIZED_OUTGOING_CONTEXT.termination_summary).toMatch(/for convenience/i);
  });

  it("rebuilds a clean outgoing premium request from the Harbor intake", () => {
    const structured = parseIntakeToStructuredAgreement(HARBOR_INTAKE);
    expect(structured.scope).toMatch(/AI workflow implementation/i);
    let draft = asDraft({
      title: "Consulting Services Agreement",
      jurisdiction: "Delaware",
      purpose: "",
      payment_terms: "$48,000",
      additional_terms: HARBOR_SANITIZED_OUTGOING_CONTEXT.additional_terms,
    });
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
    const isoDraft = clearUnconfirmedServiceStartEffectiveDate(
      { ...draft, effective_date: "2026-10-01" },
      HARBOR_INTAKE,
    );
    const slashDraft = clearUnconfirmedServiceStartEffectiveDate(
      { ...draft, effective_date: "10/1/2026" },
      HARBOR_INTAKE,
    );
    expect(buildPremiumFullDraftContext(isoDraft).effective_date).toBeNull();
    expect(buildPremiumFullDraftContext(slashDraft).effective_date).toBeNull();
    expect(buildPremiumFullDraftContext(draft).effective_date).toBeNull();
  });

  it("paints the sanitized server paper without deleting supplied scope", () => {
    const paintedBefore = HARBOR_SANITIZED_PAINTED_FIRST_DRAFT_MISSING_SCOPE;
    expect(checkHarborFirstDraftMeaning(paintedBefore).reasons).toContain("missing_supplied_scope");
    const guarded = sanitizePaidProDomainScopeContamination(HARBOR_SANITIZED_PREMIUM_DOCUMENT, HARBOR_INTAKE, {
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
    const { text, repairs } = sanitizePaidProDomainScopeContamination(mixed, HARBOR_INTAKE);
    expect(text).toMatch(/AI workflow implementation/i);
    expect(text).not.toMatch(/CRM campaigns/i);
    expect(text).not.toMatch(/sales outreach/i);
    expect(text).not.toMatch(/configuration support/i);
    expect(text).not.toMatch(/\bplanning\b/i);
    expect(text).not.toMatch(/Service Provider will perform professional consulting/i);
    expect(repairs).toContain("stripped_unsupported_scope_additions");
    expect(detectUnsupportedDomainContamination(text, HARBOR_INTAKE).ruleIds).not.toEqual(
      expect.arrayContaining(["crm_campaigns", "sales_outreach", "configuration_support"]),
    );

    const parties = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: "Harbor Peak Analytics LLC",
      recipient2Name: "Ironvale Manufacturing Inc.",
      recipient1Email: "maya.chen@harborpeak.test",
      recipient2Email: "jordan.hale@ironvale.test",
      extraPartyReviewEmails: [],
      partySignerNames: ["Maya Chen", "Jordan Hale"],
      partySignerTitles: ["", ""],
      partyAddresses: ["", ""],
    }).parties;
    const rendered = applyPaidProReviewRenderSanitizer(mixed, parties, { intakeText: HARBOR_INTAKE }).text;
    expect(rendered).toMatch(/AI workflow implementation/i);
    expect(rendered).not.toMatch(/CRM campaigns/i);
    expect(rendered).not.toMatch(/sales outreach/i);
    expect(rendered).not.toMatch(/configuration support/i);
    const saved = preparePaidProServerDocumentForAcceptance(mixed, null, HARBOR_INTAKE);
    expect(saved.text).toMatch(/AI workflow implementation/i);
    expect(saved.text).not.toMatch(/CRM campaigns/i);
    expect(saved.text).not.toMatch(/sales outreach/i);
    expect(saved.text).not.toMatch(/configuration support/i);
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

describe("Harbor 20260915 live-failure local correction", () => {
  it("records that the rejected premium corpus was not preserved", () => {
    expect(HARBOR_LIVE_20260915_VALIDATION.document_text_preserved).toBe(false);
    expect(HARBOR_LIVE_20260915_VALIDATION.validation_failures).toContain("fallback_applicable_party");
  });

  it("corrects premium-parse parties, persist roles, and unsupported scope on the production path", () => {
    const bound = bindRepresentativesToLegalParties(
      HARBOR_LIVE_20260915_PREMIUM_PARSE.parties,
      HARBOR_LIVE_20260915_INTAKE,
    );
    const parties = applyExplicitIntakeRolesToParties(bound.parties, HARBOR_LIVE_20260915_INTAKE);
    expect(parties).toHaveLength(2);
    expect(parties[0]).toMatchObject({ name: "Harbor Peak Analytics LLC", role: "Consultant", signerName: "Maya Chen" });
    expect(parties[1]).toMatchObject({ role: "Client", signerName: "Jordan Hale" });

    const inverted = inferStarterCommercialPartyRoles(
      asDraft({
        ...HARBOR_LIVE_20260915_PERSISTED_RECORD,
        parties: HARBOR_LIVE_20260915_PERSISTED_RECORD.parties,
        payment_terms: "$48,000",
        agreement_family: "services_agreement",
      }),
      HARBOR_LIVE_20260915_INTAKE,
    );
    expect(inverted.parties?.[0]?.role).toBe("Consultant");
    expect(inverted.parties?.[1]?.role).toBe("Client");

    const persistPurpose = plainForCreateRecordPersist(
      asDraft({
        purpose: "AI workflow implementation",
        payment_terms: "$48,000",
        parties,
      }),
      HARBOR_LIVE_20260915_PERSISTED_RECORD.purpose,
    );
    expect(persistPurpose).toBe("AI workflow implementation");
    expect(persistPurpose).not.toMatch(/dashboard setup/i);

    const scope = extractProtectedCommercialClusters(HARBOR_LIVE_20260915_INTAKE).find((b) => b.id === "scope_block");
    expect(scope?.requiredPhrases).toEqual(["AI workflow implementation"]);
    expect(renderSemanticBlock(scope!)).not.toMatch(/onboarding assistance/i);

    const outgoing = extractCleanPremiumParties(HARBOR_LIVE_20260915_INTAKE, asDraft({
      purpose: "AI workflow implementation",
      payment_terms: "$48,000",
      parties: HARBOR_LIVE_20260915_PREMIUM_PARSE.parties,
    }));
    expect(outgoing.map((p) => p.role)).toEqual(["Consultant", "Client"]);
    expect(outgoing[0]?.name).toMatch(/Harbor Peak/);

    const request = buildPremiumFullDraftContext(
      asDraft({
        purpose: "AI workflow implementation",
        payment_terms: "$48,000",
        parties,
        jurisdiction: "Delaware",
        duration: "twelve months",
      }),
    );
    expect(request.parties).toEqual([
      { name: "Harbor Peak Analytics LLC", role: "Consultant" },
      { name: expect.stringMatching(/Ironvale Manufacturing Inc/), role: "Client" },
    ]);
    expect(request.purpose).toBe("AI workflow implementation");
    expect(request.effective_date).toBeNull();
  });

  it("function-level Harbor role/purpose coverage (structuredClone is not Apply, GET, or reopen)", () => {
    const first = [
      'This Consulting Services Agreement is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").',
      "1. Services",
      "Consultant will provide consulting services focused on AI workflow implementation.",
      "2. Term",
      "The term begins on October 1, 2026 and continues for twelve (12) months.",
      "3. Fees",
      "Client will pay Consultant a fixed fee of $48,000.",
      "4. Ownership",
      "Consultant owns pre-existing tools. Client owns deliverables after payment.",
      "11. Governing Law",
      "Delaware.",
    ].join("\n");
    expect(applyChangesExplainedByAnswers(first, first, HARBOR_ANSWERS).ok).toBe(true);
    expect(first).toMatch(/Client will pay Consultant a fixed fee of \$48,000/);
    expect(first).not.toMatch(/Consultant will pay Client/);
    expect(checkHarborFirstDraftMeaning(first).reasons).not.toContain("missing_supplied_scope");

    const persisted = {
      ...HARBOR_LIVE_20260915_PERSISTED_RECORD,
      parties: applyExplicitIntakeRolesToParties(
        bindRepresentativesToLegalParties(HARBOR_LIVE_20260915_PERSISTED_RECORD.parties, HARBOR_LIVE_20260915_INTAKE)
          .parties,
        HARBOR_LIVE_20260915_INTAKE,
      ),
      purpose: plainForCreateRecordPersist(
        asDraft({
          purpose: "AI workflow implementation",
          payment_terms: "$48,000",
          parties: HARBOR_LIVE_20260915_PERSISTED_RECORD.parties,
        }),
        HARBOR_LIVE_20260915_PERSISTED_RECORD.purpose,
      ),
    };
    const retrieved = structuredClone(persisted);
    const reopened = structuredClone(retrieved);
    expect(retrieved.parties[0]).toMatchObject({ name: "Harbor Peak Analytics LLC", role: "Consultant" });
    expect(retrieved.parties[1]).toMatchObject({ role: "Client" });
    expect(retrieved.purpose).toBe("AI workflow implementation");
    expect(reopened.parties).toEqual(retrieved.parties);
    expect(reopened.purpose).toBe(retrieved.purpose);
    expect(retrieved.purpose).not.toMatch(/dashboard setup/i);
  });

  it("does not reconstruct the withheld 20260915 rejected corpus and keeps unresolved applicable-party as a hard fail", () => {
    expect(HARBOR_LIVE_20260915_VALIDATION.document_text_preserved).toBe(false);
    expect(HARBOR_LIVE_20260915_VALIDATION.note).toMatch(/not captured/i);
    expect(HARBOR_LIVE_20260915_VALIDATION.schema_validation_reasons).toContain(
      "simple_consulting_section_bloat:sections=15>14",
    );
    const ask = dateMeaningMaterialItem({ intakeRaw: HARBOR_LIVE_20260915_INTAKE, body: "" });
    expect(ask?.canProceedWithoutAnswer).toBe(true);
    expect(ask?.question).toMatch(/October 1, 2026 service start/);
  });

  it("adds a customer-mentioned individual from the answer after normalize removed the extraction row", () => {
    const intake =
      "Draft a consulting agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client). Alex Rivera is involved.";
    const normalized = [
      { name: "Harbor Peak Analytics LLC", role: "Consultant" },
      { name: "Ironvale Manufacturing Inc.", role: "Client" },
    ];
    const answer = "Alex Rivera is contracting as their own legal party (Advisor).";
    const applied = applyIdentityClarificationAnswers({
      parties: normalized,
      intake,
      answers: answer,
    });
    const persisted = structuredClone(applied.parties);
    const reopened = structuredClone(persisted);
    expect(persisted.map((party) => party.name)).toEqual([
      "Harbor Peak Analytics LLC",
      "Ironvale Manufacturing Inc.",
      "Alex Rivera",
    ]);
    expect(reopened).toEqual(persisted);
    expect(canonicalizeIdentityAnswer("Alex Rivera is not signing for Harbor Peak Analytics LLC.")).toBeNull();
    expect(
      identityClarificationResolved("Alex Rivera is not signing for Harbor Peak Analytics LLC.", applied.clarificationQuestion || "Is Alex Rivera signing for one of the named companies, or contracting as their own legal party?"),
    ).toBe(false);
  });

  it("retains three- and four-party who-owes-what controls", () => {
    expect(checkThreePartyCustomerMeaning(RELEASE_SCOPE_THREE_PARTY_FIRST_DRAFT_SANITIZED)).toEqual({
      ok: true,
      reasons: [],
    });
    expect(checkFourPartyCustomerMeaning(RELEASE_SCOPE_FOUR_PARTY_FIRST_DRAFT_SANITIZED)).toEqual({
      ok: true,
      reasons: [],
    });
  });
});
