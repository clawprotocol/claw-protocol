import { describe, expect, it } from "vitest";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import { countSignatureBlockHeadingsInTail } from "./guidedDealCompletion/signatureRegion";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import {
  assessLabeledPartyManifestIntegrity,
  shouldBlockPaidProAdvisoryAcceptForPartyIdentity,
} from "./labeledPartyManifestIntegrity";
import {
  isAuthoritativeLegalEntityName,
  isDisallowedPartyPhrase,
} from "./paidProPartyNamePreserve";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import {
  resolveGeneratedAgreementPartyCount,
  resolveSignerSetupUiPartyCount,
} from "./paidProNPartySignerSetup";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { mergeLabeledPartyAuthorityIntoParties } from "./paidProSignerMetadataAuthority";
import { auditPaidProReviewRenderSotParity } from "./paidProReviewSotParity";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  isQuadripartiteLabeledPartiesIntake,
  labeledPartyLegalEntities,
  parseLabeledPartyBlocks,
} from "./labeledPartyBlockParse";
import { legalPartyIdentitiesExcludingCoordinator, normalizePartyIdentities, createCoordinatorProfile } from "./canonicalPartyIdentityModel";
import { PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER } from "./qa/paidProHardening/paidProHardeningFixtures";

export const TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE = `Create a QUADRIPARTITE SOFTWARE PLATFORM DEVELOPMENT, ANALYTICS, IMPLEMENTATION, AND REVENUE SHARING AGREEMENT.

Party 1
Legal Entity: Pioneer Freight Solutions LLC
Signer Name: Jennifer Lawson
Signer Title: President
Signer Email: jlawson@pioneerfreight.com

Party 2
Legal Entity: Summit Ridge Technologies LLC
Signer Name: Unknown
Signer Title: Unknown
Signer Email: legal@summitridgetech.com
Address: 4200 Legacy Drive, Plano, TX 75024

Party 3
Legal Entity: North Star Data Analytics LLC
Signer Name: Michael Carter
Signer Title: Director of Analytics
Signer Email: michael@northstaranalytics.com

Party 4
Legal Entity: Iron Vale Implementation Partners LLC
Signer Name: Rebecca Stone
Signer Title: Managing Partner
Signer Email: rstone@ironvalepartners.com
Address: 1800 Commerce Street, Dallas, TX

Coordinator
Name: Alex Morgan
Email: alex.morgan@coordinator.test
Role: coordinating this agreement, not signing as a party

Purpose: Development and maintenance of a custom software platform with analytics dashboard and implementation support.

Term: thirty-six (36) months.

Payment: $185,000 in milestone payments; monthly analytics and implementation fees as specified.

Revenue sharing: licensing revenue will be shared among the parties as set forth in Exhibit A.

Each party will keep confidential information received from the other parties confidential.

Texas law governs. Electronic execution via LawDog.`;

const EXPECTED_PARTIES = [
  "Pioneer Freight Solutions LLC",
  "Summit Ridge Technologies LLC",
  "North Star Data Analytics LLC",
  "Iron Vale Implementation Partners LLC",
] as const;

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function buildTest371Draft() {
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
      payment: emptyPayment,
    },
    TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
    true,
    defaultIntakePartyRoleLabels(),
  );
}

function buildQuadWitnessCorpus(): string {
  const body = [
    "SOFTWARE PLATFORM AGREEMENT",
    "",
    "This Agreement is entered into among the parties listed below.",
    "",
    ...Array.from({ length: 12 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
  ];
  for (let i = 0; i < EXPECTED_PARTIES.length; i++) {
    body.push(
      `PARTY ${i + 1}:`,
      EXPECTED_PARTIES[i]!,
      "By: _________________________",
      "Name: _________________________",
      "Title: _________________________",
      "Email for Notices: _________________________",
      "Address for Notices: _________________________",
      "",
    );
  }
  return body.join("\n");
}

describe("Test371 quadrpartite labeled parties regression", () => {
  it("parses four labeled party blocks and excludes coordinator contamination", () => {
    expect(isQuadripartiteLabeledPartiesIntake(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE)).toBe(true);
    expect(labeledPartyLegalEntities(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE)).toEqual([
      ...EXPECTED_PARTIES,
    ]);
    expect(parseLabeledPartyBlocks(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE)).toHaveLength(4);
    expect(parseLabeledPartyBlocks(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE).some((b) => /Alex Morgan/i.test(b.legalEntity))).toBe(
      false,
    );
  });

  it("rejects title and clause fragments as legal entity names", () => {
    expect(isDisallowedPartyPhrase("SOFTWARE PLATFORM AGREEMENT")).toBe(true);
    expect(isDisallowedPartyPhrase("licensing revenue will be shared")).toBe(true);
    expect(isAuthoritativeLegalEntityName("SOFTWARE PLATFORM AGREEMENT")).toBe(false);
    expect(isAuthoritativeLegalEntityName("licensing revenue will be shared")).toBe(false);
    expect(isAuthoritativeLegalEntityName("Pioneer Freight Solutions LLC")).toBe(true);
  });

  it("free starter parse preserves four authoritative party names", () => {
    const draft = buildTest371Draft();
    const preview = buildAgreementPreviewTextCore(draft, { starterPreview: true });
    for (const name of EXPECTED_PARTIES) {
      expect(preview).toMatch(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    expect(draft.parties.length).toBeGreaterThanOrEqual(4);
  });

  it("canonical final party manifest resolves four parties (not two)", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["", "", "", ""],
      partySignerTitles: ["", "", "", ""],
      recipient1Name: "",
      recipient2Name: "",
      recipient1Email: "",
      recipient2Email: "",
      extraPartyReviewEmails: [],
      draftPartyNames: [...EXPECTED_PARTIES],
      sendMode: "signature",
      recipientsDeferred: false,
      intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
    });
    expect(manifest.parties).toHaveLength(4);
    expect(manifest.parties.map((p) => p.partyName)).toEqual([...EXPECTED_PARTIES]);
    expect(manifest.parties.every((p) => p.roleLabel.startsWith("Party"))).toBe(true);
  });

  it("party slot count and signer setup UI count are four", () => {
    const draft = buildTest371Draft();
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
        draftPartyNames: draft.parties.map((p) => p.name),
      }),
    ).toBe(4);
    expect(
      resolveGeneratedAgreementPartyCount({
        intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
        draftParties: draft.parties,
      }),
    ).toBe(4);
    expect(
      resolveSignerSetupUiPartyCount({
        signerSetupUiPartyCount: 2,
        draftParties: draft.parties,
      }),
    ).toBeGreaterThanOrEqual(4);
  });

  it("execution block rebuild uses four PARTY sections without CLIENT/SERVICE PROVIDER fallback", () => {
    const parties = mergeLabeledPartyAuthorityIntoParties([], TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(parties).toHaveLength(4);
    const rebuilt = enforcePaidProSingleExecutionBlock(buildQuadWitnessCorpus(), {
      authorityParties: parties,
      intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
    }).text;
    const tailIdx = rebuilt.search(/\bIN WITNESS WHEREOF\b/i);
    const tail = tailIdx >= 0 ? rebuilt.slice(tailIdx) : rebuilt;
    expect(countSignatureBlockHeadingsInTail(tail)).toBe(4);
    expect(tail).toMatch(/PARTY\s+1\s*:/i);
    expect(tail).toMatch(/PARTY\s+4\s*:/i);
    expect(tail).not.toMatch(/^\s*CLIENT\s*:/im);
    expect(tail).not.toMatch(/SOFTWARE PLATFORM AGREEMENT/i);
    expect(tail).not.toMatch(/licensing revenue will be shared/i);
  });

  it("review render parties resolve four labeled slots even when UI only has two recipients", () => {
    const parties = resolvePartiesForReviewRender({
      intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
      liveSignerMetadataUi: {
        partyCount: 2,
        recipient1Name: "SOFTWARE PLATFORM AGREEMENT",
        recipient2Name: "licensing revenue will be shared",
        recipient1Email: "",
        recipient2Email: "",
        extraPartyReviewEmails: [],
        partySignerNames: ["", ""],
        partySignerTitles: ["", ""],
        partyAddresses: ["", ""],
      },
    });
    expect(parties).toHaveLength(4);
    expect(parties.map((p) => p.partyLegalName)).toEqual([...EXPECTED_PARTIES]);
  });

  it("coordinator Alex Morgan is excluded from legal party identities", () => {
    const coordinator = createCoordinatorProfile({
      isUser: true,
      displayName: "Alex Morgan",
      email: "alex.morgan@coordinator.test",
    });
    const parties = normalizePartyIdentities({ intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE });
    const legal = legalPartyIdentitiesExcludingCoordinator(parties, coordinator, true);
    expect(legal).toHaveLength(4);
    expect(legal.some((p) => /Alex Morgan/i.test(p.legalName))).toBe(false);
  });

  it("blocks Pro advisory accept when draft party identity is corrupted", () => {
    const integrity = assessLabeledPartyManifestIntegrity({
      intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
      draftPartyNames: ["SOFTWARE PLATFORM AGREEMENT", "licensing revenue will be shared"],
      documentText: "If to Pioneer [ORG_3]: notice",
    });
    expect(integrity.ok).toBe(false);
    expect(shouldBlockPaidProAdvisoryAcceptForPartyIdentity(integrity)).toBe(true);
  });

  it("SOT parity accepts display-only review when execution overlay uses labeled parties only", () => {
    clearPaidProSourceOfTruth();
    const corpus = buildQuadWitnessCorpus();
    establishPaidProSourceOfTruth({ text: corpus, source: "server_full_draft" });
    const parties = mergeLabeledPartyAuthorityIntoParties([], TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    const overlay = enforcePaidProSingleExecutionBlock(corpus, {
      authorityParties: parties,
      intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
    }).text;
    const parity = auditPaidProReviewRenderSotParity({ reviewPlain: overlay });
    expect(parity.blankSignerLinesRemaining).toBeGreaterThan(0);
    expect(overlay.length).toBeGreaterThanOrEqual(corpus.length - 200);
    clearPaidProSourceOfTruth();
  });

  it("two-party control still resolves CLIENT and SERVICE PROVIDER", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 2,
      partySignerNames: ["A", "B"],
      partySignerTitles: ["", ""],
      recipient1Name: PAID_PRO_HARDENING_CLIENT,
      recipient2Name: PAID_PRO_HARDENING_PROVIDER,
      recipient1Email: "a@test.com",
      recipient2Email: "b@test.com",
      extraPartyReviewEmails: [],
      draftPartyNames: [PAID_PRO_HARDENING_CLIENT, PAID_PRO_HARDENING_PROVIDER],
      sendMode: "signature",
      recipientsDeferred: false,
      intakeText: `Agreement between ${PAID_PRO_HARDENING_CLIENT} and ${PAID_PRO_HARDENING_PROVIDER}. Texas law.`,
    });
    expect(manifest.parties).toHaveLength(2);
    expect(manifest.parties[0]?.role).toBe("client");
    expect(manifest.parties[1]?.role).toBe("service_provider");
  });
});
