/**
 * Role alias stress test suite — validates canonical party role authority across lifecycle
 * stages without party/signer inflation or role drift.
 */
import { afterEach, describe, expect, it } from "vitest";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import {
  repairFullAgreementPartyIdentity,
  resolveCanonicalPartyIdentitiesFromIntake,
  type CanonicalPartyIdentityRecord,
} from "./canonicalPartyIdentityResolver";
import { resolveCanonicalPartyRoleLabel } from "./canonicalPartyRoleAuthority";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  authorityPartiesToCanonicalPartyIdentities,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  assessStarterComplexityGate,
  rejectIneligibleStarterDraftAfterParse,
} from "./starterMultiPartyProGate";
import { resolveStarterGatePartyLegalEntities } from "./labeledPartyBlockParse";

export const ROLE_ALIAS_STRESS_CASE_A = `
Create a consulting agreement between Red Mesa Logistics LLC and Harbor Peak Automation LLC.

Red Mesa Logistics LLC is the Client.
Harbor Peak Automation LLC is the Service Provider.

Throughout this agreement, the Client may also be referred to as the Customer.
Throughout this agreement, the Service Provider may also be referred to as the Consultant.

Harbor Peak Automation LLC will provide workflow automation consulting services for three months.

Red Mesa Logistics LLC will pay Harbor Peak Automation LLC $4,000 per month.

Texas law applies.

Electronic signatures are permitted.
`.trim();

export const ROLE_ALIAS_STRESS_CASE_B = `
Create a services agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc.

Blue Canyon Analytics LLC is the Buyer.
Iron Vale Systems Inc. is the Vendor.

Throughout this agreement, the parties may use Buyer and Vendor interchangeably with Customer and Supplier.

Iron Vale Systems Inc. will provide cloud hosting and infrastructure support services.

Blue Canyon Analytics LLC will pay $2,500 per month.

Electronic signatures are permitted.
`.trim();

export const ROLE_ALIAS_STRESS_CASE_C = `
Create a contractor services agreement between Red Mesa Logistics LLC and Blue Canyon Analytics LLC.

Red Mesa Logistics LLC is the Purchaser.
Blue Canyon Analytics LLC is the Contractor.

The Purchaser may also be referred to as the Client.
The Contractor may also be referred to as the Consultant.

The engagement will last six months.

Electronic signatures are permitted.
`.trim();

export const ROLE_ALIAS_STRESS_CASE_D = `
Create a marketing services agreement between Harbor Peak Automation LLC and Iron Vale Systems Inc.

Harbor Peak Automation LLC is the Customer.
Iron Vale Systems Inc. is the Agency.

The Agency will provide marketing strategy, campaign management, and creative services.

The Customer will pay a monthly retainer.

Electronic signatures are permitted.
`.trim();

type RoleAliasStressCase = {
  id: string;
  intake: string;
  party0: string;
  party1: string;
  role0: string;
  role1: string;
  signatureHeading0: string;
  signatureHeading1: string;
};

const STRESS_CASES: RoleAliasStressCase[] = [
  {
    id: "A",
    intake: ROLE_ALIAS_STRESS_CASE_A,
    party0: "Red Mesa Logistics LLC",
    party1: "Harbor Peak Automation LLC",
    role0: "Client",
    role1: "Service Provider",
    signatureHeading0: "CLIENT",
    signatureHeading1: "SERVICE PROVIDER",
  },
  {
    id: "B",
    intake: ROLE_ALIAS_STRESS_CASE_B,
    party0: "Blue Canyon Analytics LLC",
    party1: "Iron Vale Systems Inc",
    role0: "Buyer",
    role1: "Vendor",
    signatureHeading0: "BUYER",
    signatureHeading1: "VENDOR",
  },
  {
    id: "C",
    intake: ROLE_ALIAS_STRESS_CASE_C,
    party0: "Red Mesa Logistics LLC",
    party1: "Blue Canyon Analytics LLC",
    role0: "Purchaser",
    role1: "Contractor",
    signatureHeading0: "PURCHASER",
    signatureHeading1: "CONTRACTOR",
  },
  {
    id: "D",
    intake: ROLE_ALIAS_STRESS_CASE_D,
    party0: "Harbor Peak Automation LLC",
    party1: "Iron Vale Systems Inc",
    role0: "Customer",
    role1: "Agency",
    signatureHeading0: "CUSTOMER",
    signatureHeading1: "AGENCY",
  },
];

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false };

function parseStressDraft(intake: string): ParsedDraftShape {
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

function canonicalRolesFromDraft(parsed: ParsedDraftShape): string[] {
  return (parsed.parties || []).map((p, index) =>
    resolveCanonicalPartyRoleLabel({
      partyIndex: index,
      partyCount: 2,
      explicitRole: p.role,
      agreementFamily: parsed.agreement_family,
      preserveIntakeRole: Boolean((p.role || "").trim() && (p.role || "").trim().toLowerCase() !== "party"),
    }),
  );
}

function signatureHeadingForRole(roleLabel: string): string {
  const r = roleLabel.trim().toLowerCase();
  if (r === "service provider") return "SERVICE PROVIDER";
  return roleLabel.trim().toUpperCase();
}

function buildStressProCorpus(
  records: readonly CanonicalPartyIdentityRecord[],
  headings: readonly [string, string],
): string {
  const [h0, h1] = headings;
  const [r0, r1] = records;
  return [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${r0!.fullLegalName} ("${r0!.roleLabel}") and ${r1!.fullLegalName} ("${r1!.roleLabel}").`,
    "",
    "1. Scope",
    "Provider shall perform professional services described in the intake, including implementation, configuration, and commercially reasonable support.",
    "",
    "2. Fees",
    "Client shall pay the fees stated in the intake as total consideration for the Services.",
    "",
    "3. Confidentiality",
    "Each party protects nonpublic information disclosed in connection with this Agreement.",
    "",
    "4. Governing Law",
    "This Agreement is governed by the laws of the State of Texas.",
    "",
    "5. Termination",
    "Either party may terminate on written notice as stated in the intake.",
    "",
    "IN WITNESS WHEREOF, the parties execute this Agreement.",
    "",
    `${h0}:`,
    r0!.fullLegalName,
    "By: __________________________",
    "Name:",
    "Title:",
    "Date: _____________________________",
    "",
    `${h1}:`,
    r1!.fullLegalName,
    "By: __________________________",
    "Name:",
    "Title:",
    "Date: _____________________________",
  ].join("\n");
}

function assertNoPlaceholderLeakage(text: string): void {
  expect(text).not.toMatch(/\[(?:client|service provider|party|address|tbd)\s*[^\]]*\]/i);
  expect(text).not.toMatch(/hiring party/i);
  expect(text).not.toMatch(/\{\{[^}]+\}\}/);
}

function assertRoleAliasLifecycle(caseDef: RoleAliasStressCase): void {
  const { intake, party0, party1, role0, role1, signatureHeading0, signatureHeading1 } = caseDef;

  expect(resolveStarterGatePartyLegalEntities(intake)).toHaveLength(2);
  const gate = assessStarterComplexityGate(intake);
  expect(gate.required).toBe(false);
  expect(gate.partyCount).toBe(2);

  const structured = parseIntakeToStructuredAgreement(intake);
  expect(structured.parties).toHaveLength(2);
  expect(structured.parties[0]).toMatch(new RegExp(party0.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  expect(structured.parties[1]).toMatch(new RegExp(party1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

  const parsed = parseStressDraft(intake);
  expect(rejectIneligibleStarterDraftAfterParse(intake, parsed)).toBe(false);
  expect(parsed.parties).toHaveLength(2);
  expect(parsed.parties.map((p) => p.name)).toEqual(
    expect.arrayContaining([
      expect.stringMatching(new RegExp(party0.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")),
      expect.stringMatching(new RegExp(party1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")),
    ]),
  );

  const roleLabels = canonicalRolesFromDraft(parsed);
  expect(roleLabels).toEqual([role0, role1]);

  const preview = buildAgreementPreviewText(parsed, { starterPreview: true, intakeText: intake });
  assertNoPlaceholderLeakage(preview);
  expect(preview).toMatch(new RegExp(party0.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  expect(preview).toMatch(new RegExp(party1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  expect(preview).toMatch(new RegExp(`\\("${role0}"\\)`, "i"));
  expect(preview).toMatch(new RegExp(`\\("${role1}"\\)`, "i"));
  const witnessInPreview = (preview.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length;
  expect(witnessInPreview).toBeLessThanOrEqual(1);

  const signerCount = consumeAuthoritativeSignerCount(
    `role_alias_stress_${caseDef.id}`,
    {
      intakeText: intake,
      draftPartyNames: parsed.parties.map((p) => p.name),
      draftParties: parsed.parties,
    },
    2,
  );
  expect(signerCount).toBe(2);

  const identityRecords = resolveCanonicalPartyIdentitiesFromIntake(
    intake,
    parsed.parties.map((p) => p.name),
    roleLabels,
  );
  expect(identityRecords).toHaveLength(2);
  expect(identityRecords[0]?.fullLegalName).toMatch(new RegExp(party0.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  expect(identityRecords[1]?.fullLegalName).toMatch(new RegExp(party1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  expect(identityRecords[0]?.roleLabel).toBe(role0);
  expect(identityRecords[1]?.roleLabel).toBe(role1);

  const contaminated = [
    "SCOPE",
    `hiring party will pay ${party1} per the agreement.`,
    `hiring party grants ${role1} access.`,
  ].join("\n");
  const repaired = repairFullAgreementPartyIdentity({
    text: contaminated,
    intakeRaw: intake,
    partyNames: [party0, party1],
    roleLabels,
  });
  expect(repaired.text).not.toMatch(/hiring party/i);

  const rawCorpus = buildStressProCorpus(identityRecords, [signatureHeading0, signatureHeading1]);
  establishPaidProSourceOfTruth({ text: rawCorpus, source: "server_full_draft" });
  const sotBefore = getPaidProSourceOfTruthText();
  const hashBefore = hashPaidProCorpus(sotBefore);
  expect(hashPaidProCorpus(getPaidProSourceOfTruthText())).toBe(hashBefore);

  const executionInvariant = analyzePaidProExecutionBlockInvariant(sotBefore, { expectedParties: 2 });
  expect(executionInvariant.executionBlockCount).toBe(1);
  expect(executionInvariant.witnessClauseCount).toBe(1);
  expect(executionInvariant.ok).toBe(true);
  expect(sotBefore).toMatch(new RegExp(`${signatureHeading0}:`, "i"));
  expect(sotBefore).toMatch(new RegExp(`${signatureHeading1}:`, "i"));
  expect(sotBefore).toMatch(new RegExp(party0.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+LLC/i, "(?:\\s+LLC)?"), "i"));
  expect(sotBefore).toMatch(new RegExp(party1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+LLC/i, "(?:\\s+LLC)?").replace(/\s+Inc\.?/i, "(?:\\s+Inc\\.?)?"), "i"));
  expect((sotBefore.match(new RegExp(`${signatureHeading0}:`, "gi")) ?? []).length).toBe(1);
  expect((sotBefore.match(new RegExp(`${signatureHeading1}:`, "gi")) ?? []).length).toBe(1);

  const authority = buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 2,
      recipient1Name: identityRecords[0]!.fullLegalName,
      recipient2Name: identityRecords[1]!.fullLegalName,
      recipient1Email: "party0@example.com",
      recipient2Email: "party1@example.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Signer One", "Signer Two"],
      partySignerTitles: ["CEO", "President"],
      partyAddresses: ["100 Main St", "200 Oak Ave"],
    },
    "live_ui",
    { intakeText: intake, draftPartyNames: parsed.parties.map((p) => p.name) },
  );
  expect(authority.parties).toHaveLength(2);

  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties, {
    intakeText: intake,
    draftPartyNames: parsed.parties.map((p) => p.name),
    acceptedCorpus: sotBefore,
  });
  expect(identities).toHaveLength(2);
  expect(identities[0]?.blockHeading).toBe(signatureHeading0);
  expect(identities[1]?.blockHeading).toBe(signatureHeading1);
  expect(identities.map((id) => signatureHeadingForRole(id.blockHeading))).toEqual([
    signatureHeading0,
    signatureHeading1,
  ]);

  const manifest = resolveCanonicalFinalPartyManifest({
    partyCount: 2,
    recipient1Name: identityRecords[0]!.fullLegalName,
    recipient2Name: identityRecords[1]!.fullLegalName,
    recipient1Email: "party0@example.com",
    recipient2Email: "party1@example.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Signer One", "Signer Two"],
    partySignerTitles: ["CEO", "President"],
    draftPartyNames: parsed.parties.map((p) => p.name),
    draftPartyRoles: parsed.parties.map((p) => p.role),
    intakeText: intake,
    sendMode: "signature",
    recipientsDeferred: false,
  });
  expect(manifest.parties).toHaveLength(2);
  expect(manifest.parties[0]?.roleLabel).toBe(role0);
  expect(manifest.parties[1]?.roleLabel).toBe(role1);
  expect(manifest.parties[0]?.partyName).toMatch(new RegExp(party0.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  expect(manifest.parties[1]?.partyName).toMatch(new RegExp(party1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

  const manifestFromAuthority = buildCanonicalFinalPartyManifestFromAuthority(authority, {
    intakeText: intake,
    draftPartyNames: parsed.parties.map((p) => p.name),
  });
  expect(manifestFromAuthority.parties).toHaveLength(2);
  expect(manifestFromAuthority.parties[0]?.roleLabel).toBe(role0);
  expect(manifestFromAuthority.parties[1]?.roleLabel).toBe(role1);
}

describe("Role alias stress test suite", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it.each(STRESS_CASES)("case $id preserves party authority across lifecycle", (caseDef) => {
    assertRoleAliasLifecycle(caseDef);
  });

  it("case A does not treat Customer or Consultant aliases as separate parties", () => {
    const parsed = parseStressDraft(ROLE_ALIAS_STRESS_CASE_A);
    expect(parsed.parties).toHaveLength(2);
    const preview = buildAgreementPreviewText(parsed, {
      starterPreview: true,
      intakeText: ROLE_ALIAS_STRESS_CASE_A,
    });
    expect(preview).not.toMatch(/\("Customer"\)/i);
    expect(preview).not.toMatch(/\("Consultant"\)/i);
    expect(preview).toMatch(/\("Client"\)/i);
    expect(preview).toMatch(/\("Service Provider"\)/i);
  });

  it("case B preserves Buyer/Vendor without Customer/Supplier defined-term drift", () => {
    const parsed = parseStressDraft(ROLE_ALIAS_STRESS_CASE_B);
    const roles = canonicalRolesFromDraft(parsed);
    expect(roles).toEqual(["Buyer", "Vendor"]);
    const preview = buildAgreementPreviewText(parsed, {
      starterPreview: true,
      intakeText: ROLE_ALIAS_STRESS_CASE_B,
    });
    expect(preview).toMatch(/\("Buyer"\)/i);
    expect(preview).toMatch(/\("Vendor"\)/i);
    expect(preview).not.toMatch(/\("Supplier"\)/i);
  });
});
