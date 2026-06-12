/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import {
  collapseDraftPartyRows,
  isInvalidPartySlotLegalEntity,
  resolveAuthoritativePartySlotCount,
} from "./partySlotIdentityNormalize";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { mergePremiumDraftPartiesWithRecipientPriority } from "./reviewPlaceholderGuard";
import {
  resolvePaidProSignerDetailsGate,
  resolveSignerSetupPartyIdentities,
} from "./signerSetupPartyIdentity";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST333_INTAKE = [
  "Create a consulting agreement",
  `between ${RED_MESA} and ${HARBOR_PEAK}`,
  "for AI workflow consulting, implementation support, process documentation, configuration assistance, and training services.",
  "The engagement term is 12 months.",
  "Sarah Mitchell will sign for Harbor Peak Automation LLC.",
  "Oklahoma law governs.",
].join(" ");

const SIGNER_SLOT_ARGS = {
  sendMode: "review" as const,
  recipientsDeferred: false,
};

function corruptedPremiumDraft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    parties: [
      { name: RED_MESA, role: "client" },
      { name: "implementation support", role: "party" },
      { name: "process documentation", role: "party" },
      { name: "configuration assistance", role: "party" },
      {
        name: "training services. The engagement term is 12 months. Sarah Mitchell will sign",
        role: "party",
      },
    ],
    purpose: "AI workflow consulting",
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
    "SERVICES AGREEMENT",
    "",
    `This Services Agreement (the "Agreement") is entered into by and between ${RED_MESA} and Harbor Peak Automation . Harbor Peak Automation will provide AI workflow consulting ("party") and implementation support ("party").`,
    `Consultant will provide AI workflow consulting, implementation support, process documentation, configuration assistance, and training services to Client over a 12-month engagement term.`,
    "",
    "1. Scope. Consultant shall provide the services described above.",
    "2. Governing Law. Oklahoma.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `PARTY: ${RED_MESA}`,
    "By: _________________________________",
    "",
    "PARTY: Harbor Peak Automation",
    "By: _________________________________",
  ].join("\n");
}

describe("paidProTest333PartySlotRegression", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("free intake manifest resolves exactly two authoritative legal entities", () => {
    expect(extractBetweenPartyNameList(TEST333_INTAKE)).toEqual([RED_MESA, HARBOR_PEAK]);
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: TEST333_INTAKE,
        draftPartyNames: corruptedPremiumDraft().parties.map((p) => p.name),
        rawPartyCount: 5,
      }),
    ).toBe(2);
  });

  it("rejects service-scope phrases as party slot candidates", () => {
    expect(isInvalidPartySlotLegalEntity("implementation support")).toBe(true);
    expect(isInvalidPartySlotLegalEntity("process documentation")).toBe(true);
    expect(isInvalidPartySlotLegalEntity("configuration assistance")).toBe(true);
    expect(
      isInvalidPartySlotLegalEntity(
        "training services. The engagement term is 12 months. Sarah Mitchell will sign",
      ),
    ).toBe(true);
    expect(isInvalidPartySlotLegalEntity(RED_MESA)).toBe(false);
    expect(isInvalidPartySlotLegalEntity(HARBOR_PEAK)).toBe(false);
  });

  it("premium merge collapses five corrupted draft rows to two intake-authoritative parties", () => {
    const { draft } = mergePremiumDraftPartiesWithRecipientPriority(
      corruptedPremiumDraft(),
      null,
      "",
      "",
      null,
      null,
      undefined,
      undefined,
      TEST333_INTAKE,
    );
    expect(draft.parties).toHaveLength(2);
    expect(draft.parties[0]?.name).toBe(RED_MESA);
    expect(draft.parties[1]?.name).toBe(HARBOR_PEAK);
  });

  it("collapseDraftPartyRows restores Harbor Peak LLC from intake when Pro text dropped suffix", () => {
    const collapsed = collapseDraftPartyRows(corruptedPremiumDraft().parties, TEST333_INTAKE);
    expect(collapsed).toHaveLength(2);
    expect(collapsed[1]?.name).toBe(HARBOR_PEAK);
  });

  it("Pro signer setup resolves exactly two parties from preserved intake authority", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: corruptedPremiumDraft().parties,
      intakeText: TEST333_INTAKE,
      agreementBodyText: corruptedProCorpus(),
    });
    expect(identities).toHaveLength(2);
    expect(identities[0]?.legalEntityName).toBe(RED_MESA);
    expect(identities[1]?.legalEntityName).toBe(HARBOR_PEAK);
  });

  it("paidProSignerDetailsGate requiredCount stays at two after malformed Pro corpus", () => {
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 5,
      intakeText: TEST333_INTAKE,
      draftPartyNames: corruptedPremiumDraft().parties.map((p) => p.name),
      partySignerNames: ["", "", "", "", ""],
      recipient1Name: RED_MESA,
      recipient2Name: "",
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: [],
    });
    expect(gate.requiredCount).toBe(2);
    expect(gate.legalEntityNames[0]).toBe(RED_MESA);
    expect(gate.legalEntityNames[1]).toBe(HARBOR_PEAK);
    expect(gate.legalEntityNames).not.toContain("implementation support");
  });

  it("canonical manifest and review authority use exactly two normalized parties", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      ...SIGNER_SLOT_ARGS,
      partyCount: 5,
      recipient1Name: RED_MESA,
      recipient2Name: "implementation support",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: corruptedPremiumDraft().parties.map((p) => p.name),
      partySignerNames: ["", "", "", "", ""],
      extraPartyReviewEmails: [],
      intakeText: TEST333_INTAKE,
    });
    expect(manifest.parties).toHaveLength(2);
    expect(manifest.parties.map((p) => p.partyName)).toEqual([RED_MESA, HARBOR_PEAK]);

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
      intakeText: TEST333_INTAKE,
    });
    expect(authorityManifest.parties).toHaveLength(2);
    expect(authorityManifest.parties.map((p) => p.partyName)).toEqual([RED_MESA, HARBOR_PEAK]);
  });

  it("execution block has exactly two party sections and one witness block", () => {
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

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: raw,
      authority,
      intakeRaw: TEST333_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: true,
    });
    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);
    expect(hydrated.corpus).toContain(RED_MESA);
    expect(hydrated.corpus).toContain(HARBOR_PEAK);
    expect(hydrated.corpus).not.toContain("implementation support");
    expect(hydrated.corpus).not.toMatch(/\("party"\)/i);
  });

  it("recital repair strips service-scope party placeholder labels from malformed Pro corpus", () => {
    const broken =
      "Harbor Peak Automation will provide AI workflow consulting (\"party\") and implementation support (\"party\").";
    const { text, repairs } = repairMalformedPaidProAgreementRecital(broken);
    expect(repairs).toContain("recital:strip_service_scope_party_placeholder");
    expect(text).not.toMatch(/\("party"\)/i);
    expect(text).toContain("AI workflow consulting");
    expect(text).toContain("implementation support");
  });
});
