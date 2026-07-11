/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  PAID_PRO_ACCEPTANCE_WITNESS_LINE,
  buildCanonicalExecutionTailFromManifest,
  ensurePaidProAcceptanceExecutionBlockInvariant,
  hasStalePreWitnessExecutionTail,
  removeStalePreWitnessExecutionTail,
} from "./paidProAcceptanceExecutionBlockInvariant";
import { resolveCanonicalPartyIdentitiesFromIntake } from "./canonicalPartyIdentityResolver";
import {
  countPaidProExecutionBlocks,
  analyzePaidProExecutionBlockInvariant,
} from "./paidProExecutionBlockAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST336_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting.`,
  "12 months. Fixed fee of $48,000 paid monthly. Oklahoma law.",
].join(" ");

function test336Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: RED_MESA, role: "Client" },
      { name: HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose: "AI workflow consulting.",
    payment_terms: "Fixed fee of $48,000 paid monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48000, cadence: "monthly", valid: true },
  };
}

function twoPartyRecords() {
  return resolveCanonicalPartyIdentitiesFromIntake(
    TEST336_INTAKE,
    [RED_MESA, HARBOR_PEAK],
    ["Client", "Service Provider"],
  );
}

function fourPartyRecords() {
  const intake = [
    "Agreement among Alpha Labs LLC, Beta Consulting LLC, Gamma Systems LLC, and Delta Holdings LLC.",
    "Alpha Labs LLC: Alice Alpha, CEO",
    "Beta Consulting LLC: Bob Beta, Partner",
    "Gamma Systems LLC: Gina Gamma, Director",
    "Delta Holdings LLC: Dan Delta, President",
  ].join("\n");
  return resolveCanonicalPartyIdentitiesFromIntake(intake, [
    "Alpha Labs LLC",
    "Beta Consulting LLC",
    "Gamma Systems LLC",
    "Delta Holdings LLC",
  ]);
}

function canonicalTwoPartyTail(): string {
  return buildCanonicalExecutionTailFromManifest(twoPartyRecords());
}

function substantivePrefix(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    `Between ${RED_MESA} and ${HARBOR_PEAK}.`,
    "",
    "1. Services. Professional consulting services.",
    "2. Payment. $48,000 monthly.",
    "11.8 Counterparts. The parties may execute using electronic signatures and counterparts in the ordinary course.",
  ].join("\n");
}

function preExecutionFingerprint(text: string): string {
  const idx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const prefix = idx >= 0 ? text.slice(0, idx) : text;
  return fingerprintAgreementBody(prefix.trim());
}

function executionRegion(text: string): string {
  const idx = text.search(/\bIN WITNESS WHEREOF\b/i);
  return idx >= 0 ? text.slice(idx).trim() : "";
}

/** Flattened TEST336 server body with inline stale SIGNATURES before canonical witness. */
function buildTest336FlattenedProCorpus(): string {
  const operative = [
    "SERVICES AGREEMENT",
    'This Services Agreement (the "Agreement") is entered into upon full execution by both parties',
    `by and between ${RED_MESA} and ${HARBOR_PEAK}.`,
    "1. Services",
    "1.1 Scope of Services. Service Provider will provide professional services including AI workflow consulting, implementation support, and automation deployment.",
    "1.2 Standard of Performance. Service Provider will perform the Services in a professional manner.",
    "2. Payment. Client shall pay Service Provider a fixed fee of $48,000 paid monthly.",
    "3. Term. The term is twelve months.",
    "4. Confidentiality. Mutual confidentiality obligations apply to non-public information.",
    "5. Work Product. Client owns final deliverables and work product after payment.",
    "6. Acceptance Review. Client will review deliverables and identify material nonconformity.",
    "7. Termination. Either party may terminate on written notice.",
    "8. Electronic Signatures. The parties may execute using electronic signatures and counterparts.",
    "11.6 Survival. Certain obligations survive termination.",
    "11.7 Governing Law and Venue. This Agreement is governed by Oklahoma law.",
    "11.8 Counterparts and Electronic Signatures. The parties may execute electronically.",
  ].join(" ");

  const staleSig = [
    "SIGNATURES",
    "The parties have caused this Services Agreement to be signed as of the Effective Date.",
    "CLIENT: Red Mesa",
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
    "SERVICE PROVIDER: Harbor Peak",
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
  ].join(" ");

  const lawdogWitness = [
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "PARTY: Red Mesa Logistics LLC",
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
    "PARTY: Harbor Peak Automation LLC",
    "By: __________________________",
    "Name: __________________________",
    "Title: __________________________",
    "Date: _____________________________",
  ].join("\n");

  return `${operative} ${staleSig}\n\n${lawdogWitness}`;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("TEST586 — stale inline execution tail at acceptance", () => {
  it("A — TEST336 raw flattened corpus: one canonical block, stale SIGNATURES removed", () => {
    const raw = buildTest336FlattenedProCorpus();
    const staleIdx = raw.search(/\bSIGNATURES\b\s+The\s+parties\s+have\s+caused/i);
    const substantiveOnly = raw.slice(0, staleIdx).trim();
    const expectedFp = fingerprintAgreementBody(substantiveOnly);
    expect(hasStalePreWitnessExecutionTail(raw)).toBe(true);
    const { text, repairs } = ensurePaidProAcceptanceExecutionBlockInvariant(raw, twoPartyRecords());
    expect(repairs.some((r) => r.includes("stale_execution_tail"))).toBe(true);
    expect(text).not.toMatch(/\bSIGNATURES\b\s+The\s+parties\s+have\s+caused/i);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    expect(analyzePaidProExecutionBlockInvariant(text).ok).toBe(true);
    expect(preExecutionFingerprint(text)).toBe(expectedFp);
  });

  it("B — already-canonical corpus is byte-identical after normalization", () => {
    const healthy = `${substantivePrefix()}\n\n${canonicalTwoPartyTail()}`;
    const first = ensurePaidProAcceptanceExecutionBlockInvariant(healthy, twoPartyRecords());
    const second = ensurePaidProAcceptanceExecutionBlockInvariant(first.text, twoPartyRecords());
    expect(first.text).toBe(healthy);
    expect(second.text).toBe(first.text);
    expect(first.repairs.filter((r) => r.includes("stale_execution_tail"))).toEqual([]);
  });

  it("C — canonical witness plus stale SIGNATURES heading only", () => {
    const staleHeading = [
      substantivePrefix(),
      "",
      "SIGNATURES",
      "",
      canonicalTwoPartyTail(),
    ].join("\n");
    const { text } = ensurePaidProAcceptanceExecutionBlockInvariant(staleHeading, twoPartyRecords());
    expect(text).not.toMatch(/(?:^|\n)\s*SIGNATURES\s*\n/i);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    expect(text).toContain(PAID_PRO_ACCEPTANCE_WITNESS_LINE);
  });

  it("D — canonical block plus incomplete legacy By/Name/Title lines before witness", () => {
    const body = [
      substantivePrefix(),
      "",
      "SIGNATURES",
      "By:",
      "Name:",
      "Title:",
      "",
      canonicalTwoPartyTail(),
    ].join("\n");
    const { text } = ensurePaidProAcceptanceExecutionBlockInvariant(body, twoPartyRecords());
    expect(text).not.toMatch(/\bSIGNATURES\b\s*\n\s*By\s*:/i);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
  });

  it("E — duplicate complete execution blocks dedupe to one canonical block", () => {
    const duped = `${substantivePrefix()}\n\n${canonicalTwoPartyTail()}\n\n${canonicalTwoPartyTail()}`;
    const { text } = ensurePaidProAcceptanceExecutionBlockInvariant(duped, twoPartyRecords());
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    expect(text).toContain(RED_MESA);
    expect(text).toContain(HARBOR_PEAK);
  });

  it("F — four-party execution block preserves order and identities", () => {
    const records = fourPartyRecords();
    const tail = buildCanonicalExecutionTailFromManifest(records);
    const body = `Agreement among four parties.\n\n1. Scope.\n\n${tail}`;
    const { text } = ensurePaidProAcceptanceExecutionBlockInvariant(body, records);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    for (const rec of records) {
      expect(text.toLowerCase()).toContain(rec.fullLegalName.toLowerCase());
    }
    expect(analyzePaidProExecutionBlockInvariant(text, { expectedParties: 4 }).ok).toBe(true);
  });

  it("G — substantive prose referencing signatures is preserved", () => {
    const body = [
      substantivePrefix(),
      "",
      "7. Electronic Signatures. The parties may execute counterparts and signed copies by electronic signature.",
      "",
      canonicalTwoPartyTail(),
    ].join("\n");
    const beforeFp = preExecutionFingerprint(body);
    const { text } = ensurePaidProAcceptanceExecutionBlockInvariant(body, twoPartyRecords());
    expect(text).toMatch(/Electronic Signatures/i);
    expect(preExecutionFingerprint(text)).toBe(beforeFp);
  });

  it("H — counterparts clause immediately before execution block is preserved", () => {
    const body = [
      substantivePrefix(),
      "",
      "11.8 Counterparts. This Agreement may be executed in counterparts.",
      "",
      canonicalTwoPartyTail(),
    ].join("\n");
    const { text } = ensurePaidProAcceptanceExecutionBlockInvariant(body, twoPartyRecords());
    expect(text).toMatch(/Counterparts/i);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
  });

  it("I — no execution block appends canonical tail", () => {
    const noExec = `${substantivePrefix()}\n\nEnd of agreement body without witness.`;
    const { text, repairs } = ensurePaidProAcceptanceExecutionBlockInvariant(noExec, twoPartyRecords());
    expect(repairs.some((r) => r.includes("appended_canonical_tail"))).toBe(true);
    expect(text).toContain(PAID_PRO_ACCEPTANCE_WITNESS_LINE);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
  });

  it("J — ambiguous malformed tail is not destructively deleted", () => {
    const ambiguous = [
      substantivePrefix(),
      "",
      "SIGNATURES",
      "The parties acknowledge receipt of a prior draft signature page.",
      "",
      canonicalTwoPartyTail(),
    ].join("\n");
    const { text, repairs } = ensurePaidProAcceptanceExecutionBlockInvariant(ambiguous, twoPartyRecords());
    expect(text).toMatch(/prior draft signature page/i);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    expect(repairs.filter((r) => r.includes("stale_execution_tail"))).toEqual([]);
  });

  it("K — idempotent: second normalization is byte-identical", () => {
    const raw = buildTest336FlattenedProCorpus();
    const first = ensurePaidProAcceptanceExecutionBlockInvariant(raw, twoPartyRecords());
    const second = ensurePaidProAcceptanceExecutionBlockInvariant(first.text, twoPartyRecords());
    expect(second.text).toBe(first.text);
    expect(second.repairs.filter((r) => r.includes("stale_execution_tail"))).toEqual([]);
  });

  it("L — frozen SoT execution region matches review render after acceptance prep", () => {
    const raw = buildTest336FlattenedProCorpus();
    const prepared = preparePaidProServerDocumentForAcceptance(raw, test336Draft(), TEST336_INTAKE);
    markPaidProPipelineValidationPassed({ text: prepared.text, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: prepared.text,
      source: "server_full_draft",
      draft: test336Draft(),
      intakeText: TEST336_INTAKE,
    });
    const sot = getPaidProSourceOfTruthText();
    const render = resolvePaidProReviewRenderPlain({ draft: test336Draft(), intakeText: TEST336_INTAKE });
    expect(sot).not.toMatch(/\bSIGNATURES\b\s+The\s+parties\s+have\s+caused/i);
    expect(render).not.toMatch(/\bSIGNATURES\b\s+The\s+parties\s+have\s+caused/i);
    expect(countPaidProExecutionBlocks(sot)).toBe(1);
    expect(countPaidProExecutionBlocks(render)).toBe(1);
    expect(hashPaidProCorpus(executionRegion(render))).toBe(hashPaidProCorpus(executionRegion(sot)));
  });

  it("removeStalePreWitnessExecutionTail is safe on canonical-only corpus", () => {
    const healthy = `${substantivePrefix()}\n\n${canonicalTwoPartyTail()}`;
    const once = removeStalePreWitnessExecutionTail(healthy);
    const twice = removeStalePreWitnessExecutionTail(once.text);
    expect(once.text).toBe(healthy);
    expect(twice.text).toBe(once.text);
    expect(once.repairs).toEqual([]);
  });
});
