import { afterEach, describe, expect, it } from "vitest";
import {
  PAID_PRO_ACCEPTANCE_WITNESS_LINE,
  buildCanonicalExecutionTailFromManifest,
  ensurePaidProAcceptanceExecutionBlockInvariant,
} from "./paidProAcceptanceExecutionBlockInvariant";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { resolveCanonicalPartyIdentitiesFromIntake } from "./canonicalPartyIdentityResolver";
import {
  countPaidProExecutionBlocks,
  analyzePaidProExecutionBlockInvariant,
} from "./paidProExecutionBlockAuthority";
import { countWitnessExecutionSections } from "./paidProSignerSigningCorpusHygiene";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";

const INTAKE =
  "Mutual consulting agreement between Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider). Fixed fee $8,500 Delaware.";

const DRAFT: ParsedDraftShape = {
  title: "Mutual Consulting and Implementation Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
    { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
  ],
  purpose: "AI workflow implementation",
  payment_terms: "$8,500",
  duration: null,
  due_date: null,
  effective_date: null,
  payment: { amount: null, cadence: null, valid: false },
};

function manifestRecords() {
  return resolveCanonicalPartyIdentitiesFromIntake(
    INTAKE,
    [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
    ["Client", "Service Provider"],
  );
}

/** Test250-style corpus: long services agreement ending at 10.7 with no witness/signature tail. */
function test250StyleServerBodyWithoutExecution(): string {
  const clause =
    "The Parties will perform in a professional and workmanlike manner with commercially reasonable cooperation.";
  const sections: string[] = [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
    "",
  ];
  for (let i = 1; i <= 10; i += 1) {
    sections.push(
      `${i}. Section ${i}.`,
      `${clause} Additional operative detail for section ${i} including scope, fees, confidentiality, and compliance obligations.`,
      "",
    );
  }
  sections.push(
    "10.5 Entire Agreement; Amendments.",
    "This Agreement is the entire agreement between the Parties.",
    "",
    "10.6 Severability; Waiver.",
    "Invalid provisions are severed; waivers must be in writing.",
    "",
    "10.7 Counterparts; Electronic Signatures.",
    "Counterparts and electronic signatures are effective and binding.",
  );
  let body = sections.join("\n");
  while (body.length < 12_000) {
    body += `\n\n${clause}`;
  }
  expect(body).not.toMatch(/\bIN WITNESS WHEREOF\b/i);
  return body;
}

function healthyCorpusWithSingleExecution(): string {
  const tail = buildCanonicalExecutionTailFromManifest(manifestRecords());
  return [
    `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
    "",
    "1. Scope of Services.",
    "Professional services as described in the Statement of Work.",
    "",
    "2. Fees and Payment.",
    "Client will pay the agreed fixed fee.",
    "",
    tail,
  ].join("\n");
}

describe("paidProAcceptanceExecutionBlockInvariant", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("appends canonical execution tail when server_full_draft has no witness block", () => {
    const records = manifestRecords();
    const raw = test250StyleServerBodyWithoutExecution();
    const { text, repairs } = ensurePaidProAcceptanceExecutionBlockInvariant(raw, records);
    expect(repairs.some((r) => r.includes("appended_canonical_tail"))).toBe(true);
    expect(text).toContain(PAID_PRO_ACCEPTANCE_WITNESS_LINE);
    expect(text).toContain("CLIENT:");
    expect(text).toContain(PAID_PRO_HARDENING_CLIENT);
    expect(text).toContain("SERVICE PROVIDER:");
    expect(text).toContain(PAID_PRO_HARDENING_PROVIDER);
    expect(text).toContain("Email for Notice:");
    expect(countWitnessExecutionSections(text)).toBe(1);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    expect(analyzePaidProExecutionBlockInvariant(text).ok).toBe(true);
    const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
    const section107 = text.search(/10\.7 Counterparts/i);
    expect(witnessIdx).toBeGreaterThan(section107);
  });

  it("preparePaidProServerDocumentForAcceptance repairs Test250-style body before acceptance", () => {
    const raw = test250StyleServerBodyWithoutExecution();
    const { text, repairs } = preparePaidProServerDocumentForAcceptance(raw, DRAFT, INTAKE);
    expect(repairs.some((r) => r.includes("acceptance_execution_block"))).toBe(true);
    expect(countWitnessExecutionSections(text)).toBe(1);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
  });

  it("frozen SoT after establish has witnessCount 1 and executionBlockCount 1", () => {
    const raw = test250StyleServerBodyWithoutExecution();
    const prepared = preparePaidProServerDocumentForAcceptance(raw, DRAFT, INTAKE);
    establishPaidProSourceOfTruth({
      text: prepared.text,
      source: "server_full_draft",
      draft: DRAFT,
      intakeText: INTAKE,
    });
    const sot = getPaidProSourceOfTruthText();
    expect(countWitnessExecutionSections(sot)).toBe(1);
    expect(countPaidProExecutionBlocks(sot)).toBe(1);
    expect(sot).toContain("CLIENT:");
    expect(sot).toContain("SERVICE PROVIDER:");
  });

  it("leaves an already-canonical single execution block unchanged through prepare on long services body", () => {
    const prefix = test250StyleServerBodyWithoutExecution();
    const healthy = `${prefix}\n\n${buildCanonicalExecutionTailFromManifest(manifestRecords())}`;
    expect(countPaidProExecutionBlocks(healthy)).toBe(1);
    const { text, repairs } = preparePaidProServerDocumentForAcceptance(healthy, DRAFT, INTAKE);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
    expect(countWitnessExecutionSections(text)).toBe(1);
    expect(repairs.some((r) => r.includes("acceptance_execution_block:appended"))).toBe(false);
    expect(repairs.filter((r) => r.startsWith("acceptance_execution_block:"))).toEqual([]);
    expect(text).toContain(PAID_PRO_HARDENING_CLIENT);
    expect(text).toContain(PAID_PRO_HARDENING_PROVIDER);
    expect(text).toMatch(/10\.7 Counterparts/i);
  });

  it("does not duplicate execution block when one witness tail already exists", () => {
    const healthy = healthyCorpusWithSingleExecution();
    const duped = `${healthy}\n\n${PAID_PRO_ACCEPTANCE_WITNESS_LINE}\n\nCLIENT:\nExtra\nBy: ___\n`;
    const { text } = ensurePaidProAcceptanceExecutionBlockInvariant(duped, manifestRecords());
    expect(countWitnessExecutionSections(text)).toBe(1);
    expect(countPaidProExecutionBlocks(text)).toBe(1);
  });

  it("post-freeze review render stays hash-identical to SoT after execution append at accept", () => {
    const raw = test250StyleServerBodyWithoutExecution();
    establishPaidProSourceOfTruth({
      text: raw,
      source: "server_full_draft",
      draft: DRAFT,
      intakeText: INTAKE,
    });
    const sotHash = hashPaidProCorpus(getPaidProSourceOfTruthText());
    const renderPlain = resolvePaidProReviewRenderPlain({ draft: DRAFT, intakeText: INTAKE });
    expect(hashPaidProCorpus(renderPlain)).toBe(sotHash);
    const polished = polishProAgreementDisplayLayer(renderPlain, { reviewDisplayMode: true });
    expect(hashPaidProCorpus(polished.text)).toBe(sotHash);
  });

  it("safe display path appends execution before enforce when witness missing", () => {
    const raw = test250StyleServerBodyWithoutExecution();
    const safe = applyAcceptedProCorpusSafeDisplay(raw, { draft: DRAFT, intakeText: INTAKE });
    expect(safe.repairs.some((r) => r.includes("acceptance_execution_block"))).toBe(true);
    expect(countPaidProExecutionBlocks(safe.text)).toBe(1);
  });
});
