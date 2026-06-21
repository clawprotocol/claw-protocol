/**
 * Party Authority Integrity — permanent regression coverage for Test386-class defects.
 * Legal Party Authority is the sole source for party count; lower authorities enrich only.
 */

import { afterEach, describe, expect, it } from "vitest";
import { normalizeAgreementDraftFromApi } from "../../agreement/agreementDraftNormalize";
import { textContainsUnresolvedIdentityPlaceholders } from "../../agreement/partyPlaceholderDisplay";
import { buildStarterAgreementPreviewForReview } from "./agreementPreviewFromDraft";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { resolveGuidedPreReviewSignerSlots } from "./guidedDealCompletion/resolveGuidedPreReviewSignerSlots";
import { extractBetweenPartyNameList } from "./partyBetweenParse";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import {
  buildLivePaidProSignerMetadataAuthority,
  buildPaidProSignerMetadataParties,
  clearConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  resolveGeneratedAgreementPartyCount,
  resolveSignerSetupUiPartyCount,
} from "./paidProNPartySignerSetup";
import { resolveSignerSetupPartyIdentities } from "./signerSetupPartyIdentity";
import {
  consumeAuthoritativeSignerCount,
  resolveAuthoritativeSignerCount,
} from "./signerCountAuthority";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";

const TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE = `
Party 1
Legal Entity: Pioneer Freight Solutions LLC
Party 2
Legal Entity: Summit Ridge Technologies LLC
Party 3
Legal Entity: North Star Data Analytics LLC
Party 4
Legal Entity: Iron Vale Implementation Partners LLC
`.trim();

const TEST382_ROLE_ALIAS_PRO_INTAKE = `
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

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";

const TEST386_BETWEEN_INTAKE = [
  "Create a consulting agreement",
  'between Red Mesa Logistics, LLC ("party_a") and Harbor Peak Automation, LLC ("party_b")',
  "for AI workflow setup.",
  "Oklahoma law governs.",
].join(" ");

const CORRUPTED_DRAFT_PARTIES = [
  { name: "Red Mesa Logistics", role: "party_a" },
  { name: "LLC", role: "party_b" },
  { name: "Harbor Peak Automation", role: "party" },
];

const REVIEWER_METADATA_INTAKE = `
Party 1
Legal Entity: ${RED}
Signer Email: client@example.com
Reviewer Email: reviewer@example.com

Party 2
Legal Entity: ${HARBOR}
Signer Email: provider@example.com
Notice Contact: notices@example.com
`.trim();

const NOTICE_METADATA_INTAKE = `
${TEST386_BETWEEN_INTAKE}

Notice to Red Mesa: notices@redmesa.test
Notice to Harbor Peak: notices@harborpeak.test
`.trim();

const DELIVERY_METADATA_INTAKE = `
${TEST386_BETWEEN_INTAKE}

Deliver signed copies to archive@example.com and billing@example.com
`.trim();

function corruptedProCorpus() {
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    RED,
    "By: __________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Date: _____________________________",
    "",
    "SERVICE PROVIDER:",
    HARBOR,
    "By: __________________________",
    "Name: Michael Torres",
    "Title: President",
    "Date: _____________________________",
  ].join("\n");
}

function inflatedFourBlockCorpus() {
  return [
    corruptedProCorpus(),
    "",
    "IN WITNESS WHEREOF",
    "",
    "PARTY 3:",
    "Phantom Logistics LLC",
    "By: __________________________",
    "",
    "PARTY 4:",
    "Ghost Automation LLC",
    "By: __________________________",
  ].join("\n");
}

describe("partyAuthorityIntegrity", () => {
  afterEach(() => {
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("two-party between intake stays two parties throughout authority resolvers", () => {
    expect(extractBetweenPartyNameList(TEST386_BETWEEN_INTAKE)).toEqual([RED, HARBOR]);
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST386_BETWEEN_INTAKE,
        draftParties: CORRUPTED_DRAFT_PARTIES,
        corpusPlain: inflatedFourBlockCorpus(),
      }).count,
    ).toBe(2);
    expect(
      resolveGeneratedAgreementPartyCount({
        intakeText: TEST386_BETWEEN_INTAKE,
        draftParties: CORRUPTED_DRAFT_PARTIES,
        corpusPlain: inflatedFourBlockCorpus(),
      }),
    ).toBe(2);
    expect(
      resolveSignerSetupUiPartyCount({
        signerSetupUiPartyCount: 4,
        draftParties: CORRUPTED_DRAFT_PARTIES,
        intakeText: TEST386_BETWEEN_INTAKE,
      }),
    ).toBe(2);
  });

  it("four-party labeled intake stays four parties throughout authority resolvers", () => {
    const labeled = labeledPartyLegalEntities(TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE);
    expect(labeled).toHaveLength(4);
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
        draftParties: labeled.map((name) => ({ name })),
      }).count,
    ).toBe(4);
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: TEST371_QUADRIPARTITE_LABELED_PARTIES_INTAKE,
        draftPartyNames: labeled,
        rawPartyCount: 4,
        userExpandedPartyCount: 2,
      }),
    ).toBe(4);
  });

  it("reviewer metadata cannot create parties", () => {
    expect(
      consumeAuthoritativeSignerCount(
        "reviewer_metadata_probe",
        {
          intakeText: REVIEWER_METADATA_INTAKE,
          draftPartyNames: [RED, HARBOR, "reviewer@example.com"],
          rawPartyCount: 3,
          userExpandedPartyCount: 3,
        },
        3,
      ),
    ).toBe(2);
  });

  it("notice metadata cannot create parties", () => {
    expect(
      resolveSignerSetupUiPartyCount({
        signerSetupUiPartyCount: 3,
        draftParties: [{ name: RED }, { name: HARBOR }, { name: "notices@harborpeak.test" }],
        intakeText: NOTICE_METADATA_INTAKE,
      }),
    ).toBe(2);
  });

  it("delivery metadata cannot create parties", () => {
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: DELIVERY_METADATA_INTAKE,
        draftPartyNames: [RED, HARBOR, "archive@example.com", "billing@example.com"],
        rawPartyCount: 4,
        userExpandedPartyCount: 4,
      }),
    ).toBe(2);
  });

  it("signer metadata cannot create parties", () => {
    expect(
      consumeAuthoritativeSignerCount(
        "metadata_authority_probe",
        {
          intakeText: TEST386_BETWEEN_INTAKE,
          draftPartyNames: CORRUPTED_DRAFT_PARTIES.map((p) => p.name),
          rawPartyCount: 4,
          userExpandedPartyCount: 4,
        },
        4,
      ),
    ).toBe(2);
    const parties = buildPaidProSignerMetadataParties(
      {
        partyCount: 4,
        recipient1Name: RED,
        recipient2Name: HARBOR,
        recipient1Email: "client@example.com",
        recipient2Email: "provider@example.com",
        extraPartyReviewEmails: ["ghost@example.com", "phantom@example.com"],
        partySignerNames: ["Sarah", "Michael", "Ghost", "Phantom"],
        partySignerTitles: ["CEO", "President", "", ""],
        partyAddresses: ["", "", "", ""],
      },
      {
        intakeText: TEST382_ROLE_ALIAS_PRO_INTAKE,
        draftPartyNames: [RED, HARBOR],
      },
    );
    expect(parties).toHaveLength(2);
  });

  it("execution blocks equal legal-party count", () => {
    const invariant = analyzePaidProExecutionBlockInvariant(corruptedProCorpus(), {
      expectedParties: 2,
    });
    expect(invariant.ok).toBe(true);
    expect(invariant.executionBlockCount).toBe(1);
    expect(invariant.witnessClauseCount).toBe(1);
  });

  it("signer cards equal legal-party count", () => {
    const identities = resolveSignerSetupPartyIdentities({
      parties: CORRUPTED_DRAFT_PARTIES,
      intakeText: TEST386_BETWEEN_INTAKE,
      agreementBodyText: corruptedProCorpus(),
    });
    expect(identities).toHaveLength(2);
    expect(identities.map((id) => id.legalEntityName)).toEqual([RED, HARBOR]);
  });

  it("no unresolved placeholders render in starter preview", () => {
    const preview = buildStarterAgreementPreviewForReview(
      {
        title: "Consulting Agreement",
        jurisdiction: "Oklahoma",
        parties: CORRUPTED_DRAFT_PARTIES,
        purpose: "AI workflow setup",
        payment_terms: "",
        duration: "12 months",
        due_date: null,
        effective_date: null,
        payment: { amount: null, cadence: null, valid: false },
        agreement_family: "services_agreement",
      },
      { intakeText: TEST386_BETWEEN_INTAKE },
    );
    expect(preview).toMatch(/Red Mesa Logistics LLC/i);
    expect(preview).toMatch(/Harbor Peak Automation LLC/i);
    expect(preview).not.toMatch(/party_a|party_b/i);
    expect(textContainsUnresolvedIdentityPlaceholders(preview)).toBe(false);
  });

  it("no phantom parties after signer hydration", () => {
    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 4,
        recipient1Name: RED,
        recipient2Name: HARBOR,
        recipient1Email: "client@example.com",
        recipient2Email: "provider@example.com",
        extraPartyReviewEmails: ["ghost@example.com", "phantom@example.com"],
        partySignerNames: ["Sarah", "Michael", "Ghost", "Phantom"],
        partySignerTitles: ["CEO", "President", "", ""],
        partyAddresses: ["", "", "", ""],
      },
      "live_ui",
      {
        intakeText: TEST386_BETWEEN_INTAKE,
        draftPartyNames: CORRUPTED_DRAFT_PARTIES.map((p) => p.name),
      },
    );
    expect(authority.parties).toHaveLength(2);
    expect(authority.parties.map((p) => p.partyLegalName)).toEqual([RED, HARBOR]);
  });

  it("no phantom parties after review rendering manifest resolution", () => {
    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 4,
      intakeText: TEST386_BETWEEN_INTAKE,
      recipient1Name: "Red Mesa Logistics",
      recipient2Name: "LLC",
      recipient1Email: "",
      recipient2Email: "",
      draftPartyNames: CORRUPTED_DRAFT_PARTIES.map((p) => p.name),
      partySignerNames: ["", "", ""],
      extraPartyReviewEmails: [],
      sendMode: "review",
      recipientsDeferred: false,
    });
    expect(manifest.parties).toHaveLength(2);
    expect(manifest.parties.map((p) => p.partyName)).toEqual([RED, HARBOR]);
  });

  it("no phantom parties after signature preparation slot resolution", () => {
    const slots = resolveGuidedPreReviewSignerSlots({
      partyCount: 4,
      intakeText: TEST386_BETWEEN_INTAKE,
      partySignerNames: ["Sarah", "Michael", "Ghost", "Phantom"],
      recipient1Name: RED,
      recipient2Name: HARBOR,
      recipient1Email: "client@example.com",
      recipient2Email: "provider@example.com",
      extraPartyReviewEmails: ["ghost@example.com", "phantom@example.com"],
      draftPartyNames: CORRUPTED_DRAFT_PARTIES.map((p) => p.name),
      sendMode: "signature",
      recipientsDeferred: false,
    });
    expect(slots.requiredCount).toBe(2);
  });

  it("normalizeAgreementDraftFromApi repairs corrupted API party rows to legal authority", () => {
    const draft = normalizeAgreementDraftFromApi(
      {
        id: "ag_test386",
        title: "Consulting Agreement",
        jurisdiction: "Oklahoma",
        intake_text: TEST386_BETWEEN_INTAKE,
        parties: CORRUPTED_DRAFT_PARTIES,
      },
      { partyNameContext: TEST386_BETWEEN_INTAKE },
    );
    expect(draft?.parties).toHaveLength(2);
    expect(draft?.parties?.map((p) => p.name)).toEqual([RED, HARBOR]);
  });
});
