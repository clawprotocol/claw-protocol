import { afterEach, describe, expect, it } from "vitest";
import {
  repairCanonicalPartyIdentityInCorpus,
  resolveCanonicalPartyIdentitiesFromIntake,
} from "./canonicalPartyIdentityResolver";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";
import { detectExecutionBlockRoleInversion } from "./paidProAcceptedCorpusPartyRoles";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  detectOpeningRecitalRoleLabelInversion,
  openingRoleLabelsMatch,
  repairOpeningRecitalRoleLabelsFromManifest,
} from "./paidProOpeningRoleLabelConsistency";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import {
  PAID_PRO_HARDENING_CLIENT,
  PAID_PRO_HARDENING_PROVIDER,
} from "./qa/paidProHardening/paidProHardeningFixtures";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const CONSULTING_INTAKE =
  "Mutual consulting agreement between Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider). Fixed fee $8,500.";

const PURCHASE_PARTIES: ParsedDraftShape["parties"] = [
  { name: "Northwind Retail LLC", role: "Buyer" },
  { name: "Summit Supply Co. Inc.", role: "Seller" },
];

const LOAN_PARTIES: ParsedDraftShape["parties"] = [
  { name: "First Harbor Credit Union", role: "Lender" },
  { name: "Oak Street Properties LLC", role: "Borrower" },
];

const LEASE_PARTIES: ParsedDraftShape["parties"] = [
  { name: "Riverside Holdings LLC", role: "Landlord" },
  { name: "Peak Fitness Studio LLC", role: "Tenant" },
];

function executionTail(clientName: string, providerName: string): string {
  return [
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    clientName,
    "By: __________________________",
    "",
    "SERVICE PROVIDER:",
    providerName,
    "By: __________________________",
  ].join("\n");
}

function recordsForParties(
  parties: ParsedDraftShape["parties"],
  intake: string,
): ReturnType<typeof resolveCanonicalPartyIdentitiesFromIntake> {
  const names = parties.map((p) => p.name);
  const roles = parties.map((p) => p.role);
  return resolveCanonicalPartyIdentitiesFromIntake(intake, names, roles);
}

describe("paidProOpeningRoleLabelConsistency", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("openingRoleLabelsMatch treats provider shorthand as Service Provider", () => {
    expect(openingRoleLabelsMatch("Service Provider", "Provider")).toBe(true);
    expect(openingRoleLabelsMatch("Client", "Service Provider")).toBe(false);
  });

  it("manifest binds party names to draft role labels in order", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(
      CONSULTING_INTAKE,
      [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      ["Client", "Service Provider"],
    );
    expect(records[0]?.fullLegalName).toBe(PAID_PRO_HARDENING_CLIENT);
    expect(records[0]?.roleLabel).toBe("Client");
    expect(records[1]?.fullLegalName).toBe(PAID_PRO_HARDENING_PROVIDER);
    expect(records[1]?.roleLabel).toBe("Service Provider");
  });

  it("consulting: repairs inverted Client / Service Provider parentheticals in opening", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(
      CONSULTING_INTAKE,
      [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      ["Client", "Service Provider"],
    );
    const invertedOpening = `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Service Provider") and ${PAID_PRO_HARDENING_PROVIDER} ("Client").`;
    const tail = executionTail(PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER);
    const corpus = `${invertedOpening}\n\n1. Scope.\n${tail}`;

    expect(detectOpeningRecitalRoleLabelInversion(corpus, records)).toBe(true);
    const { text, repairs } = repairOpeningRecitalRoleLabelsFromManifest(corpus, records);
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).toContain(`${PAID_PRO_HARDENING_CLIENT} ("Client")`);
    expect(text).toContain(`${PAID_PRO_HARDENING_PROVIDER} ("Service Provider")`);
    expect(text).not.toContain(`${PAID_PRO_HARDENING_CLIENT} ("Service Provider")`);
    expect(text.slice(text.indexOf("IN WITNESS")).trim()).toBe(tail.trim());
  });

  it("purchase: repairs inverted Buyer / Seller labels", () => {
    const intake = "Asset purchase between Northwind Retail LLC and Summit Supply Co. Inc.";
    const records = recordsForParties(PURCHASE_PARTIES, intake);
    const body = [
      "ASSET PURCHASE AGREEMENT",
      "",
      'This Agreement is between Northwind Retail LLC ("Seller") and Summit Supply Co. Inc. ("Buyer").',
      "",
      "1. Purchase Price.",
    ].join("\n");
    const { text } = repairOpeningRecitalRoleLabelsFromManifest(body, records);
    expect(text).toContain('Northwind Retail LLC ("Buyer")');
    expect(text).toContain('Summit Supply Co. Inc. ("Seller")');
  });

  it("loan: repairs inverted Lender / Borrower labels", () => {
    const intake = "Promissory note between First Harbor Credit Union and Oak Street Properties LLC.";
    const records = recordsForParties(LOAN_PARTIES, intake);
    expect(records).toHaveLength(2);
    expect(records[1]?.roleLabel).toBe("Borrower");
    expect(records[1]?.fullLegalName).toBe("Oak Street Properties LLC");
    const body =
      'This Loan Agreement is between First Harbor Credit Union ("Borrower") and Oak Street Properties LLC ("Lender").\n\n1. Principal.';
    const { text, repairs } = repairOpeningRecitalRoleLabelsFromManifest(body, records);
    expect(repairs.some((r) => r.includes("Borrower"))).toBe(true);
    expect(text).toContain('First Harbor Credit Union ("Lender")');
    expect(text).toContain('Oak Street Properties LLC ("Borrower")');
  });

  it("lease: repairs inverted Landlord / Tenant labels", () => {
    const intake = "Commercial lease between Riverside Holdings LLC and Peak Fitness Studio LLC.";
    const records = recordsForParties(LEASE_PARTIES, intake);
    const body =
      'This Lease is between Riverside Holdings LLC ("Tenant") and Peak Fitness Studio LLC ("Landlord").\n\n1. Premises.';
    const { text } = repairOpeningRecitalRoleLabelsFromManifest(body, records);
    expect(text).toContain('Riverside Holdings LLC ("Landlord")');
    expect(text).toContain('Peak Fitness Studio LLC ("Tenant")');
  });

  it("leaves already-correct consulting labels unchanged", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(
      CONSULTING_INTAKE,
      [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      ["Client", "Service Provider"],
    );
    const correct = `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").\n\n1. Scope.`;
    const { text, repairs } = repairOpeningRecitalRoleLabelsFromManifest(correct, records);
    expect(repairs).toEqual([]);
    expect(text).toBe(correct);
  });

  it("repairCanonicalPartyIdentityInCorpus fixes inversion before acceptance prep", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(
      CONSULTING_INTAKE,
      [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      ["Client", "Service Provider"],
    );
    const draft = `${PAID_PRO_HARDENING_CLIENT} ("Service Provider") and ${PAID_PRO_HARDENING_PROVIDER} ("Client").\n\n1. Fees.`;
    const { text, repairs } = repairCanonicalPartyIdentityInCorpus(draft, records, {
      intakeRaw: CONSULTING_INTAKE,
    });
    expect(repairs.some((r) => r.startsWith("opening_role_label:"))).toBe(true);
    expect(text).toContain('("Client")');
    expect(text).toContain('("Service Provider")');
  });

  it("preparePaidProServerDocumentForAcceptance clears opening inversion using draft roles", () => {
    const draft: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "DE",
      parties: [
        { name: PAID_PRO_HARDENING_CLIENT, role: "Client" },
        { name: PAID_PRO_HARDENING_PROVIDER, role: "Service Provider" },
      ],
      purpose: "Consulting",
      payment_terms: "$8,500",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    };
    const raw = `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Service Provider") and ${PAID_PRO_HARDENING_PROVIDER} ("Client").\n\n1. Scope.\n\n2. Payment.`;
    const { text, repairs } = preparePaidProServerDocumentForAcceptance(raw, draft, CONSULTING_INTAKE);
    expect(repairs.some((r) => r.startsWith("opening_role_label:"))).toBe(true);
    expect(text).toContain('("Client")');
    expect(text).toContain('("Service Provider")');
  });

  it("execution block count and placement unchanged when only opening roles were inverted", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(
      CONSULTING_INTAKE,
      [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      ["Client", "Service Provider"],
    );
    const tail = executionTail(PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER);
    const before = `Intro ${PAID_PRO_HARDENING_CLIENT} ("Service Provider") and ${PAID_PRO_HARDENING_PROVIDER} ("Client").\n\n1. Scope.${tail}`;
    const beforeNorm = enforcePaidProSingleExecutionBlock(before).text;
    const witnessBefore = beforeNorm.indexOf("IN WITNESS");
    const { text: after } = repairOpeningRecitalRoleLabelsFromManifest(before, records);
    const afterNorm = enforcePaidProSingleExecutionBlock(after).text;
    expect(afterNorm.slice(afterNorm.indexOf("IN WITNESS"))).toBe(beforeNorm.slice(witnessBefore));
    expect((afterNorm.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(
      (beforeNorm.match(/\bIN WITNESS WHEREOF\b/gi) || []).length,
    );
  });

  it("frozen SoT hash unchanged when no opening repair runs post-accept", () => {
    const accepted = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
      "",
      "1. Scope.",
      executionTail(PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER),
    ].join("\n");
    establishPaidProSourceOfTruth({ text: accepted, source: "server_full_draft" });
    const hashBefore = hashPaidProCorpus(getPaidProSourceOfTruthText());
    const hashAfter = hashPaidProCorpus(getPaidProSourceOfTruthText());
    expect(hashAfter).toBe(hashBefore);
  });

  it("recital repair path fixes secondary inverted recital before section 1", () => {
    const records = resolveCanonicalPartyIdentitiesFromIntake(
      CONSULTING_INTAKE,
      [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      ["Client", "Service Provider"],
    );
    const body = [
      `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
      "",
      `RECITAL. ${PAID_PRO_HARDENING_CLIENT} ("Service Provider") and ${PAID_PRO_HARDENING_PROVIDER} ("Client") agree.`,
      "",
      "1. Scope.",
    ].join("\n");
    const { text } = repairOpeningRecitalRoleLabelsFromManifest(body, records);
    expect(text).toContain(`${PAID_PRO_HARDENING_CLIENT} ("Client")`);
    expect(text).not.toContain(`${PAID_PRO_HARDENING_CLIENT} ("Service Provider")`);
    const recitalPath = repairMalformedPaidProAgreementRecital(text);
    expect(recitalPath.text).toContain('("Client")');
  });

  it("does not treat swapped execution blocks as opening-only inversion", () => {
    const swappedTail = [
      `This Agreement is between ${PAID_PRO_HARDENING_CLIENT} ("Client") and ${PAID_PRO_HARDENING_PROVIDER} ("Service Provider").`,
      "",
      "1. Scope.",
      executionTail(PAID_PRO_HARDENING_PROVIDER, PAID_PRO_HARDENING_CLIENT),
    ].join("\n");
    expect(detectExecutionBlockRoleInversion(swappedTail)).toBe(true);
  });
});
