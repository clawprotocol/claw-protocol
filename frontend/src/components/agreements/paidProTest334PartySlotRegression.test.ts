/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { applySimpleFlowSmartDefaults } from "./intakeSmartDefaults";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import {
  isInvalidPartySlotLegalEntity,
  repairDraftPartiesFromIntakeAuthority,
} from "./partySlotIdentityNormalize";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  applyPaidProSignerMetadataMergeGate,
  reconcileExecutionBlockToRoleIdentities,
} from "./paidProSignerMetadataMergeGate";
import { authorityPartiesToCanonicalPartyIdentities } from "./paidProSignerMetadataAuthority";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { rebuildSignatureBlocksWithPartyIdentities } from "./guidedDealCompletion/signerPartyIdentity";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST334_INTAKE = [
  "Create a services agreement",
  `between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services.`,
  "The engagement term is 12 months.",
  "Oklahoma law governs.",
].join(" ");

const PARTIAL_TAIL_INTAKE =
  "AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services";

describe("paidProTest334PartySlotRegression", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("explicit between clause beats later service-list phrases", () => {
    expect(extractBetweenPartyNameList(TEST334_INTAKE)).toEqual([RED_MESA, HARBOR_PEAK]);
    expect(extractBetweenPartyNameList(PARTIAL_TAIL_INTAKE)).toEqual([]);
  });

  it("rejects service phrases as party slot candidates", () => {
    expect(isInvalidPartySlotLegalEntity("staff training")).toBe(true);
    expect(isInvalidPartySlotLegalEntity("automation deployment services")).toBe(true);
    expect(isInvalidPartySlotLegalEntity(RED_MESA)).toBe(false);
    expect(isInvalidPartySlotLegalEntity(HARBOR_PEAK)).toBe(false);
  });

  it("repairs corrupted draft parties from intake legal-entity authority", () => {
    const corrupted = [
      { name: "staff training", role: "party" },
      { name: "automation deployment services", role: "party" },
    ];
    const repaired = repairDraftPartiesFromIntakeAuthority(corrupted, TEST334_INTAKE);
    expect(repaired).toHaveLength(2);
    expect(repaired[0]?.name).toBe(RED_MESA);
    expect(repaired[1]?.name).toBe(HARBOR_PEAK);
  });

  it("applySimpleFlowSmartDefaults preserves Red Mesa + Harbor Peak from full intake", () => {
    const draft: ParsedDraftShape = {
      title: "Services Agreement",
      jurisdiction: "Oklahoma",
      parties: [
        { name: "staff training", role: "party" },
        { name: "automation deployment services", role: "party" },
      ],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    };
    const next = applySimpleFlowSmartDefaults(draft, TEST334_INTAKE);
    expect(next.parties).toHaveLength(2);
    expect(next.parties[0]?.name).toBe(RED_MESA);
    expect(next.parties[1]?.name).toBe(HARBOR_PEAK);
  });

  it("signer authority merge gate replaces corrupted execution labels in place", () => {
    const corrupted = [
      "1. Scope.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "staff training",
      "By: __________________________",
      "",
      "SERVICE PROVIDER:",
      "automation deployment services",
      "By: __________________________",
    ].join("\n");
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: RED_MESA,
      recipient2Name: "Acme Hosting LLC",
      recipient1Email: "anthemhayek@me.com",
      recipient2Email: "mariagomez34@gmail.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem Blanchard", "Maria Gomez"],
      partySignerTitles: ["CEO", "Manager"],
      partyAddresses: ["123 Main St., Havenhurst, ME 01923", "98345 Gaveinbaing St., Gamestown, CA 92093"],
    });
    const gated = applyPaidProSignerMetadataMergeGate({
      corpus: corrupted,
      parties: authority.parties,
      canonicalPartyCount: 2,
      roleContext: { intakeText: TEST334_INTAKE, acceptedCorpus: corrupted },
    });
    expect(countPaidProExecutionBlocks(gated.text)).toBe(1);
    expect(gated.text).not.toContain("staff training");
    expect(gated.text).toContain(RED_MESA);
    expect(gated.text).toContain("Acme Hosting LLC");
    expect(gated.text).toContain("Anthem Blanchard");
    expect(gated.text).toContain("Maria Gomez");
  });

  it("rebuildSignatureBlocksWithPartyIdentities replaces an existing witness tail instead of appending", () => {
    const bodyOnly = "1. Scope.\n\nServices continue here.";
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: RED_MESA,
      recipient2Name: "Acme Hosting LLC",
      recipient1Email: "a@example.com",
      recipient2Email: "b@example.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem Blanchard", "Maria Gomez"],
      partySignerTitles: ["CEO", "Manager"],
      partyAddresses: ["123 Main", "456 Oak"],
    });
    const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties, {
      intakeText: TEST334_INTAKE,
      acceptedCorpus: bodyOnly,
    });
    const withWitness = [
      bodyOnly,
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "staff training",
      "By: __________________________",
    ].join("\n");
    const rebuilt = rebuildSignatureBlocksWithPartyIdentities(withWitness, identities);
    expect(countPaidProExecutionBlocks(rebuilt.text)).toBe(1);
    expect(rebuilt.text).toContain(RED_MESA);
    expect(rebuilt.text).toContain("Acme Hosting LLC");
    expect((rebuilt.text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
  });

  it("post-finalize hydration leaves exactly one execution block with corrected signer authority", () => {
    const raw = [
      "SERVICES AGREEMENT",
      "",
      `This Agreement is between staff training ("party") and automation deployment services ("party").`,
      "",
      "1. Scope. AI workflow consulting and related services.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "staff training",
      "By: __________________________",
      "Name: __________________________",
      "",
      "SERVICE PROVIDER:",
      "automation deployment services",
      "By: __________________________",
      "Name: __________________________",
    ].join("\n");
    establishPaidProSourceOfTruth({ text: raw, source: "server_full_draft" });
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: RED_MESA,
      recipient2Name: "Acme Hosting LLC",
      recipient1Email: "anthemhayek@me.com",
      recipient2Email: "mariagomez34@gmail.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Anthem Blanchard", "Maria Gomez"],
      partySignerTitles: ["CEO", "Manager"],
      partyAddresses: ["123 Main St., Havenhurst, ME 01923", "98345 Gaveinbaing St., Gamestown, CA 92093"],
    });
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: raw,
      authority,
      intakeRaw: TEST334_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: true,
    });
    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);
    expect(hydrated.corpus).toContain(RED_MESA);
    expect(hydrated.corpus).toContain("Acme Hosting LLC");
    expect(hydrated.corpus).toContain("Anthem Blanchard");
    expect(hydrated.corpus).toContain("Maria Gomez");
    expect(hydrated.corpus).not.toContain("staff training");
    expect(hydrated.corpus).not.toContain("automation deployment services");
    const witnessCount = (hydrated.corpus.match(/\bIN WITNESS WHEREOF\b/gi) || []).length;
    expect(witnessCount).toBe(1);
  });

  it("enforcePaidProSingleExecutionBlock uses signer authority parties over corrupted corpus roles", () => {
    const corpus = [
      "1. Services.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "staff training",
      "By: __________________________",
      "",
      "SERVICE PROVIDER:",
      "automation deployment services",
      "By: __________________________",
    ].join("\n");
    const identities = authorityPartiesToCanonicalPartyIdentities(
      buildLivePaidProSignerMetadataAuthority({
        partyCount: 2,
        recipient1Name: RED_MESA,
        recipient2Name: "Acme Hosting LLC",
        recipient1Email: "a@example.com",
        recipient2Email: "b@example.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Anthem Blanchard", "Maria Gomez"],
        partySignerTitles: ["CEO", "Manager"],
        partyAddresses: ["123 Main", "456 Oak"],
      }).parties,
      { intakeText: TEST334_INTAKE, acceptedCorpus: corpus },
    );
    const reconciled = reconcileExecutionBlockToRoleIdentities(corpus, identities);
    const normalized = enforcePaidProSingleExecutionBlock(reconciled.text, {
      authorityParties: [
        { partyLegalName: RED_MESA },
        { partyLegalName: "Acme Hosting LLC" },
      ],
    });
    expect(countPaidProExecutionBlocks(normalized.text)).toBe(1);
    expect(normalized.text).toContain(RED_MESA);
    expect(normalized.text).toContain("Acme Hosting LLC");
    expect(normalized.text).not.toContain("staff training");
  });
});
