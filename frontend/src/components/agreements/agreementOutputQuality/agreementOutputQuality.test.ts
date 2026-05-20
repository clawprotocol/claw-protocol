import { describe, expect, it } from "vitest";
import {
  IRONCLAD_JOINT_ROLLOUT_INTAKE,
  IRONCLAD_PARTIES,
  buildIroncladPremiumFullDraftBody,
} from "../../../../e2e/fixtures/ironcladFivePartyRollout";
import { buildAgreementPreviewText } from "../agreementPreviewFromDraft";
import { enrichStarterPreviewPartiesFromIntake } from "../starterOpeningPartyPreserve";
import type { ParsedDraftShape } from "../intakeSmartDefaults";
import { applyPaidProRenderPolish, clearPaidProRenderPolishCacheForTests } from "../paidProRenderPolish";
import { extractIntakeEmailsOrdered } from "../paidProIntakeContactSubstitution";
import { KNOWN_BOILERPLATE_SENTENCES } from "./boilerplateContaminationGuard";
import {
  classifyPremiumCompletionOutcome,
  legacyGenerationOutcomeFromClassification,
} from "./premiumCompletionClassification";
import { finalizeAgreementOutput } from "./agreementOutputQualityPipeline";
import { validateAndRepairFinalRenderIntegrity } from "./finalRenderIntegrityValidator";

const GOOD_FAITH =
  "The Parties shall perform their obligations in good faith and in accordance with this Agreement.";

function ironcladDraft(): ParsedDraftShape {
  return enrichStarterPreviewPartiesFromIntake(
    {
      title: "Joint AI Rollout",
      jurisdiction: "Texas",
      purpose: "Joint AI software rollout.",
      payment_terms: "$187,500 paid over six milestone payments tied to deployment stages.",
      duration: "24 months",
      due_date: "",
      effective_date: "Upon full execution by all parties",
      payment: { amount: 187_500, cadence: null, valid: true },
      parties: IRONCLAD_PARTIES.map((name) => ({ name, role: "party" })),
      agreement_family: "generic_business_agreement",
    },
    IRONCLAD_JOINT_ROLLOUT_INTAKE,
  );
}

describe("agreementOutputQuality (Ironclad five-party)", () => {
  it("free starter preview passes integrity validator with milestone payments", () => {
    const preview = buildAgreementPreviewText(ironcladDraft(), {
      starterPreview: true,
      intakeText: IRONCLAD_JOINT_ROLLOUT_INTAKE,
    });
    expect(preview).not.toMatch(/\bannual payment\b/i);
    expect(preview).toMatch(/six milestone payments/i);
    expect(preview).not.toMatch(/^\s*4\.\s*$/m);
    for (const party of IRONCLAD_PARTIES) {
      expect(preview).toContain(party);
    }
    const integrity = validateAndRepairFinalRenderIntegrity(preview, {
      intakeRaw: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      partyNames: [...IRONCLAD_PARTIES],
      surface: "test_starter",
      tier: "starter",
    });
    expect(integrity.ok).toBe(true);
  });

  it("suppresses repeated good-faith boilerplate in premium polish", () => {
    clearPaidProRenderPolishCacheForTests();
    const contaminated = [buildIroncladPremiumFullDraftBody(), GOOD_FAITH, GOOD_FAITH, GOOD_FAITH].join("\n\n");
    const { text } = applyPaidProRenderPolish(contaminated, IRONCLAD_JOINT_ROLLOUT_INTAKE, [...IRONCLAD_PARTIES], {
      surface: "test",
      skipCache: true,
    });
    const matches = text.match(
      /The Parties shall perform their obligations in good faith and in accordance with this Agreement/gi,
    );
    expect((matches || []).length).toBeLessThanOrEqual(1);
  });

  it("keeps all five party names in premium body after polish", () => {
    clearPaidProRenderPolishCacheForTests();
    const emails = extractIntakeEmailsOrdered(IRONCLAD_JOINT_ROLLOUT_INTAKE);
    expect(emails).toHaveLength(5);
    const { text } = applyPaidProRenderPolish(buildIroncladPremiumFullDraftBody(), IRONCLAD_JOINT_ROLLOUT_INTAKE, [
      ...IRONCLAD_PARTIES,
    ], { surface: "test", skipCache: true });
    for (const party of IRONCLAD_PARTIES) {
      expect(text).toContain(party);
    }
    expect(text).not.toMatch(/\bannual payment\b/i);
  });

  it("classifies long authoritative body with clarifications as non-terminal", () => {
    const body = buildIroncladPremiumFullDraftBody();
    const outcome = classifyPremiumCompletionOutcome({
      documentText: body,
      missingMaterial: ["Confirm SLA uptime target"],
      serverOutcome: "needs_details",
    });
    expect(outcome).toBe("authoritative_draft_complete_with_recommended_clarifications");
    expect(legacyGenerationOutcomeFromClassification(outcome)).toBe("ok");
  });

  it("finalizeAgreementOutput removes known filler duplicates", () => {
    const filler = KNOWN_BOILERPLATE_SENTENCES[0];
    const raw = `1. SCOPE.\nScope text here.\n\n${filler}\n\n${filler}\n\n2. PAYMENT.\nMilestone fees apply.`;
    const out = finalizeAgreementOutput(raw, {
      intakeRaw: IRONCLAD_JOINT_ROLLOUT_INTAKE,
      surface: "test",
      tier: "premium",
    });
    const norm = filler.slice(0, 40);
    const hits = (out.text.toLowerCase().match(new RegExp(norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || [])
      .length;
    expect(hits).toBeLessThanOrEqual(1);
    expect(out.ok).toBe(true);
  });
});
