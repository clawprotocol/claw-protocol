/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgreementPreviewText, buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { labeledPartyLegalEntities, parseLabeledPartyBlocks } from "./labeledPartyBlockParse";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";
import {
  formatInstallmentPaymentTermsFromIntake,
  draftPaymentTermsLoseIntakeInstallmentCadence,
  preserveInstallmentPaymentTermsOnDraft,
  repairStarterPaymentCadenceInPreviewPlain,
  resolveStarterPreviewIntakeText,
} from "./intakeCurrencyParse";
import { resolveFreeStarterReviewBody } from "./freeStarterReviewBodyResolver";
import { writeOriginalUserIntakeRawAtDraftCommit } from "./originalUserIntakeRawStorage";
import { resolveSignerCardPartyNames } from "./signerFullLegalName";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import {
  isolateLegalEntityFromContaminatedName,
  isStackedPartyIdentityContamination,
} from "./starterPartyIdentityIsolation";
import { sanitizeStarterPartyNameForDisplay } from "./starterPreviewProseSanitize";
import { TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE } from "./paidProTest371QuadrpartiteFixtures";
import { resetFreeStarterIdentityTestIsolation } from "./freeStarterIdentityTestIsolation";

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
${BLUE} will pay ${HARBOR} $48,000 in monthly installments.
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
  beforeEach(() => {
    resetFreeStarterIdentityTestIsolation();
  });
  afterEach(() => {
    resetFreeStarterIdentityTestIsolation();
    vi.unstubAllGlobals();
  });

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
    const directional =
      "Blue Canyon Analytics LLC will pay Harbor Peak Automation LLC $48,000 in monthly installments.";
    expect(formatInstallmentPaymentTermsFromIntake(directional)).toMatch(
      /Blue Canyon Analytics LLC will pay Harbor Peak Automation LLC \$48,000 in monthly installments/i,
    );
    expect(formatInstallmentPaymentTermsFromIntake(TEST372_FREE_STACKED_PARTY_INTAKE)).toMatch(
      /\$48,000 in monthly installments/i,
    );
    expect(
      draftPaymentTermsLoseIntakeInstallmentCadence(
        "$48,000 upon completion of services",
        TEST372_FREE_STACKED_PARTY_INTAKE,
      ),
    ).toBe(true);
    const preserved = preserveInstallmentPaymentTermsOnDraft(test372ContaminatedDraft(), TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(preserved.payment_terms).toMatch(/monthly installments/i);
    expect(preserved.payment_terms).not.toMatch(/upon completion/i);
  });

  it("repairs authoritative preview text that dropped monthly installment cadence", () => {
    const corrupted =
      "SERVICES AGREEMENT\n\n2. Payment Terms\n$48,000 upon completion of services.\n\n3. Term: twelve (12) months.";
    const repaired = repairStarterPaymentCadenceInPreviewPlain(corrupted, TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(repaired).toMatch(/monthly installments/i);
    expect(repaired).not.toMatch(/upon completion of services/i);
  });

  it("buildStarterAgreementPreviewForReview uses session intake when step buffer is empty", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    writeOriginalUserIntakeRawAtDraftCommit(TEST372_FREE_STACKED_PARTY_INTAKE);
    const preview = buildStarterAgreementPreviewForReview(test372ContaminatedDraft(), {
      intakeText: "",
    });
    expect(resolveStarterPreviewIntakeText("")).toContain("monthly installments");
    expect(preview).toMatch(/monthly installments/i);
    expect(preview).not.toMatch(/upon completion of services/i);
    vi.unstubAllGlobals();
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

  it("resolveFreeStarterReviewBody prefers monthly installments when step buffer is empty and intake is in session storage", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
    writeOriginalUserIntakeRawAtDraftCommit(TEST372_FREE_STACKED_PARTY_INTAKE);
    const resolved = resolveFreeStarterReviewBody({
      draft: test372ContaminatedDraft(),
      rawIntake: "",
      apiPayload: { payment_terms: "$48,000 upon completion of services" },
      authoritativeBody:
        "SERVICES AGREEMENT\n\n2. Payment Terms\n$48,000 upon completion of services.\n\n3. Services Term and Effective Date\nTerm: twelve (12) months",
    });
    expect(resolved.source).toBe("repaired_starter_preview");
    expect(resolved.usedOriginalRaw).toBe(true);
    expect(resolved.body).toMatch(/monthly installments/i);
    expect(resolved.body).not.toMatch(/upon completion of services/i);
    vi.unstubAllGlobals();
  });

  it("resolveFreeStarterReviewBody repairs authoritative_hydrated body before display when intake declares installments", () => {
    const repairedPreview = buildStarterAgreementPreviewForReview(test372ContaminatedDraft(), {
      intakeText: TEST372_FREE_STACKED_PARTY_INTAKE,
    });
    const authoritativeHydrated =
      "SERVICES AGREEMENT\n\nThis Agreement is between Blue Canyon Analytics LLC (\"Client\") and Harbor Peak Automation LLC (\"Service Provider\").\n\n2. Payment Terms\n$48,000 upon completion of services.\n\n3. Services Term and Effective Date\nTerm: twelve (12) months\nEffective Date: upon full execution by both parties";
    const resolved = resolveFreeStarterReviewBody({
      draft: test372ContaminatedDraft(),
      rawIntake: TEST372_FREE_STACKED_PARTY_INTAKE,
      currentPreview: authoritativeHydrated,
      authoritativeBody: authoritativeHydrated,
      apiPayload: { payment_terms: "$48,000 upon completion of services" },
    });
    expect(resolved.body).toMatch(/monthly installments/i);
    expect(resolved.body).not.toMatch(/upon completion of services/i);
    expect(repairedPreview).toMatch(/monthly installments/i);
  });

  it("infers Client and Service Provider when draft party roles are signer titles", () => {
    const draft: ParsedDraftShape = {
      ...test372ContaminatedDraft(),
      parties: [
        { name: BLUE, role: "CEO" },
        { name: HARBOR, role: "President" },
      ],
    };
    const enriched = enrichStarterPreviewPartiesFromIntake(draft, TEST372_FREE_STACKED_PARTY_INTAKE);
    expect(enriched.parties?.[0]?.role).toBe("Client");
    expect(enriched.parties?.[1]?.role).toBe("Service Provider");
    const preview = resolveFreeStarterReviewBody({
      draft: enriched,
      rawIntake: TEST372_FREE_STACKED_PARTY_INTAKE,
    }).body;
    expect(preview).toMatch(/\("Client"\)/);
    expect(preview).toMatch(/\("Service Provider"\)/);
    expect(preview).not.toMatch(/\("CEO"\)/);
    expect(preview).not.toMatch(/\("President"\)/);
  });

  it("normalizes glued scope and payment headings with separated body blocks", () => {
    const glued = [
      "SERVICES AGREEMENT",
      "",
      `This Agreement is between ${BLUE} ("CEO") and ${HARBOR} ("President").`,
      "",
      "1. Scope of Services / Purpose strategic business consulting and operational planning services.",
      "2. Payment Terms Blue Canyon Analytics LLC will pay Harbor Peak Automation LLC $48,000 in monthly installments.",
      "3. Services Term and Effective Date Term: until null",
    ].join("\n");
    const normalized = resolveFreeStarterReviewBody({
      draft: test372ContaminatedDraft(),
      rawIntake: TEST372_FREE_STACKED_PARTY_INTAKE,
      currentPreview: glued,
    }).body;
    expect(normalized).toMatch(/\("Client"\)/);
    expect(normalized).not.toMatch(/\("CEO"\)|\("President"\)/);
    expect(normalized).toMatch(/\n\n1\.\s+Scope of Services \/ Purpose\n\n/i);
    expect(normalized).toMatch(/\n\n2\.\s+Payment Terms\n\n/i);
    expect(normalized).not.toMatch(/Scope of Services \/ Purpose strategic/i);
    expect(normalized).not.toMatch(/Payment Terms Blue Canyon/i);
    expect(normalized).toMatch(/monthly installments/i);
    expect(normalized).not.toMatch(/\buntil null\b/i);
    expect(normalized).not.toMatch(/\bnull\b/i);
    expect(normalized).toMatch(/twelve \(12\) months/i);
  });

  it("simpleProFinalReviewCorpus does not override free starter rendered preview with longer authoritative body", () => {
    const rendered =
      "SERVICES AGREEMENT\n\n2. Payment Terms\n$48,000 in monthly installments.\n\n3. Term: twelve (12) months.";
    const authoritative =
      "SERVICES AGREEMENT\n\n2. Payment Terms\n$48,000 upon completion of services.\n\n3. Term: twelve (12) months.\n\n4. Governing Law\nOklahoma.\n\n5. Termination\nTerms to be agreed.\n\nSignatures follow.";
    const corpus = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: authoritative,
      renderedPreviewPlain: rendered,
      agreementDocumentPlain: rendered,
      isFreeStarterReview: true,
    });
    expect(corpus.plainText).toBe(rendered);
    expect(corpus.source).toBe("rendered_preview");
    expect(corpus.plainText).toMatch(/monthly installments/i);
    expect(corpus.plainText).not.toMatch(/upon completion of services/i);
  });
});

describe("Test371 multi-party gate unaffected", () => {
  beforeEach(() => {
    resetFreeStarterIdentityTestIsolation();
  });
  afterEach(() => {
    resetFreeStarterIdentityTestIsolation();
  });

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
