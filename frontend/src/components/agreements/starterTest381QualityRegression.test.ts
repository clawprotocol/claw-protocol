import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { repairFullAgreementPartyIdentity } from "./canonicalPartyIdentityResolver";
import { resolveStarterGatePartyLegalEntities } from "./labeledPartyBlockParse";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  assessStarterComplexityGate,
  rejectIneligibleStarterDraftAfterParse,
} from "./starterMultiPartyProGate";
import { TEST380_TWO_PARTY_CONSULTING_INTAKE } from "./starterTest380TwoPartyConsultingRegression.test";
import { TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE } from "./starterTest379FourPartyLogisticsRegression.test";
import { AGREEMENT_PREVIEW_ESIGN_NOTICE } from "./agreementPreviewConstants";

export const TEST381_SHORT_NAME_CONSULTING_INTAKE = `
Create an agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.

Throughout this agreement Red Mesa and Harbor Peak may be referred to by their short names.

Red Mesa Logistics LLC is hiring Harbor Peak Automation LLC to provide workflow automation consulting services for three months.

Red Mesa will pay Harbor Peak $4,000 per month.

Either party may terminate with 15 days' written notice.

Texas law applies.

Electronic signatures are okay.
`.trim();

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false };

function parseStarterDraft(intake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(
    {
      title: "",
      jurisdiction: "",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    },
    intake,
    true,
    defaultIntakePartyRoleLabels(),
  );
}

function buildStarterPreview(intake: string): string {
  const parsed = parseStarterDraft(intake);
  return buildAgreementPreviewText(parsed, {
    starterPreview: true,
    intakeText: intake,
  });
}

describe("Test381 short-name consulting quality", () => {
  it("remains Starter with two extracted legal entities", () => {
    expect(resolveStarterGatePartyLegalEntities(TEST381_SHORT_NAME_CONSULTING_INTAKE)).toHaveLength(2);
    const gate = assessStarterComplexityGate(TEST381_SHORT_NAME_CONSULTING_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.partyCount).toBe(2);
  });

  it("starter preview uses canonical Client / Service Provider roles", () => {
    const preview = buildStarterPreview(TEST381_SHORT_NAME_CONSULTING_INTAKE);
    expect(preview).toMatch(/\("Client"\)/i);
    expect(preview).toMatch(/\("Service Provider"\)/i);
    expect(preview).not.toMatch(/hiring party/i);
  });

  it("starter preview has professional scope and payment sections", () => {
    const preview = buildStarterPreview(TEST381_SHORT_NAME_CONSULTING_INTAKE);
    expect(preview).toMatch(/workflow automation consulting/i);
    expect(preview).not.toMatch(/Consulting \/ advisory services/i);
    expect(preview).toMatch(/\$4,000/);
    expect(preview).toMatch(/2\.\s+Payment Terms/i);
  });

  it("starter preview has clean termination and separate electronic signature notice", () => {
    const preview = buildStarterPreview(TEST381_SHORT_NAME_CONSULTING_INTAKE);
    expect(preview).not.toMatch(/\.\s*;/);
    expect(preview).toMatch(/5\.\s+Termination/i);
    expect(preview).toMatch(/15\s+calendar\s+day/i);
    expect(preview).toMatch(new RegExp(AGREEMENT_PREVIEW_ESIGN_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    const terminationIdx = preview.search(/5\.\s+Termination/i);
    const esignIdx = preview.search(/executed electronically via LawDog/i);
    expect(terminationIdx).toBeGreaterThanOrEqual(0);
    expect(esignIdx).toBeGreaterThan(terminationIdx);
    const terminationSlice = preview.slice(terminationIdx, esignIdx);
    expect(terminationSlice).not.toMatch(/executed electronically via LawDog/i);
  });

  it("signer authority remains two for Test381", () => {
    const parsed = parseStarterDraft(TEST381_SHORT_NAME_CONSULTING_INTAKE);
    const count = consumeAuthoritativeSignerCount(
      "test381_starter_preview",
      {
        intakeText: TEST381_SHORT_NAME_CONSULTING_INTAKE,
        draftPartyNames: parsed.parties.map((p) => p.name),
        draftParties: parsed.parties,
      },
      2,
    );
    expect(count).toBe(2);
  });

  it("Pro role repair removes hiring party alias contamination", () => {
    const corpus = [
      "CONSULTING AGREEMENT",
      "",
      "hiring party will pay Harbor Peak Automation LLC $4,000 per month.",
      "hiring party grants Service Provider access to systems.",
    ].join("\n");
    const repaired = repairFullAgreementPartyIdentity({
      text: corpus,
      intakeRaw: TEST381_SHORT_NAME_CONSULTING_INTAKE,
      partyNames: ["Red Mesa Logistics LLC", "Harbor Peak Automation LLC"],
    });
    expect(repaired.text).not.toMatch(/hiring party/i);
    expect(repaired.text).toMatch(/Client will pay/i);
  });

  it("has exactly one witness execution block when present in corpus", () => {
    const preview = buildStarterPreview(TEST381_SHORT_NAME_CONSULTING_INTAKE);
    const witnessCount = (preview.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length;
    expect(witnessCount).toBeLessThanOrEqual(1);
  });
});

describe("Test381 regression guards for Test380/379", () => {
  it("Test380 remains Starter with extractedEntityCount 2", () => {
    const gate = assessStarterComplexityGate(TEST380_TWO_PARTY_CONSULTING_INTAKE);
    expect(gate.required).toBe(false);
    expect(gate.partyCount).toBe(2);
    const parsed = parseStarterDraft(TEST380_TWO_PARTY_CONSULTING_INTAKE);
    expect(rejectIneligibleStarterDraftAfterParse(TEST380_TWO_PARTY_CONSULTING_INTAKE, parsed)).toBe(false);
  });

  it("Test379 remains Pro-gated", () => {
    expect(assessStarterComplexityGate(TEST379_FOUR_PARTY_LOGISTICS_PLATFORM_INTAKE).required).toBe(true);
  });
});
