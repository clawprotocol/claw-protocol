import { afterEach, describe, expect, it } from "vitest";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import {
  assertClauseFamilyStructuralIntegrityForFreeze,
  validateClauseFamilyStructuralIntegrity,
  validateNoticesClauseFamilyStructuralIntegrity,
} from "./clauseFamilyStructuralIntegrity";
import { countStandaloneClauseFamilyHeadings } from "./clauseFamilyRegistry";
import {
  formatPipelineTraceReport,
  runPaidProAuthoritativePipelineTrace,
} from "./paidProPipelineStageTrace";
import { applyPaidProDocumentBoundaryAuthority } from "./paidProDocumentBoundaryAuthority";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const RED_EMAIL = "contracts@redmesa-logistics.com";
const HARBOR_EMAIL = "legal@harborpeakautomation.com";
const RED_ADDR = "100 Commerce Way, Tulsa, OK 74103";
const HARBOR_ADDR = "250 Innovation Drive, Austin, TX 78701";

const TEST393_INTAKE = [
  `Create a consulting agreement between ${RED} and ${HARBOR}.`,
  `${RED}: Sarah Mitchell, CEO, ${RED_EMAIL}, ${RED_ADDR}`,
  `${HARBOR}: Michael Torres, President, ${HARBOR_EMAIL}, ${HARBOR_ADDR}`,
  "Texas law.",
].join("\n");

function test393Draft(): ParsedDraftShape {
  return {
    title: "Consulting Agreement",
    jurisdiction: "Texas",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Client", email: RED_EMAIL, partyAddress: RED_ADDR } as never,
      { name: HARBOR, role: "Service Provider", email: HARBOR_EMAIL, partyAddress: HARBOR_ADDR } as never,
    ],
    purpose: "Logistics automation consulting services.",
    payment_terms: "Monthly fee.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48000, cadence: "monthly", valid: true },
  };
}

function test393Parties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: HARBOR,
    recipient1Email: RED_EMAIL,
    recipient2Email: HARBOR_EMAIL,
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [RED_ADDR, HARBOR_ADDR],
  }).parties;
}

/** Simulates LLM server_full_draft corruption patterns (generation-origin class). */
function simulatedServerGeneratedMalformedDraft(): string {
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${RED} and ${HARBOR}.`,
    `The parties are the "Parties."1. Services. Provider delivers consulting services.`,
    ...Array.from({ length: 8 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
    "Services already performed.10. Notices",
    `If to ${RED} : ${RED} If to ${HARBOR} :`,
    "",
    "10. GOVERNING LAW",
    "Texas law governs.",
    "",
    "11. GOVERNING LAW AND VENUE",
    "Travis County, Texas.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${RED}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "",
    `SERVICE PROVIDER: ${HARBOR}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n");
}

/** Clean generator output shape (post-prompt hardening target). */
function simulatedServerGeneratedValidDraft(): string {
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
    "",
    "1. Services",
    "Provider will deliver logistics automation consulting services.",
    "",
    "2. Term",
    "Twelve months from the Effective Date.",
    "",
    "3. Payment",
    "Client will pay a fixed monthly fee.",
    "",
    "4. Notices",
    "Notices must be in writing and may be delivered by email or certified mail.",
    "",
    `If to ${RED}:`,
    RED,
    "Attn: Sarah Mitchell, CEO",
    `Email: ${RED_EMAIL}`,
    "Address:",
    "100 Commerce Way",
    "Tulsa, OK 74103",
    "",
    `If to ${HARBOR}:`,
    HARBOR,
    "Attn: Michael Torres, President",
    `Email: ${HARBOR_EMAIL}`,
    "Address:",
    "250 Innovation Drive",
    "Austin, TX 78701",
    "",
    "5. Governing Law",
    "This Agreement is governed by Texas law.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${RED}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "",
    `SERVICE PROVIDER: ${HARBOR}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n");
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("TEST393 — generation authority & clause family structural integrity", () => {
  it("Phase 1 — pipeline trace proves generation-origin corruption at server_full_draft", () => {
    const parties = test393Parties();
    const server = simulatedServerGeneratedMalformedDraft();
    const trace = runPaidProAuthoritativePipelineTrace({
      serverFullDraft: server,
      draft: test393Draft(),
      intakeText: TEST393_INTAKE,
      parties,
    });

    const s1 = trace.stages.find((s) => s.stage === "server_full_draft")!;
    const s2 = trace.stages.find((s) => s.stage === "accepted_corpus")!;
    const s4 = trace.stages.find((s) => s.stage === "pre_sot_freeze")!;

    expect(s1.inlineMalformedNotices).toBe(true);
    expect(s1.clauseFamilyStructuralOk).toBe(false);
    expect(s1.noticesFamilyPreview).toMatch(/If to.*If to/i);
    expect(trace.origin).toBe("generation");
    expect(s4.inlineMalformedNotices).toBe(false);
    expect(s4.clauseFamilyStructuralOk).toBe(true);
    expect(s2.hash).not.toBe(s1.hash);
    expect(formatPipelineTraceReport(trace)).toContain("server_full_draft:");
  });

  it("Phase 2 — malformed Notices cannot pass structural integrity or freeze gate", () => {
    const malformed = simulatedServerGeneratedMalformedDraft();
    const report = validateClauseFamilyStructuralIntegrity(malformed);
    expect(report.ok).toBe(false);
    expect(report.violations.map((v) => v.code)).toContain("inline_malformed_notice_stanzas");

    expect(() =>
      assertClauseFamilyStructuralIntegrityForFreeze(malformed, {
        surface: "test393_block",
      }),
    ).toThrow(/paid-pro-clause-family-structural-blocked/);
  });

  it("Phase 3 — valid generator-shaped draft passes structural validation without repair", () => {
    const valid = simulatedServerGeneratedValidDraft();
    const report = validateNoticesClauseFamilyStructuralIntegrity(valid);
    expect(report).toEqual([]);
    expect(validateClauseFamilyStructuralIntegrity(valid).ok).toBe(true);
  });

  it("Phase 4 — live pipeline path: acceptance → boundary → SoT → review → signer parity", () => {
    const parties = test393Parties();
    setConsumedPaidProSignerMetadataAuthority({ parties, source: "live_ui", hash: "x", updatedAt: 0 });
    const server = simulatedServerGeneratedMalformedDraft();

    const trace = runPaidProAuthoritativePipelineTrace({
      serverFullDraft: server,
      draft: test393Draft(),
      intakeText: TEST393_INTAKE,
      parties,
    });
    const preFreeze = trace.stages.find((s) => s.stage === "pre_sot_freeze")!.len;
    expect(preFreeze).toBeGreaterThan(500);

    const boundary = applyPaidProDocumentBoundaryAuthority(server, {
      draft: test393Draft(),
      intakeText: TEST393_INTAKE,
      parties,
    }).text;
    markPaidProPipelineValidationPassed({ text: boundary, source: "server_full_draft" });

    const record = establishPaidProSourceOfTruth({
      text: server,
      source: "server_full_draft",
      draft: test393Draft(),
      intakeText: TEST393_INTAKE,
    });
    const sot = getPaidProSourceOfTruthText();

    expect(validateClauseFamilyStructuralIntegrity(sot, { parties }).ok).toBe(true);
    expect(sot).toContain(RED_EMAIL);
    expect(hashPaidProCorpus(sot)).toBe(record.hash);

    const review = preparePaidProReviewDisplayPlain(sot).text;
    const signing = finalizePaidProSigningCorpusText(sot, parties, {
      intakeText: TEST393_INTAKE,
      draftPartyNames: [RED, HARBOR],
    }).text;

    expect(validateClauseFamilyStructuralIntegrity(review, { parties }).ok).toBe(true);
    expect(validateClauseFamilyStructuralIntegrity(signing, { parties }).ok).toBe(true);
    expect(auditPaidProReviewRenderSotParity({ reviewPlain: review }).invariantOk).toBe(true);
    expect(countStandaloneClauseFamilyHeadings(sot, "governing_law")).toBeLessThanOrEqual(1);
    expect(trace.stages.find((s) => s.stage === "pre_sot_freeze")!.len).toBeGreaterThan(500);
  });

  it("Phase 5 — structural integrity framework covers governing law and execution families", () => {
    const parties = test393Parties();
    const repaired = applyPaidProDocumentBoundaryAuthority(simulatedServerGeneratedMalformedDraft(), {
      draft: test393Draft(),
      intakeText: TEST393_INTAKE,
      parties,
    }).text;
    const report = validateClauseFamilyStructuralIntegrity(repaired, { parties });
    expect(report.ok).toBe(true);
    expect(report.familyPresence.notices).toBe(true);
    expect(report.familyPresence.governing_law).toBe(true);
    expect(report.familyPresence.execution_block).toBe(true);
  });

  it("accepted corpus alone cannot freeze malformed server draft without boundary repair", () => {
    const server = simulatedServerGeneratedMalformedDraft();
    const accepted = applyAcceptedProCorpusSafeDisplay(server, {
      draft: test393Draft(),
      intakeText: TEST393_INTAKE,
    }).text;
    const acceptedStructural = validateClauseFamilyStructuralIntegrity(accepted);
    if (!acceptedStructural.ok) {
      expect(() =>
        assertClauseFamilyStructuralIntegrityForFreeze(accepted, { surface: "test393" }),
      ).toThrow(/structural-blocked/);
    }
    const boundary = applyPaidProDocumentBoundaryAuthority(accepted, {
      draft: test393Draft(),
      intakeText: TEST393_INTAKE,
      parties: test393Parties(),
    }).text;
    expect(validateClauseFamilyStructuralIntegrity(boundary, { parties: test393Parties() }).ok).toBe(
      true,
    );
  });
});
