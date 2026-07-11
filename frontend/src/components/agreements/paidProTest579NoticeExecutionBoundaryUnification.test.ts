/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { establishPaidProSourceOfTruth, clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { validateNoticesClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import {
  finalizePaidProCanonicalNoticeAuthorityForFreeze,
  resolvePaidProNoticeAuthorityPartiesForFreeze,
} from "./paidProNoticeContactAuthority";
import {
  repairIncompleteIfToNoticeStanzas,
  resolveAuthoritativeNoticesRegionForFreeze,
  sealPaidProNoticesExecutionBoundaryInCorpus,
} from "./paidProPartyNoticeDetails";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";

const BLUE_CANYON = "Blue Canyon Analytics LLC";
const IRON_VALE = "Iron Vale Systems Inc";
const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";

const PRODUCTION_SOT_BODY = [
  "SOFTWARE INTEGRATION AND DATA PROCESSING AGREEMENT",
  "",
  `This Agreement is entered into as of the Effective Date by and between ${BLUE_CANYON}, a Delaware limited liability company ("Client"), and ${IRON_VALE}, a Delaware corporation ("Service Provider").`,
  "",
  ...Array.from({ length: 120 }, (_, i) => `Section ${i + 1}. Operational clause ${i + 1} with commercial specificity and enforceable obligations.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  BLUE_CANYON,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
  "",
  "SERVICE PROVIDER:",
  IRON_VALE,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Date:",
].join("\n");

const TEST390_INTAKE = `Create a consulting agreement between ${RED} and ${HARBOR}.
Sarah Mitchell — CEO — contracts@redmesa-logistics.com
Michael Torres — President — legal@harborpeakautomation.com
Texas law.`;

function corruptedNoticesCorpus() {
  return [
    "CONSULTING AGREEMENT",
    "",
    `This Agreement is between ${RED} and ${HARBOR}.`,
    "",
    ...Array.from({ length: 10 }, (_, i) => `${i + 1}. Clause ${i + 1}.`),
    "",
    "11. Notices",
    "Notices must be in writing.",
    "",
    `If to ${RED}:`,
    RED,
    "Email: contracts@redmesa-logistics.com",
    "",
    `If to Harbor Peak Automation:`,
    "Harbor Peak AutomationIN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT: Red Mesa Logistics LLC",
    "SERVICE PROVIDER: Harbor Peak Automation",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${RED}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "",
    `SERVICE PROVIDER: ${HARBOR}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n");
}

function test390Parties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: HARBOR,
    recipient1Email: "contracts@redmesa-logistics.com",
    recipient2Email: "legal@harborpeakautomation.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["100 Mesa Drive, Austin, TX 78701", "200 Peak Lane, Dallas, TX 75201"],
  }).parties;
}

function fourPartyIntakeCorpus() {
  const parties = [
    "Northwind Capital LLC",
    "BrightPeak Retail Solutions LLC",
    "Horizon Wholesale Group LLC",
    "Summit Ridge Partners Inc",
  ];
  return [
    "MASTER SERVICES AGREEMENT",
    "",
    `This Agreement is between ${parties.join(", ")}.`,
    "",
    ...Array.from({ length: 40 }, (_, i) => `${i + 1}. Clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    parties.map((p, i) => `PARTY ${i + 1}:\n${p}\nBy: ___\nName:\nTitle:\nDate:`).join("\n\n"),
  ].join("\n");
}

describe("TEST579 — notice / execution boundary unification at freeze", () => {
  beforeEach(() => resetPaidProPipelineTestIsolation());
  afterEach(() => {
    clearPaidProSourceOfTruth();
    resetPaidProPipelineTestIsolation();
  });

  it("repair and terminal validation consume the same authoritative notices region", () => {
    const parties = test390Parties();
    const repaired = repairIncompleteIfToNoticeStanzas(corruptedNoticesCorpus(), parties, {
      intakeText: TEST390_INTAKE,
    });
    const sealed = sealPaidProNoticesExecutionBoundaryInCorpus(repaired.text);
    const region = resolveAuthoritativeNoticesRegionForFreeze(sealed.text);
    const violations = validateNoticesClauseFamilyStructuralIntegrity(sealed.text, {
      parties,
      intakeText: TEST390_INTAKE,
      acceptedCorpus: sealed.text,
    });
    expect(violations.some((v) => v.code === "notice_stanza_execution_pollution")).toBe(false);
    expect(region).not.toMatch(/^\s*CLIENT\s*:/im);
    expect(region).not.toMatch(/\bIN WITNESS WHEREOF\b/i);
  });

  it("establishes SOT for witness-first corpus without complete notices section", () => {
    const record = establishPaidProSourceOfTruth({
      text: PRODUCTION_SOT_BODY,
      source: "paidProSourceOfTruth",
    });
    expect(record.text).toContain(BLUE_CANYON);
    expect(record.text).toContain(IRON_VALE);
    expect(record.text).toMatch(/\bNOTICES\b/i);
    expect(record.text).toMatch(/\bIN WITNESS WHEREOF\b/i);
    const region = resolveAuthoritativeNoticesRegionForFreeze(record.text);
    expect(region).not.toMatch(/^\s*CLIENT\s*:/im);
    expect((record.text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
  });

  it("role headings are not absorbed into the notice region after freeze finalization", () => {
    const finalized = finalizePaidProCanonicalNoticeAuthorityForFreeze(PRODUCTION_SOT_BODY, {
      surface: "test579_role_heading",
    });
    const sealed = sealPaidProNoticesExecutionBoundaryInCorpus(finalized.text);
    const region = resolveAuthoritativeNoticesRegionForFreeze(sealed.text);
    expect(region).not.toMatch(/^\s*CLIENT\s*:/im);
    expect(region).not.toMatch(/^\s*SERVICE\s+PROVIDER\s*:/im);
    expect(region).not.toMatch(/^\s*(?:By|Name|Title|Date)\s*:/im);
  });

  it("four-party corpus gets notices followed by exactly one execution block", () => {
    const intake = `Create a four-party agreement between Northwind Capital LLC, BrightPeak Retail Solutions LLC, Horizon Wholesale Group LLC, and Summit Ridge Partners Inc.`;
    const parties = resolvePaidProNoticeAuthorityPartiesForFreeze({
      intakeText: intake,
      acceptedCorpus: fourPartyIntakeCorpus(),
    });
    const finalized = finalizePaidProCanonicalNoticeAuthorityForFreeze(fourPartyIntakeCorpus(), {
      intakeText: intake,
    });
    const sealed = sealPaidProNoticesExecutionBoundaryInCorpus(finalized.text);
    const violations = validateNoticesClauseFamilyStructuralIntegrity(sealed.text, {
      parties,
      intakeText: intake,
      acceptedCorpus: sealed.text,
    });
    expect(violations.some((v) => v.code === "notice_stanza_execution_pollution")).toBe(false);
    expect((sealed.text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBeGreaterThanOrEqual(1);
    expect((sealed.text.match(/^If to\s+/gim) || []).length).toBeGreaterThanOrEqual(4);
  });
});
