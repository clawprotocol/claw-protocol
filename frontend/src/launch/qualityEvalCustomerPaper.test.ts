import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeArticleWhitespace } from "./corePaidJourneyAcceptanceMatrix";
import {
  applyChangesExplainedByAnswers,
  checkHarborAppliedMeaning,
  checkHarborFirstDraftMeaning,
  checkSaasCustomerMeaning,
  consultingPaperReady,
  saasPaperReady,
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
    const dir = join(
      process.cwd(),
      "..",
      "evals/commercial-readiness/results/quality-eval-offline-journey/20260914T182154Z-94311",
    );
    const first = readFileSync(join(dir, "consulting-desktop-first-draft.txt"), "utf8");
    const applied = readFileSync(join(dir, "consulting-desktop-after-apply.txt"), "utf8");
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
          "each party's aggregate liability is limited to the $48,000 fixed fee.",
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
    const dir = join(
      process.cwd(),
      "..",
      "evals/commercial-readiness/results/quality-eval-offline-journey/20260914T182154Z-94311",
    );
    const first = readFileSync(join(dir, "consulting-desktop-first-draft.txt"), "utf8");
    const applied = readFileSync(join(dir, "consulting-desktop-after-apply.txt"), "utf8");
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
    const witnessLine = applied.replace(
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "IN WITNESS WHEREOF, the Parties execute this Agreement. Client owns all of Consultant's pre-existing tools.",
    );
    expect(applyChangesExplainedByAnswers(first, witnessLine, HARBOR_ANSWERS).reasons).toContain(
      "unauthorized_operative_change",
    );
  });

  it("reproduces the live Harbor first-draft display loss offline", () => {
    const dir = join(
      process.cwd(),
      "..",
      "evals/commercial-readiness/results/quality-eval-live/20260914T195201Z-5037",
    );
    const painted = readFileSync(join(dir, "consulting-desktop-first-draft.txt"), "utf8");
    const premium = JSON.parse(readFileSync(join(dir, "consulting-desktop-premium-result.json"), "utf8")) as {
      document_text?: string;
    };
    const paintedCheck = checkHarborFirstDraftMeaning(painted);
    expect(paintedCheck.ok).toBe(false);
    expect(paintedCheck.reasons).toEqual(expect.arrayContaining(["missing_supplied_scope"]));
    expect(paintedCheck.reasons).not.toContain("missing_term_duration");
    expect(painted).not.toMatch(/AI workflow implementation/i);
    expect(premium.document_text || "").toMatch(/AI workflow implementation/i);
    expect(premium.document_text || "").toMatch(/twelve \(12\) months/i);
    expect(checkHarborFirstDraftMeaning(premium.document_text || "").reasons).toContain(
      "invented_effective_date_before_answer",
    );
  });
});
