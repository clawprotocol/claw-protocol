import { describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { labeledPartyLegalEntities, parseLabeledPartyBlocks } from "./labeledPartyBlockParse";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";
import {
  formatInstallmentPaymentTermsFromIntake,
  draftPaymentTermsLoseIntakeInstallmentCadence,
} from "./intakeCurrencyParse";
import { resolveSignerCardPartyNames } from "./signerFullLegalName";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import {
  isolateLegalEntityFromContaminatedName,
  isStackedPartyIdentityContamination,
} from "./starterPartyIdentityIsolation";
import { sanitizeStarterPartyNameForDisplay } from "./starterPreviewProseSanitize";
import { TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest371QuadrpartiteRegression.test";

const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";

export const TEST372_FREE_STACKED_PARTY_INTAKE = `Create a services agreement.

Party 1:
${BLUE}
Sarah Mitchell
CEO
sarah@bluecanyonanalytics.com

Party 2:
${HARBOR}
Michael Torres
President
michael@harborpeakautomation.com

Scope: Strategic business consulting and operational planning services.
Payment: $48,000 in monthly installments.
Term: twelve (12) months.
Governing law: Oklahoma.
Effective date: Upon full execution by all parties.`;

const CONTAMINATED_P1 = `${BLUE} Sarah Mitchell CEO sarah`;
const CONTAMINATED_P2 = `${HARBOR} Michael Torres President michael`;

function test372ContaminatedDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    purpose: "Strategic business consulting and operational planning services.",
    payment_terms: "$48,000 upon completion of services",
    duration: "twelve (12) months",
    due_date: null,
    effective_date: "Upon full execution by all parties",
    payment: { amount: 48000, cadence: null, valid: true },
    parties: [
      { name: CONTAMINATED_P1, role: "Client" },
      { name: CONTAMINATED_P2, role: "Service Provider" },
    ],
    agreement_family: "services_agreement",
  };
}

describe("Test372 Free 2-party identity isolation", () => {
  it("parses stacked Party N blocks without Legal Entity labels", () => {
    const blocks = parseLabeledPartyBlocks(TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({
      index: 1,
      legalEntity: BLUE,
      signerName: "Sarah Mitchell",
      signerTitle: "CEO",
      signerEmail: "sarah@bluecanyonanalytics.com",
    });
    expect(blocks[1]).toMatchObject({
      index: 2,
      legalEntity: HARBOR,
      signerName: "Michael Torres",
      signerTitle: "President",
      signerEmail: "michael@harborpeakautomation.com",
    });
    expect(labeledPartyLegalEntities(TEST372_FREE_STACKED_PARTY_INTAKE)).toEqual([BLUE, HARBOR]);
  });

  it("isolates legal entity from contaminated concatenated strings", () => {
    expect(isolateLegalEntityFromContaminatedName(CONTAMINATED_P1)).toBe(BLUE);
    expect(isolateLegalEntityFromContaminatedName(CONTAMINATED_P2)).toBe(HARBOR);
    expect(isStackedPartyIdentityContamination(CONTAMINATED_P1)).toBe(true);
    expect(sanitizeStarterPartyNameForDisplay(CONTAMINATED_P1)).toBe(BLUE);
    expect(sanitizeStarterPartyNameForDisplay(CONTAMINATED_P2)).toBe(HARBOR);
  });

  it("structured intake parties stay clean legal entities", () => {
    const structured = parseIntakeToStructuredAgreement(TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(structured.parties[0]).toBe(BLUE);
    expect(structured.parties[1]).toBe(HARBOR);
    const blob = structured.parties.join(" ");
    expect(blob).not.toMatch(/Sarah Mitchell/i);
    expect(blob).not.toMatch(/Michael Torres/i);
    expect(blob).not.toMatch(/\bsarah\b/i);
    expect(blob).not.toMatch(/\bmichael\b/i);
  });

  it("enrichStarterPreviewPartiesFromIntake replaces contaminated draft party names", () => {
    const enriched = enrichStarterPreviewPartiesFromIntake(
      test372ContaminatedDraft(),
      TEST372_FREE_STACKED_PARTY_INTAKE,
    );
    expect(enriched.parties?.[0]?.name).toBe(BLUE);
    expect(enriched.parties?.[1]?.name).toBe(HARBOR);
  });

  it("preserves monthly installment payment cadence over API completion rewrite", () => {
    expect(formatInstallmentPaymentTermsFromIntake(TEST372_FREE_STACKED_PARTY_INTAKE)).toBe(
      "$48,000 in monthly installments",
    );
    expect(
      draftPaymentTermsLoseIntakeInstallmentCadence(
        "$48,000 upon completion of services",
        TEST372_FREE_STACKED_PARTY_INTAKE,
      ),
    ).toBe(true);
  });

  it("starter preview opening recital, payment, and term sections are clean", () => {
    const preview = buildAgreementPreviewText(test372ContaminatedDraft(), {
      starterPreview: true,
      freeStarterReviewPreview: true,
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
    });
    expect(preview).toMatch(
      new RegExp(`between ${BLUE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\("Client"\\) and ${HARBOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\("Service Provider"\\)`, "i"),
    );
    expect(preview).not.toMatch(/Sarah Mitchell/i);
    expect(preview).not.toMatch(/Michael Torres/i);
    expect(preview).not.toMatch(/\bCEO sarah\b/i);
    expect(preview).not.toMatch(/\bPresident michael\b/i);
    expect(preview).toMatch(/\$48,000 in monthly installments/i);
    expect(preview).not.toMatch(/upon completion of services/i);
    expect(preview).toMatch(/Term:\s*twelve \(12\) months/i);
    expect(preview).toMatch(/Effective Date:\s*upon full execution by both parties/i);
    expect(preview).not.toMatch(/Services Term:\s*twelve \(12\) months\s+Services Term:/i);
  });

  it("signer card party names show legal entities only", () => {
    const names = resolveSignerCardPartyNames({
      parties: test372ContaminatedDraft().parties,
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
    });
    expect(names).toEqual([BLUE, HARBOR]);
    expect(names.join(" ")).not.toMatch(/Sarah Mitchell|Michael Torres|\bsarah\b|\bmichael\b/i);
  });
});

describe("Test371 multi-party gate unaffected", () => {
  it("still gates Test371 quadrpartite labeled intake on free starter", () => {
    const gate = assessStarterComplexityGate(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.reasons).toContain("three_plus_legal_parties");
  });

  it("does not gate Test372 two-party stacked intake", () => {
    const gate = assessStarterComplexityGate(TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(gate.required).toBe(false);
  });
});
