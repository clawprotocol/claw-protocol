/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { normalizeAgreementDraftFromApi } from "../../agreement/agreementDraftNormalize";
import {
  substitutePartyPlaceholdersInUserFacingText,
  textContainsUnresolvedIdentityPlaceholders,
} from "../../agreement/partyPlaceholderDisplay";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { resolveCanonicalPartyIdentitiesFromSources } from "./canonicalPartyIdentityResolver";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { repairExecutionBlockEntityHeadingLines } from "./paidProExecutionBlockEntityHeading";
import {
  resolveSignerSetupPartyIdentities,
  resolveSignerSetupPartyIdentity,
} from "./signerSetupPartyIdentity";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST330_BETWEEN =
  'between Red Mesa Logistics, LLC ("party_a") and Harbor Peak Automation, LLC ("party_b")';

const TEST330_INTAKE = [
  "Create a consulting agreement",
  TEST330_BETWEEN,
  "for AI workflow setup.",
  "Oklahoma law governs.",
].join(" ");

const SIGNER_SLOT_ARGS = {
  sendMode: "review" as const,
  recipientsDeferred: false,
};

function corruptedDraft(): ParsedDraftShape {
  return {
    title: "Consulting Agreement",
    jurisdiction: "Oklahoma",
    parties: [
      { name: "Red Mesa Logistics", role: "party_a" },
      { name: "LLC", role: "party_b" },
      { name: "Harbor Peak Automation", role: "party" },
    ],
    purpose: "AI workflow setup",
    payment_terms: "No fees unless documented separately.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: null, cadence: null, valid: false },
    agreement_family: "services_agreement",
  };
}

function corruptedProCorpus(): string {
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Consulting Agreement (the "Agreement") is entered into by and between Red Mesa Logistics, LLC ("party_b") and Harbor Peak Automation, ("party_b").`,
    `${RED_MESA} and ${HARBOR_PEAK} (collectively, the "Parties").`,
    "",
    "1. Services. Consultant shall provide AI workflow services.",
    "2. Governing Law. This Agreement shall be governed by the laws of Oklahoma.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `PARTY: Red Mesa Logistics`,
    "By: _________________________________",
    "",
    `PARTY: LLC ("party_b") and Harbor Peak Automation`,
    "By: _________________________________",
  ].join("\n");
}

describe("paidProTest330PartySlotExtractionRegression", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("between-clause extraction yields exactly two full legal entities", () => {
    expect(extractBetweenPartyNameList(TEST330_INTAKE)).toEqual([RED_MESA, HARBOR_PEAK]);
  });

  it("canonical party manifest resolves to exactly two parties without LLC slot", () => {
    const records = resolveCanonicalPartyIdentitiesFromSources({
      rawIntake: TEST330_INTAKE,
      starterNames: ["Red Mesa Logistics", "LLC", "Harbor Peak Automation"],
      roleLabels: ["party_a", "party_b", "party"],
    });
    expect(records).toHaveLength(2);
    expect(records[0]?.fullLegalName).toBe(RED_MESA);
    expect(records[1]?.fullLegalName).toBe(HARBOR_PEAK);
    expect(records.map((r) => r.fullLegalName)).not.toContain("LLC");
  });

  it("normalizeAgreementDraftFromApi collapses corrupted API parties to two rows", () => {
    const draft = normalizeAgreementDraftFromApi(
      {
        id: "ag_test330",
        title: "Consulting Agreement",
        jurisdiction: "Oklahoma",
        intake_text: TEST330_INTAKE,
        parties: [
          { name: "Red Mesa Logistics", role: "party_a" },
          { name: "LLC", role: "party_b" },
          { name: "Harbor Peak Automation", role: "party" },
        ],
      },
      { partyNameContext: TEST330_INTAKE },
    );
    expect(draft?.parties).toHaveLength(2);
    expect(draft?.parties[0]?.name).toBe(RED_MESA);
    expect(draft?.parties[1]?.name).toBe(HARBOR_PEAK);
    expect(draft?.parties.map((p) => p.name)).not.toContain("LLC");
  });

  it("free starter preview does not show party_a / party_b placeholders", () => {
    const preview = buildStarterAgreementPreviewForReview(corruptedDraft(), {
      intakeText: TEST330_INTAKE,
    });
    expect(preview).toContain(RED_MESA);
    expect(preview).toContain(HARBOR_PEAK);
    expect(preview).not.toMatch(/party_a|party_b/i);
    expect(preview).not.toMatch(/\("party_[ab]"\)/i);
    expect(textContainsUnresolvedIdentityPlaceholders(preview)).toBe(false);
  });

  it("signer setup legal entity fields show full normalized names for exactly two slots", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: corruptedDraft().parties,
      intakeText: TEST330_INTAKE,
      agreementBodyText: corruptedProCorpus(),
    });
    expect(identities).toHaveLength(2);
    expect(identities[0]?.legalEntityName).toBe(RED_MESA);
    expect(identities[1]?.legalEntityName).toBe(HARBOR_PEAK);

    const slot0 = resolveSignerSetupPartyIdentity({
      partyIndex: 0,
      draftPartyName: "Red Mesa Logistics",
      draftPartyNames: ["Red Mesa Logistics", "LLC", "Harbor Peak Automation"],
      intakeText: TEST330_INTAKE,
      agreementBodyText: corruptedProCorpus(),
      recipientDisplayName: "",
      log: false,
    });
    const slot1 = resolveSignerSetupPartyIdentity({
      partyIndex: 1,
      draftPartyName: "LLC",
      draftPartyNames: ["Red Mesa Logistics", "LLC", "Harbor Peak Automation"],
      intakeText: TEST330_INTAKE,
      agreementBodyText: corruptedProCorpus(),
      recipientDisplayName: "",
      log: false,
    });
    expect(slot0.legalEntityName).toBe(RED_MESA);
    expect(slot1.legalEntityName).toBe(HARBOR_PEAK);
  });

  it("canonical final party manifest and review authority use the same two normalized parties", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      ...SIGNER_SLOT_ARGS,
      partyCount: 2,
      recipient1Name: "Red Mesa Logistics",
      recipient2Name: "LLC",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: ["Red Mesa Logistics", "LLC", "Harbor Peak Automation"],
      partySignerNames: ["", ""],
      extraPartyReviewEmails: [],
      intakeText: TEST330_INTAKE,
    });
    expect(manifest.parties).toHaveLength(2);
    expect(manifest.parties[0]?.partyName).toBe(RED_MESA);
    expect(manifest.parties[1]?.partyName).toBe(HARBOR_PEAK);

    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: RED_MESA,
      recipient2Name: HARBOR_PEAK,
      recipient1Email: "client@example.com",
      recipient2Email: "provider@example.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["", ""],
      partySignerTitles: ["", ""],
      partyAddresses: ["", ""],
    });
    const authorityManifest = buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: TEST330_INTAKE,
    });
    expect(authorityManifest.parties).toHaveLength(2);
    expect(authorityManifest.parties.map((p) => p.partyName)).toEqual([RED_MESA, HARBOR_PEAK]);
  });

  it("execution block headers repair to normalized party entities with one execution block", () => {
    const raw = corruptedProCorpus();
    establishPaidProSourceOfTruth({ text: raw, source: "server_full_draft" });
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: RED_MESA,
      recipient2Name: HARBOR_PEAK,
      recipient1Email: "client@example.com",
      recipient2Email: "provider@example.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["", ""],
      partySignerTitles: ["", ""],
      partyAddresses: ["", ""],
    });
    setConsumedPaidProSignerMetadataAuthority(authority);

    const repairedHeading = repairExecutionBlockEntityHeadingLines(raw, authority.parties);
    const executionOnly = repairedHeading.text.slice(
      repairedHeading.text.search(/\bIN WITNESS WHEREOF\b/i),
    );
    expect(executionOnly).toMatch(new RegExp(`PARTY:\\s*${RED_MESA.replace(/\./g, "\\.")}`, "i"));
    expect(executionOnly).toMatch(/Harbor Peak Automation/i);
    expect(executionOnly).not.toMatch(/LLC\s*\("party_b"\)/i);
    expect(executionOnly).not.toMatch(/party_a|party_b/i);

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: raw,
      authority,
      intakeRaw: TEST330_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: true,
    });
    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);
    expect(hydrated.corpus).toContain(RED_MESA);
    expect(hydrated.corpus).toContain(HARBOR_PEAK);
    expect(hydrated.corpus).not.toMatch(/party_a|party_b/i);
  });

  it("display substitution strips party_a / party_b parentheticals when names are known", () => {
    const raw = `between Red Mesa Logistics ("party_a") and LLC ("party_b").`;
    const display = substitutePartyPlaceholdersInUserFacingText(raw, TEST330_INTAKE, [RED_MESA, HARBOR_PEAK]);
    expect(display).not.toMatch(/party_a|party_b/i);
    expect(display).toContain(RED_MESA);
    expect(display).toContain(HARBOR_PEAK);
  });
});
