import { describe, expect, it } from "vitest";
import { normalizeArticleWhitespace } from "./corePaidJourneyAcceptanceMatrix";
import {
  HARBOR_SANITIZED_PAINTED_FIRST_DRAFT_MISSING_SCOPE,
  HARBOR_SANITIZED_PREMIUM_DOCUMENT,
} from "./fixtures/harborCustomerMeaning.sanitized";
import {
  applyChangesExplainedByAnswers,
  checkFourPartyCustomerMeaning,
  checkHarborAppliedMeaning,
  checkHarborFirstDraftMeaning,
  checkSaasCustomerMeaning,
  checkThreePartyCustomerMeaning,
  consultingPaperReady,
  fourPartyFirstDraftReady,
  fourPartyPaperReady,
  saasPaperReady,
  threePartyPaperReady,
} from "./qualityEvalCustomerPaper";

/** The weak keyword checks that previously accepted a mutated SaaS paper. */
function legacyWeakSaasReady(article: string): boolean {
  const normalized = normalizeArticleWhitespace(article);
  return (
    /Orion Harbor LLC/.test(normalized) &&
    /Northwind Retail Inc/.test(normalized) &&
    /\$48,000/.test(normalized) &&
    /New York/.test(normalized) &&
    /hosted platform/i.test(normalized) &&
    !/CONSULTING SERVICES AGREEMENT/i.test(normalized) &&
    !/AI workflow implementation/i.test(normalized) &&
    !/Consultant shall perform/i.test(normalized) &&
    !/accept or reject each milestone/i.test(normalized)
  );
}

const VALID_SAAS_STUB = [
  "SOFTWARE AS A SERVICE SUBSCRIPTION AGREEMENT",
  'This SaaS Subscription Agreement (the "Agreement") is entered into by and between Orion Harbor LLC ("Provider") and Northwind Retail Inc. ("Customer").',
  "1. PARTIES AND ROLES. Provider operates a hosted software platform. Customer is subscribing to hosted access only.",
  "2. SERVICES. Provider shall provide hosted platform access and standard onboarding. Scope is the hosted platform only. Provider shall not perform professional services, consulting deliverables, implementation projects, or a project-acceptance process.",
  "3. FEES AND PAYMENT. Customer shall pay $48,000 annually for the hosted subscription. Invoices are due net thirty (30) days.",
  "4. TERM AND DURATION. The initial subscription term is twelve months.",
  "9. GOVERNING LAW. This Agreement is governed by the laws of the State of New York.",
  "13. ADDITIONAL OPERATIVE TERMS. This Agreement does not create milestones, deemed acceptance, service-level credits, or consulting completion criteria.",
].join("\n");

const VALID_SAAS_EQUIVALENT = [
  "SaaS Subscription Agreement",
  "Orion Harbor LLC (Service Provider) and Northwind Retail Inc (Client).",
  "Scope is hosted software access only, without professional services.",
  "The annual subscription fee is $48,000 per year. Invoices are payable within 30 days of receipt.",
  "The hosted access term is 12 months.",
  "Governing law is New York.",
].join("\n");

const VALID_HARBOR_FIRST = [
  "CONSULTING SERVICES AGREEMENT",
  'This Consulting Services Agreement (the "Agreement") is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").',
  "2. SCOPE OF SERVICES. Consultant shall perform AI workflow implementation.",
  "3. FEES AND PAYMENT. Client shall pay a fixed fee of $48,000 for the services.",
  "4. TERM AND DURATION. The initial term is twelve months beginning October 1, 2026.",
  "6. INTELLECTUAL PROPERTY. Consultant retains ownership of pre-existing tools. Client owns deliverables after payment.",
  "8. LIMITATION OF LIABILITY. Each party's aggregate liability is limited to the $48,000 fixed fee.",
  "9. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware.",
  "10. NOTICES. Notices shall be sent to each party's designated email address.",
].join("\n");

const HARBOR_ANSWERS = [
  "The agreement effective date is the same as the October 1, 2026 service start.",
  "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
].join("\n");

const VALID_HARBOR_APPLIED = [
  'This Consulting Services Agreement is entered into as of October 1, 2026 (the "Effective Date") by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").',
  "2. SCOPE OF SERVICES. Consultant shall perform AI workflow implementation.",
  "3. FEES AND PAYMENT. Client shall pay a fixed fee of $48,000 for the services.",
  "4. TERM AND DURATION. The initial term is twelve months beginning October 1, 2026.",
  "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
  "6. INTELLECTUAL PROPERTY. Consultant retains ownership of pre-existing tools. Client owns deliverables after payment.",
  "8. LIMITATION OF LIABILITY. Each party's aggregate liability is limited to the $48,000 fixed fee.",
  "9. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware.",
  "10. NOTICES. Notices shall be sent to each party's designated email address.",
].join("\n");

describe("quality-eval SaaS customer-meaning checks", () => {
  it("reproduces the hole: legacy checks accept net-90 plus invented automatic acceptance", () => {
    const mutated = [
      VALID_SAAS_STUB.replace("net thirty (30) days", "net-90"),
      "Customer must approve every project deliverable within five days or it is accepted automatically.",
    ].join("\n");
    expect(legacyWeakSaasReady(mutated)).toBe(true);
    const check = checkSaasCustomerMeaning(mutated);
    expect(check.ok).toBe(false);
    expect(check.reasons).toEqual(
      expect.arrayContaining(["changed_supplied_payment_timing", "invented_project_acceptance"]),
    );
    expect(saasPaperReady(mutated)).toBe(false);
  });

  it("accepts equivalent valid wording, including stub and remapped party labels", () => {
    expect(checkSaasCustomerMeaning(VALID_SAAS_STUB)).toEqual({ ok: true, reasons: [] });
    expect(checkSaasCustomerMeaning(VALID_SAAS_EQUIVALENT)).toEqual({ ok: true, reasons: [] });
    expect(saasPaperReady(VALID_SAAS_STUB)).toBe(true);
  });

  it("rejects omitted supplied facts without inventing replacements", () => {
    const omittedPay = VALID_SAAS_STUB.replace("Invoices are due net thirty (30) days.", "");
    expect(checkSaasCustomerMeaning(omittedPay).reasons).toContain("missing_supplied_net_30");
    const omittedAnnual = VALID_SAAS_STUB.replace("annually", "in total");
    expect(checkSaasCustomerMeaning(omittedAnnual).reasons).toContain("missing_annual_fee_basis");
    const omittedTerm = VALID_SAAS_STUB.replace("twelve months", "the initial term");
    expect(checkSaasCustomerMeaning(omittedTerm).reasons).toContain("missing_twelve_month_duration");
    const omittedScope = VALID_SAAS_STUB.replace(/hosted (?:platform|software|access)/gi, "the product").replace(
      /professional services/gi,
      "other work",
    );
    expect(checkSaasCustomerMeaning(omittedScope).reasons).toEqual(
      expect.arrayContaining(["missing_hosted_scope", "missing_hosted_only_limit"]),
    );
  });

  it("rejects changed fee amount and invented consulting obligations", () => {
    const changedFee = VALID_SAAS_STUB.replace("$48,000", "$60,000");
    expect(checkSaasCustomerMeaning(changedFee).reasons).toContain("missing_annual_fee_amount");
    const consulting = VALID_SAAS_STUB.replace(
      "SOFTWARE AS A SERVICE SUBSCRIPTION AGREEMENT",
      "CONSULTING SERVICES AGREEMENT",
    ).replace("hosted platform access and standard onboarding", "AI workflow implementation");
    expect(checkSaasCustomerMeaning(consulting).reasons).toContain("invented_consulting_paper");
  });
});

describe("quality-eval Harbor meaning and Apply explainability", () => {
  it("accepts a first draft that keeps unanswered date/completion visible, and rejects invented answers", () => {
    expect(checkHarborFirstDraftMeaning(VALID_HARBOR_FIRST)).toEqual({ ok: true, reasons: [] });
    const inventedDate = VALID_HARBOR_FIRST.replace(
      "is entered into by and between",
      "is entered into as of the Effective Date by and between",
    );
    expect(checkHarborFirstDraftMeaning(inventedDate).reasons).toContain("invented_undefined_effective_date");
    const labeledEarly = VALID_HARBOR_FIRST.replace(
      "is entered into by and between",
      'is entered into as of October 1, 2026 (the "Effective Date") by and between',
    );
    expect(checkHarborFirstDraftMeaning(labeledEarly).reasons).toContain("invented_effective_date_before_answer");
    const inventedCompletion = `${VALID_HARBOR_FIRST}\nCompletion is Client's written confirmation that the implemented AI workflow is in operational use.`;
    expect(checkHarborFirstDraftMeaning(inventedCompletion).reasons).toContain(
      "invented_completion_before_answer",
    );
  });

  it("accepts equivalent applied wording and requires customer-authorized date/completion", () => {
    expect(checkHarborAppliedMeaning(VALID_HARBOR_APPLIED)).toEqual({ ok: true, reasons: [] });
    expect(consultingPaperReady(VALID_HARBOR_APPLIED)).toBe(true);
    expect(checkHarborAppliedMeaning(VALID_HARBOR_FIRST).ok).toBe(false);
    const paraphrase = VALID_HARBOR_APPLIED.replace(
      "written confirmation that the implemented AI workflow is in operational use",
      "client confirms that the implemented AI workflow is in operational use",
    );
    expect(checkHarborAppliedMeaning(paraphrase).ok).toBe(true);
  });

  it("reproduces and rejects an unauthorized ownership rewrite after date/completion-only answers", () => {
    const mutated = `${VALID_HARBOR_APPLIED}\nNotwithstanding the foregoing, Client owns all of Consultant's pre-existing tools.`;
    expect(applyChangesExplainedByAnswers(VALID_HARBOR_FIRST, VALID_HARBOR_APPLIED, HARBOR_ANSWERS)).toEqual({
      ok: true,
      reasons: [],
    });
    const check = applyChangesExplainedByAnswers(VALID_HARBOR_FIRST, mutated, HARBOR_ANSWERS);
    expect(check.ok).toBe(false);
    expect(check.reasons).toContain("unauthorized_operative_change");
  });

  it("rejects unauthorized deletions and replacements in unrelated operative terms", () => {
    const deletedFee = VALID_HARBOR_APPLIED.replace(
      "3. FEES AND PAYMENT. Client shall pay a fixed fee of $48,000 for the services.",
      "",
    );
    expect(applyChangesExplainedByAnswers(VALID_HARBOR_FIRST, deletedFee, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
    const replacedLiability = VALID_HARBOR_APPLIED.replace(
      "Each party's aggregate liability is limited to the $48,000 fixed fee.",
      "Neither party has any liability to the other.",
    );
    expect(applyChangesExplainedByAnswers(VALID_HARBOR_FIRST, replacedLiability, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
    const deletedNotice = VALID_HARBOR_APPLIED.replace(
      "10. NOTICES. Notices shall be sent to each party's designated email address.",
      "",
    );
    expect(applyChangesExplainedByAnswers(VALID_HARBOR_FIRST, deletedNotice, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
    expect(applyChangesExplainedByAnswers(VALID_HARBOR_FIRST, VALID_HARBOR_APPLIED, "Leave dates unresolved.").ok).toBe(
      false,
    );
  });

  it("allows presentation-only opening and defined-term remapping after a bounded Apply", () => {
    const paintedFirst = [
      "CONSULTING SERVICES AGREEMENT",
      'This Consulting Services Agreement (this "Agreement") is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client"). Consultant and Client may be referred to individually as a "Party" and collectively as the "Parties."',
      "2. SCOPE OF SERVICES. Consultant shall perform AI workflow implementation.",
      "3. FEES AND PAYMENT. Client shall pay a fixed fee of $48,000 for the services.",
      "4. TERM AND DURATION. The initial term is twelve months beginning October 1, 2026.",
      "6. INTELLECTUAL PROPERTY. Consultant retains ownership of pre-existing tools. Client owns deliverables after payment.",
      "8. LIMITATION OF LIABILITY. Each party's aggregate liability is limited to the $48,000 fixed fee.",
      "9. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware.",
      "10. NOTICES. Notices shall be sent to each party's designated email address.",
    ].join("\n");
    const paintedApplied = [
      'This Consulting Services Agreement (the "Agreement") is entered into as of October 1, 2026 (the "Effective Date") by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").',
      "2. SCOPE OF SERVICES. Consultant shall perform AI workflow implementation. Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
      "3. FEES AND PAYMENT. Client shall pay a fixed fee of $48,000 for the services.",
      "4. TERM AND DURATION. The initial term is twelve months beginning October 1, 2026.",
      "6. INTELLECTUAL PROPERTY. Consultant retains ownership of pre-existing tools. Client owns deliverables after payment.",
      "8. LIMITATION OF LIABILITY. Each party's aggregate liability is limited to the $48,000 fixed fee.",
      "9. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware.",
      "10. NOTICES. Notices shall be sent to each party's designated email address.",
    ].join("\n");
    expect(applyChangesExplainedByAnswers(paintedFirst, paintedApplied, HARBOR_ANSWERS)).toEqual({
      ok: true,
      reasons: [],
    });
    const liveFirst = [
      'This AI Workflow Implementation Consulting Services Agreement (the "Agreement") is entered into by and between Harbor Peak Analytics LLC, as "Consultant," and Ironvale Manufacturing Inc. ("Client").',
      "1. Services. Consultant will provide consulting and implementation services focused on AI workflow implementation.",
      "2. Term. The term begins on October 1, 2026 and continues for twelve (12) months.",
      "3. Fees. Client will pay $48,000.",
      "11. Governing Law. Delaware.",
    ].join("\n");
    const liveApplied = [
      'This AI Workflow Implementation Consulting Services Agreement (the "Agreement") is entered into as of October 1, 2026 (the "Effective Date") by and between Harbor Peak Analytics LLC, as "Consultant," and Ironvale Manufacturing Inc. ("Client").',
      "1. Services. Consultant will provide consulting and implementation services focused on AI workflow implementation. Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
      "2. Term. The term begins on October 1, 2026 and continues for twelve (12) months.",
      "3. Fees. Client will pay $48,000.",
      "11. Governing Law. Delaware.",
    ].join("\n");
    expect(applyChangesExplainedByAnswers(liveFirst, liveApplied, HARBOR_ANSWERS)).toEqual({
      ok: true,
      reasons: [],
    });
    expect(
      applyChangesExplainedByAnswers(
        paintedFirst,
        `${paintedApplied}\nNotwithstanding the foregoing, Client owns all of Consultant's pre-existing tools.`,
        HARBOR_ANSWERS,
      ).reasons,
    ).toContain("unauthorized_operative_change");
  });

  it("rejects the ownership append on the saved Harbor paper after date/completion-only answers", () => {
    const first = VALID_HARBOR_FIRST;
    const applied = VALID_HARBOR_APPLIED;
    expect(applyChangesExplainedByAnswers(first, applied, HARBOR_ANSWERS)).toEqual({ ok: true, reasons: [] });
    const mutated = `${applied}\nNotwithstanding the foregoing, Client owns all of Consultant's pre-existing tools.`;
    expect(applyChangesExplainedByAnswers(first, mutated, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
    expect(
      applyChangesExplainedByAnswers(
        first,
        applied.replace(
          "Consultant retains ownership of pre-existing tools. Client owns deliverables after payment.",
          "Client owns all work product, including Consultant's pre-existing tools.",
        ),
        HARBOR_ANSWERS,
      ).reasons,
    ).toContain("unauthorized_operative_change");
    expect(
      applyChangesExplainedByAnswers(
        first,
        applied.replace("Client shall pay a fixed fee of $48,000 for the services.", ""),
        HARBOR_ANSWERS,
      ).reasons,
    ).toContain("unauthorized_operative_change");
    expect(
      applyChangesExplainedByAnswers(
        first,
        applied.replace(
          "Each party's aggregate liability is limited to the $48,000 fixed fee.",
          "Neither party has any liability to the other.",
        ),
        HARBOR_ANSWERS,
      ).reasons,
    ).toContain("unauthorized_operative_change");
    expect(
      applyChangesExplainedByAnswers(
        first,
        applied.replace("Notices shall be sent to each party's designated email address.", ""),
        HARBOR_ANSWERS,
      ).reasons,
    ).toContain("unauthorized_operative_change");
  });

  it("rejects an unauthorized ownership clause joined to the authorized completion sentence", () => {
    const first = VALID_HARBOR_FIRST;
    const applied = VALID_HARBOR_APPLIED;
    const smuggled =
      "Completion is Client's written confirmation that the implemented AI workflow is in operational use, and Client owns all of Consultant's pre-existing tools.";
    const current = applyChangesExplainedByAnswers(
      first,
      applied.replace(
        "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
        smuggled,
      ),
      HARBOR_ANSWERS,
    );
    expect(current.reasons).toContain("unauthorized_operative_change");

    const beforePhrase = applied.replace(
      "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
      "Client owns all of Consultant's pre-existing tools, and Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
    );
    expect(applyChangesExplainedByAnswers(first, beforePhrase, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
    const semicolon = applied.replace(
      "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
      "Completion is Client's written confirmation that the implemented AI workflow is in operational use; Client owns all of Consultant's pre-existing tools.",
    );
    expect(applyChangesExplainedByAnswers(first, semicolon, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
    const broken = applied.replace(
      "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
      "Completion is Client's written confirmation that the implemented AI workflow is in operational use\nand Client owns all of Consultant's pre-existing tools.",
    );
    expect(applyChangesExplainedByAnswers(first, broken, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
    const ceremonyLine = `${applied}\nCLIENT: Notwithstanding the foregoing, Client owns all of Consultant's pre-existing tools.`;
    expect(applyChangesExplainedByAnswers(first, ceremonyLine, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
    const byLine = `${applied}\nBy: __________________________ Client owns all of Consultant's pre-existing tools.`;
    expect(applyChangesExplainedByAnswers(first, byLine, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
    const witnessLine = `${applied}\nIN WITNESS WHEREOF, the Parties execute this Agreement. Client owns all of Consultant's pre-existing tools.`;
    expect(applyChangesExplainedByAnswers(first, witnessLine, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
  });

  it("reproduces the Harbor first-draft display loss from sanitized committed fixtures", () => {
    const paintedCheck = checkHarborFirstDraftMeaning(HARBOR_SANITIZED_PAINTED_FIRST_DRAFT_MISSING_SCOPE);
    expect(paintedCheck.ok).toBe(false);
    expect(paintedCheck.reasons).toEqual(expect.arrayContaining(["missing_supplied_scope"]));
    expect(paintedCheck.reasons).not.toContain("missing_term_duration");
    expect(HARBOR_SANITIZED_PAINTED_FIRST_DRAFT_MISSING_SCOPE).not.toMatch(/AI workflow implementation/i);
    expect(HARBOR_SANITIZED_PREMIUM_DOCUMENT).toMatch(/AI workflow implementation/i);
    expect(HARBOR_SANITIZED_PREMIUM_DOCUMENT).toMatch(/twelve \(12\) months/i);
  });
});

const VALID_THREE_PARTY = [
  "INTELLECTUAL PROPERTY LICENSE AND ROYALTY AGREEMENT",
  'This Agreement is entered into by and among Stonebridge Wellness LLC ("Licensor"), NovaPath Learning Inc. ("Platform Provider"), and ClearSpring Distribution LLC ("Distributor").',
  "Stonebridge Wellness LLC owns the original wellness training videos and written course materials and keeps ownership of the original content.",
  "NovaPath Learning Inc. will adapt and host the materials on its online training platform and owns the platform code and improvements it creates.",
  "ClearSpring Distribution LLC will market and sell subscriptions, and handle customer contracts, billing, and account management.",
  "Subscription revenue is split 45% to Stonebridge Wellness LLC, 35% to NovaPath Learning Inc., and 20% to ClearSpring Distribution LLC.",
  "This Agreement is governed by the laws of the State of Oklahoma.",
].join("\n");

const VALID_FOUR_PARTY = [
  "PRECISION MEDICINE DATA PLATFORM AGREEMENT",
  "The parties are Lumen Bioinformatics Inc. (Platform Developer), Thalassa Data Systems LLC (Data Infrastructure Provider), Coastal Meridian Analytics LLC (Analytics Integrator), and Vanguard Regulatory Sciences Ltd. (Regulatory Compliance Advisor).",
  "Lumen Bioinformatics Inc. receives $250,000 upon execution, $400,000 upon platform alpha delivery, and $350,000 upon validation report acceptance.",
  "Thalassa Data Systems LLC receives $180,000 upon data pipeline readiness and $220,000 upon production cutover.",
  "Coastal Meridian Analytics LLC receives $150,000 upon analytics module delivery and $175,000 upon user acceptance testing completion.",
  "Vanguard Regulatory Sciences Ltd. receives $95,000 upon regulatory gap assessment and $105,000 upon audit readiness certification.",
  "The initial term is 24 months with two optional 12-month renewals.",
  "Massachusetts law governs without regard to conflict-of-law rules.",
].join("\n");

describe("release-scope three- and four-party customer-meaning checks", () => {
  it("accepts papers that keep party-specific responsibilities and the selected U.S. law", () => {
    expect(checkThreePartyCustomerMeaning(VALID_THREE_PARTY)).toEqual({ ok: true, reasons: [] });
    expect(threePartyPaperReady(VALID_THREE_PARTY)).toBe(true);
    expect(checkFourPartyCustomerMeaning(VALID_FOUR_PARTY, "first")).toEqual({ ok: true, reasons: [] });
    expect(fourPartyFirstDraftReady(VALID_FOUR_PARTY)).toBe(true);
    expect(fourPartyPaperReady(VALID_FOUR_PARTY)).toBe(false);
  });

  it("accepts equivalent wording that keeps the same relationships", () => {
    const equivalent = [
      "This license is among Stonebridge Wellness LLC, NovaPath Learning Inc., and ClearSpring Distribution LLC.",
      "Stonebridge Wellness LLC keeps ownership of the original wellness training materials and is entitled to forty-five percent of subscription revenue.",
      "NovaPath Learning Inc. owns the platform code and receives thirty-five percent.",
      "ClearSpring Distribution LLC handles billing and account management and receives twenty percent.",
      "Oklahoma law governs.",
    ].join("\n");
    expect(checkThreePartyCustomerMeaning(equivalent)).toEqual({ ok: true, reasons: [] });
  });

  it("rejects omitted parties, omitted splits, and substituted governing law", () => {
    const droppedParty = VALID_THREE_PARTY.replace(/ClearSpring Distribution LLC/g, "Western Outlet LLC");
    expect(checkThreePartyCustomerMeaning(droppedParty).reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("missing_party_ClearSpring")]),
    );
    const wrongLaw = VALID_THREE_PARTY.replace("Oklahoma", "Delaware");
    expect(checkThreePartyCustomerMeaning(wrongLaw).reasons).toContain("missing_or_substituted_governing_law");
    const droppedShare = VALID_THREE_PARTY.replace("45%", "50%");
    expect(checkThreePartyCustomerMeaning(droppedShare).reasons).toContain("missing_revenue_share_45");
  });

  it("fails when parties keep every name and number but exchange shares or roles", () => {
    const swappedShares = VALID_THREE_PARTY.replace(
      "45% to Stonebridge Wellness LLC, 35% to NovaPath Learning Inc.",
      "45% to NovaPath Learning Inc., 35% to Stonebridge Wellness LLC",
    );
    expect(checkThreePartyCustomerMeaning(swappedShares).reasons).toEqual(
      expect.arrayContaining([
        "reassigned_or_unbound_stonebridge_share",
        "reassigned_or_unbound_novapath_share",
      ]),
    );
    const swappedRoles = VALID_THREE_PARTY.replace(
      "Stonebridge Wellness LLC owns the original wellness training videos and written course materials and keeps ownership of the original content.",
      "NovaPath Learning Inc. owns the original wellness training videos and written course materials and keeps ownership of the original content.",
    ).replace(
      "NovaPath Learning Inc. will adapt and host the materials on its online training platform and owns the platform code and improvements it creates.",
      "Stonebridge Wellness LLC will adapt and host the materials on its online training platform and owns the platform code and improvements it creates.",
    );
    expect(checkThreePartyCustomerMeaning(swappedRoles).reasons).toEqual(
      expect.arrayContaining([
        "missing_stonebridge_content_ownership",
        "missing_novapath_platform_responsibility",
      ]),
    );
  });

  it("rejects omitted four-party milestones and a substituted state", () => {
    const droppedFee = VALID_FOUR_PARTY.replace("$250,000", "$200,000");
    expect(checkFourPartyCustomerMeaning(droppedFee, "first").reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("missing_lumen_milestone")]),
    );
    const wrongLaw = VALID_FOUR_PARTY.replace("Massachusetts law governs", "Oklahoma law governs");
    expect(checkFourPartyCustomerMeaning(wrongLaw, "first").reasons).toContain(
      "missing_or_substituted_governing_law",
    );
  });

  it("fails when four-party names and amounts remain but milestone recipients are exchanged", () => {
    const swapped = VALID_FOUR_PARTY.replace(
      "Lumen Bioinformatics Inc. receives $250,000",
      "Thalassa Data Systems LLC receives $250,000",
    ).replace(
      "Thalassa Data Systems LLC receives $180,000",
      "Lumen Bioinformatics Inc. receives $180,000",
    );
    expect(checkFourPartyCustomerMeaning(swapped, "first").reasons).toEqual(
      expect.arrayContaining([expect.stringContaining("reassigned_lumen_milestone")]),
    );
  });

  it("rejects an invented first-draft payer and accepts the synthetic payer only after Apply", () => {
    const invented = `${VALID_FOUR_PARTY}\nAcme Holdings LLC shall pay every milestone.`;
    expect(checkFourPartyCustomerMeaning(invented, "first").reasons).toContain("invented_milestone_payer");
    const applied = `${VALID_FOUR_PARTY}\nLumen Bioinformatics Inc. pays each listed milestone amount to the named recipient.`;
    expect(checkFourPartyCustomerMeaning(applied, "applied")).toEqual({ ok: true, reasons: [] });
    expect(fourPartyPaperReady(applied)).toBe(true);
  });
});

