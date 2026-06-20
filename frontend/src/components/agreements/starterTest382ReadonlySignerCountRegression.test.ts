import { afterEach, describe, expect, it } from "vitest";
import {
  buildPremiumAgreementReadonlyHtml,
  resolvePremiumSignaturePreviewMode,
  resetSignaturePreviewModeLogDedupeForTests,
} from "./premiumAgreementDocumentHtml";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  resolveReadonlyHtmlSignerCount,
} from "./signerCountAuthority";

import { resolveStarterGatePartyLegalEntities } from "./labeledPartyBlockParse";

export const TEST382_ROLE_ALIAS_PRO_INTAKE = `
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
const PHANTOM = "Decorative Fallback LLC";

function test382ProCorpus() {
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
    "",
    "1. Scope. Workflow automation consulting services for three months.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    RED,
    "By: __________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Email for Notice: client@example.com",
    "Address for Notice: 100 Main St",
    "Date: _____________________________",
    "",
    "SERVICE PROVIDER:",
    HARBOR,
    "By: __________________________",
    "Name: Michael Torres",
    "Title: President",
    "Email for Notice: provider@example.com",
    "Address for Notice: 200 Oak Ave",
    "Date: _____________________________",
  ].join("\n");
}

function inflatedPartyNames() {
  return [RED, HARBOR, PHANTOM];
}

describe("Test382 readonly HTML signer count", () => {
  it("starter gate resolves only two legal entities from intake", () => {
    const parties = resolveStarterGatePartyLegalEntities(TEST382_ROLE_ALIAS_PRO_INTAKE);
    expect(parties).toHaveLength(2);
    expect(parties).toContain(RED);
    expect(parties).toContain(HARBOR);
  });

  afterEach(() => {
    clearConsumedPaidProSignerMetadataAuthority();
    resetSignaturePreviewModeLogDedupeForTests();
  });

  it("resolveReadonlyHtmlSignerCount stays 2 with inflated partyNames and pro corpus", () => {
    const corpus = test382ProCorpus();
    expect(
      resolveReadonlyHtmlSignerCount("premium_agreement_readonly_html", {
        intakeText: TEST382_ROLE_ALIAS_PRO_INTAKE,
        draftPartyNames: inflatedPartyNames(),
        partyNames: inflatedPartyNames(),
        corpusPlain: corpus,
      }),
    ).toBe(2);
  });

  it("suppress_embedded readonly path reports signerCount 2", () => {
    const corpus = test382ProCorpus();
    const mode = resolvePremiumSignaturePreviewMode(corpus, 2, { suppressEmbeddedForDisplay: true });
    expect(mode.signerCount).toBe(2);
    expect(mode.mode).toBe("external_signer_ui_corpus_stripped");
    expect(mode.hasCorpusSignatureBlock).toBe(false);

    const html = buildPremiumAgreementReadonlyHtml(corpus, {
      signatureSectionMode: "collaboration",
      partyNames: inflatedPartyNames(),
      intakeText: TEST382_ROLE_ALIAS_PRO_INTAKE,
      draftPartyNames: inflatedPartyNames(),
      suppressCorpusEmbeddedSignatureForDisplay: true,
    });
    expect(html).not.toContain("claw-premium-signature-section");
    expect(html).not.toMatch(/Decorative Fallback LLC/i);
  });

  it("embedded corpus signature mode reports signerCount 2 and suppresses decorative fallback", () => {
    const corpus = test382ProCorpus();
    const count = resolveReadonlyHtmlSignerCount("premium_agreement_readonly_html", {
      intakeText: TEST382_ROLE_ALIAS_PRO_INTAKE,
      partyNames: inflatedPartyNames(),
      draftPartyNames: inflatedPartyNames(),
      corpusPlain: corpus,
    });
    const mode = resolvePremiumSignaturePreviewMode(corpus, count);
    expect(mode.signerCount).toBe(2);
    expect(mode.mode).toBe("embedded_corpus_signature_block");
    expect(mode.hasCorpusSignatureBlock).toBe(true);

    const html = buildPremiumAgreementReadonlyHtml(corpus, {
      signatureSectionMode: "collaboration",
      partyNames: inflatedPartyNames(),
      intakeText: TEST382_ROLE_ALIAS_PRO_INTAKE,
      draftPartyNames: inflatedPartyNames(),
    });
    expect(html).not.toContain("claw-premium-signature-section");
    expect(html).toMatch(/CLIENT:/i);
    expect(html).toMatch(/SERVICE PROVIDER:/i);
    expect(html).not.toMatch(/Decorative Fallback LLC/i);
    expect(html).not.toMatch(/Party C/i);
  });

  it("manifest-backed readonly count cannot exceed intake authority", () => {
    const authority = buildLivePaidProSignerMetadataAuthority({
      partyCount: 2,
      recipient1Name: RED,
      recipient2Name: HARBOR,
      recipient1Email: "client@example.com",
      recipient2Email: "provider@example.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Sarah Mitchell", "Michael Torres"],
      partySignerTitles: ["CEO", "President"],
      partyAddresses: ["100 Main St", "200 Oak Ave"],
    });
    setConsumedPaidProSignerMetadataAuthority(authority);
    expect(authority.parties).toHaveLength(2);

    const count = resolveReadonlyHtmlSignerCount("premium_agreement_readonly_html", {
      intakeText: TEST382_ROLE_ALIAS_PRO_INTAKE,
      partyNames: inflatedPartyNames(),
      draftPartyNames: inflatedPartyNames(),
      corpusPlain: test382ProCorpus(),
    });
    expect(count).toBe(2);
  });

  it("execution block invariant remains single block with two party headings", () => {
    const corpus = test382ProCorpus();
    const invariant = analyzePaidProExecutionBlockInvariant(corpus, { expectedParties: 2 });
    expect(invariant.ok).toBe(true);
    expect(invariant.witnessClauseCount).toBe(1);
    expect(invariant.executionBlockCount).toBe(1);
  });

  it("decorative fallback uses only canonical two party names when corpus lacks execution block", () => {
    const plain = [
      "CONSULTING AGREEMENT",
      "",
      `This Agreement is between ${RED} ("Client") and ${HARBOR} ("Service Provider").`,
      "",
      "1. Scope.",
    ].join("\n");
    const html = buildPremiumAgreementReadonlyHtml(plain, {
      signatureSectionMode: "collaboration",
      partyNames: inflatedPartyNames(),
      intakeText: TEST382_ROLE_ALIAS_PRO_INTAKE,
      draftPartyNames: inflatedPartyNames(),
    });
    const mode = resolvePremiumSignaturePreviewMode(plain, 2);
    expect(mode.signerCount).toBe(2);
    expect(mode.mode).toBe("decorative_fallback_signature_card");
    expect(html).toContain("claw-premium-signature-section");
    expect(html).not.toMatch(/Decorative Fallback LLC/i);
    expect((html.match(/Authorized Signer/g) ?? []).length).toBe(2);
  });
});
