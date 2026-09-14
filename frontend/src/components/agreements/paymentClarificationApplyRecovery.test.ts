/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { CORE_PAID_JOURNEY_FILLED_INTAKE } from "../../launch/corePaidJourneyAcceptanceMatrix";
import {
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
});
