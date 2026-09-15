/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../../launch/corePaidJourneyAcceptanceMatrix";
import { RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA } from "../../launch/releaseScopeQualificationCampaign";
import { TEST487_PRODUCTION_INTAKE } from "./paidProTest487ProductionValidationFixtures";
import {
  applySuppliedContentFactsToAuthorizedPaper,
  applySuppliedPaymentFactsToAuthorizedPaper,
  authorizedDraftMatchesAgreement,
  intakeFromAuthorizedDraft,
  paymentApplyPrerequisitesReady,
  resolvePaymentClarificationApplyPrerequisites,
  shouldReparseStructuredDraftFromRecoveredIntake,
} from "./paymentClarificationApplyRecovery";

const AUTHORIZED_DRAFT = {
  id: "agr-saved",
  title: "Consulting Services Agreement",
  purpose: CORE_PAID_JOURNEY_FILLED_INTAKE,
  payment_terms: "",
};

describe("payment clarification apply recovery", () => {
  it("pending answers alone cannot satisfy Apply after a dashboard reset", () => {
    const resolved = resolvePaymentClarificationApplyPrerequisites({
      liveIntake: "",
      storedPaymentIntake: "",
      authorizedDraftIntake: "",
      liveStructuredDraft: null,
      premiumCompletionDraft: null,
      authorizedStructuredDraft: null,
    });
    expect(resolved.intakeText).toBe("");
    expect(resolved.structured).toBeNull();
    expect(resolved.intakeSource).toBe("none");
    expect(resolved.structuredSource).toBe("none");
    expect(paymentApplyPrerequisitesReady(resolved)).toBe(false);
  });

  it("restores intake and structured draft from the authorized GET for the same agreement", () => {
    const resolved = resolvePaymentClarificationApplyPrerequisites({
      liveIntake: "",
      storedPaymentIntake: "",
      authorizedDraftIntake: intakeFromAuthorizedDraft(AUTHORIZED_DRAFT),
      liveStructuredDraft: null,
      premiumCompletionDraft: null,
      authorizedStructuredDraft: AUTHORIZED_DRAFT,
    });
    expect(resolved.intakeText).toContain(CORE_PAID_JOURNEY_FILLED_INTAKE);
    expect(resolved.structured).toEqual(AUTHORIZED_DRAFT);
    expect(resolved.intakeSource).toBe("authorized_draft");
    expect(resolved.structuredSource).toBe("authorized_draft");
    expect(paymentApplyPrerequisitesReady(resolved)).toBe(true);
  });

  it("does not treat a stored pending answer as structured draft", () => {
    const resolved = resolvePaymentClarificationApplyPrerequisites({
      liveIntake: "",
      storedPaymentIntake: CORE_PAID_JOURNEY_FILLED_INTAKE,
      authorizedDraftIntake: "",
      liveStructuredDraft: null,
      premiumCompletionDraft: null,
      authorizedStructuredDraft: null,
    });
    expect(resolved.intakeSource).toBe("stored_payment");
    expect(resolved.structured).toBeNull();
    expect(paymentApplyPrerequisitesReady(resolved)).toBe(false);
  });

  it("does not borrow agreement A’s authorized draft for agreement B", () => {
    expect(authorizedDraftMatchesAgreement({ id: "agr-a" }, "agr-b")).toBe(false);
    expect(authorizedDraftMatchesAgreement({ agreement_id: "agr-b" }, "agr-b")).toBe(true);
    expect(authorizedDraftMatchesAgreement({ purpose: "no id" }, "agr-b")).toBe(true);
  });

  it("reparses when recovered intake is materially richer than the GET draft shell", () => {
    expect(
      shouldReparseStructuredDraftFromRecoveredIntake({
        intakeText: CORE_PAID_JOURNEY_FILLED_INTAKE,
        structured: {
          title: "Consulting Services Agreement",
          purpose: "Biotech, manufacturing, supply-chain, and regulatory services described in this Agreement",
          payment_terms: "Fixed fee $48,000",
        },
      }),
    ).toBe(true);
    expect(
      shouldReparseStructuredDraftFromRecoveredIntake({
        intakeText: CORE_PAID_JOURNEY_FILLED_INTAKE,
        structured: AUTHORIZED_DRAFT,
      }),
    ).toBe(false);
    expect(
      shouldReparseStructuredDraftFromRecoveredIntake({
        intakeText: "",
        structured: null,
      }),
    ).toBe(false);
  });

  it("prefers live create state over stored or GET recovery", () => {
    const live = { title: "live" };
    const resolved = resolvePaymentClarificationApplyPrerequisites({
      liveIntake: "live intake",
      storedPaymentIntake: "stored",
      authorizedDraftIntake: "authorized",
      liveStructuredDraft: live,
      premiumCompletionDraft: { title: "premium" },
      authorizedStructuredDraft: AUTHORIZED_DRAFT,
    });
    expect(resolved.intakeSource).toBe("live");
    expect(resolved.structuredSource).toBe("live");
    expect(resolved.structured).toBe(live);
  });

  it("keeps net-60 in Fees when monthly is glued to 4. TERM", () => {
    const glued = [
      "3. FEES AND PAYMENT Client shall pay a fixed fee of $48,000 for the services. The fee is not a subscription and is not an estimate. Consultant will invoice the fixed fee monthly.4. TERM AND DURATION",
      "The initial term is twelve months beginning October 1, 2026.",
    ].join("\n");
    const out = applySuppliedPaymentFactsToAuthorizedPaper(
      glued,
      CORE_PAID_JOURNEY_FILLED_INTAKE,
      "Payment due net 60",
    );
    const fees = out.split(/4\.\s+/i)[0] || out;
    expect(fees).toMatch(/invoice the fixed fee monthly/i);
    expect(fees).toMatch(/Payment is due net 60/i);
    expect(fees).toMatch(/\$48,000/);
    expect(out).toMatch(/4\.\s+TERM AND DURATION/i);
    expect(out.indexOf("Payment is due net 60")).toBeLessThan(out.search(/4\.\s+TERM AND DURATION/i));
  });

  it("labels the confirmed Effective Date and completion on authorized first-draft paper", () => {
    const firstDraft = [
      "CONSULTING SERVICES AGREEMENT",
      "",
      'This Consulting Services Agreement (this "Agreement") is entered into by and between Harbor Peak Analytics LLC ("Consultant") and Ironvale Manufacturing Inc. ("Client").',
      "",
      "1. PARTIES AND ROLES",
      "",
      "Consultant is an independent professional services firm.",
      "",
      "2. SCOPE OF SERVICES",
      "",
      "Consultant shall perform AI workflow implementation for Client, including discovery, implementation planning, configuration, and knowledge transfer. Consultant shall not invent additional counterparties or change the commercial bargain without a written amendment.",
      "",
      "3. FEES AND PAYMENT",
      "",
      "Client shall pay a fixed fee of $48,000 for the services.",
      "",
      "4. TERM AND DURATION",
      "",
      "The initial term is twelve months beginning October 1, 2026.",
    ].join("\n");
    const answers = [
      "The agreement effective date is the same as the October 1, 2026 service start.",
      "Completion is Client's written confirmation that the implemented AI workflow is in operational use.",
    ].join("\n");
    const out = applySuppliedContentFactsToAuthorizedPaper(
      firstDraft,
      CORE_PAID_JOURNEY_FILLED_INTAKE,
      answers,
    );
    const opening = out.split(/\n\s*1[.)]\s+/)[0] || out.slice(0, 700);
    expect(opening).toMatch(/October 1, 2026 \(the ["']Effective Date["']\)/i);
    expect(opening).not.toMatch(/as of the Effective Date by and between/i);
    expect(out).toMatch(/written confirmation that the implemented AI workflow is in operational use/i);
    expect(out).toMatch(/AI workflow implementation/i);
    expect(out).toMatch(/\$48,000/);
    expect(
      applySuppliedContentFactsToAuthorizedPaper(firstDraft, CORE_PAID_JOURNEY_FILLED_INTAKE, ""),
    ).toBe(firstDraft);
  });

  it("adds net-60 onto authorized monthly paper without dropping monthly", () => {
    const monthly = [
      "CONSULTING SERVICES AGREEMENT",
      "",
      "3. FEES AND PAYMENT",
      "",
      "Client shall pay a fixed fee of $48,000 for the services. The fee is not a subscription and is not an estimate. Consultant will invoice the fixed fee monthly.",
      "",
      "4. TERM AND DURATION",
      "",
      "The initial term is twelve months beginning October 1, 2026.",
    ].join("\n");
    const out = applySuppliedPaymentFactsToAuthorizedPaper(
      monthly,
      CORE_PAID_JOURNEY_FILLED_INTAKE,
      "Invoice monthly\nPayment due net 60",
    );
    expect(out).toMatch(/invoice the fixed fee monthly/i);
    expect(out).toMatch(/Payment is due net 60/i);
    expect(out).toMatch(/\$48,000/);
  });

  it("replaces monthly with the October 1 invoice and net-60 when that is the confirmed answer", () => {
    const monthly = [
      "3. FEES AND PAYMENT",
      "Client shall pay a fixed fee of $48,000 for the services. Consultant will invoice the fixed fee monthly.",
      "4. TERM AND DURATION",
      "The initial term is twelve months beginning October 1, 2026.",
    ].join("\n");
    const out = applySuppliedPaymentFactsToAuthorizedPaper(
      monthly,
      CORE_PAID_JOURNEY_FILLED_INTAKE,
      "Invoice once on October 1, 2026. Payment due net 60.",
    );
    expect(out).toMatch(/once on October 1, 2026/i);
    expect(out).toMatch(/Payment is due net 60/i);
    expect(out).not.toMatch(/invoice the fixed fee monthly/i);
  });

  it("applies the four-party synthetic payer without changing unrelated terms", () => {
    const first = [
      "PRECISION MEDICINE DATA PLATFORM AGREEMENT",
      "The parties are Lumen Bioinformatics Inc. (Platform Developer), Thalassa Data Systems LLC (Data Infrastructure Provider), Coastal Meridian Analytics LLC (Analytics Integrator), and Vanguard Regulatory Sciences Ltd. (Regulatory Compliance Advisor).",
      "3. PAYMENT AND CONSIDERATION",
      "Lumen Bioinformatics Inc. receives $250,000 upon execution, $400,000 upon platform alpha delivery, and $350,000 upon validation report acceptance.",
      "Thalassa Data Systems LLC receives $180,000 upon data pipeline readiness and $220,000 upon production cutover.",
      "Coastal Meridian Analytics LLC receives $150,000 upon analytics module delivery and $175,000 upon user acceptance testing completion.",
      "Vanguard Regulatory Sciences Ltd. receives $95,000 upon regulatory gap assessment and $105,000 upon audit readiness certification.",
      "4. TERM AND DURATION",
      "The initial term is 24 months with two optional 12-month renewals.",
      "11. GOVERNING LAW",
      "Massachusetts law governs without regard to conflict-of-law rules.",
    ].join("\n");
    const out = applySuppliedContentFactsToAuthorizedPaper(
      first,
      TEST487_PRODUCTION_INTAKE,
      RELEASE_SCOPE_FOUR_PARTY_PAYER_ANSWER_TEST_DATA,
    );
    expect(out).toMatch(/Lumen Bioinformatics Inc\. pays each listed milestone amount to the named recipient/);
    expect(out).toMatch(/Thalassa Data Systems LLC receives \$180,000/);
    expect(out).toMatch(/24 months/);
    expect(out).toMatch(/Massachusetts/);
    expect(out).not.toMatch(/Acme Holdings/);
    expect(applySuppliedContentFactsToAuthorizedPaper(first, TEST487_PRODUCTION_INTAKE, "")).toBe(first);
  });
});
