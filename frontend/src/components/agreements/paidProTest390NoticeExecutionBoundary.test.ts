import { describe, expect, it } from "vitest";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import { enforcePaidProSingleExecutionBlock } from "./paidProExecutionBlockNormalization";
import { finalizePaidProSigningCorpusText } from "./paidProSignerSigningCorpusHygiene";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  ensureOperativeIfToNoticeDelivery,
  noticeStanzaHasExecutionPollution,
  repairIncompleteIfToNoticeStanzas,
} from "./paidProPartyNoticeDetails";

const RED = "Red Mesa Logistics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const RED_EMAIL = "contracts@redmesa-logistics.com";
const HARBOR_EMAIL = "legal@harborpeakautomation.com";
const RED_ADDR = "100 Mesa Drive, Austin, TX 78701";
const HARBOR_ADDR = "200 Peak Lane, Dallas, TX 75201";

const TEST390_INTAKE = `Create a consulting agreement between ${RED} and ${HARBOR}.
Sarah Mitchell — CEO — ${RED_EMAIL}
Michael Torres — President — ${HARBOR_EMAIL}
Texas law.`;

function test390Parties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED,
    recipient2Name: HARBOR,
    recipient1Email: RED_EMAIL,
    recipient2Email: HARBOR_EMAIL,
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [RED_ADDR, HARBOR_ADDR],
  }).parties;
}

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
    `Email: ${RED_EMAIL}`,
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

describe("TEST390 — notice / execution boundary integrity", () => {
  it("detects execution pollution inside notice stanzas", () => {
    expect(
      noticeStanzaHasExecutionPollution("Harbor Peak AutomationIN WITNESS WHEREOF, the Parties"),
    ).toBe(true);
    expect(noticeStanzaHasExecutionPollution(`If to ${HARBOR}:\n${HARBOR}\nEmail: x@y.com`)).toBe(false);
  });

  it("repairIncompleteIfToNoticeStanzas isolates notices from premature execution text", () => {
    const parties = test390Parties();
    const repaired = repairIncompleteIfToNoticeStanzas(corruptedNoticesCorpus(), parties, {
      intakeText: TEST390_INTAKE,
    });
    expect(repaired.repairs.length).toBeGreaterThan(0);
    expect(repaired.text).toContain(RED_EMAIL);
    expect(repaired.text).toContain(HARBOR_EMAIL);
    expect(repaired.text).toContain(RED_ADDR);
    expect(repaired.text).toContain(HARBOR_ADDR);
    expect(repaired.text).not.toMatch(/AutomationIN WITNESS/i);
    const witnessCount = (repaired.text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length;
    expect(witnessCount).toBe(1);
    const noticesTail = repaired.text.split(/11\.\s*Notices/i)[1]?.split(/\bIN WITNESS WHEREOF\b/i)[0] ?? "";
    expect(noticesTail).not.toMatch(/^\s*CLIENT\s*:/im);
    expect(noticesTail).not.toMatch(/\bIN WITNESS WHEREOF\b/i);
  });

  it("ensureOperativeIfToNoticeDelivery triggers when execution leaked into notices even if party-one email exists", () => {
    const parties = test390Parties();
    const corpus = corruptedNoticesCorpus();
    expect(corpus).toContain(RED_EMAIL);
    expect(corpus).not.toContain(HARBOR_EMAIL);
    const out = ensureOperativeIfToNoticeDelivery(corpus, parties, { intakeText: TEST390_INTAKE });
    expect(out.repairs.length).toBeGreaterThan(0);
    expect(out.text).not.toMatch(/AutomationIN WITNESS/i);
    expect(out.text).toContain(HARBOR_EMAIL);
  });

  it("enforcePaidProSingleExecutionBlock defuses entity-witness fusion before rebuilding execution tail", () => {
    const parties = test390Parties();
    const execution = enforcePaidProSingleExecutionBlock(corruptedNoticesCorpus(), {
      authorityParties: parties.map((p) => ({ partyLegalName: p.partyLegalName })),
      intakeText: TEST390_INTAKE,
      draftPartyNames: [RED, HARBOR],
    });
    const repaired = repairIncompleteIfToNoticeStanzas(execution.text, parties, {
      intakeText: TEST390_INTAKE,
    });
    expect((repaired.text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
    expect(repaired.text).not.toMatch(/AutomationIN WITNESS/i);
    const noticesRegion = repaired.text.split(/11\.\s*Notices/i)[1]?.split(/\bIN WITNESS WHEREOF\b/i)[0] ?? "";
    expect(noticesRegion).not.toMatch(/^\s*CLIENT\s*:/im);
  });

  it("review and signing surfaces preserve single execution block after notice rebuild", () => {
    const parties = test390Parties();
    const ctx = { intakeText: TEST390_INTAKE, draftPartyNames: [RED, HARBOR] };
    const review = applyPaidProReviewRenderSanitizer(corruptedNoticesCorpus(), parties, ctx);
    const signing = finalizePaidProSigningCorpusText(corruptedNoticesCorpus(), parties, ctx);
    for (const text of [review.text, signing.text]) {
      expect((text.match(/\bIN WITNESS WHEREOF\b/gi) || []).length).toBe(1);
      expect(text).toContain(HARBOR_EMAIL);
      expect(text).not.toMatch(/AutomationIN WITNESS/i);
      const noticesRegion = text.split(/11\.\s*Notices/i)[1]?.split(/\bIN WITNESS WHEREOF\b/i)[0] ?? "";
      expect(noticesRegion).not.toMatch(/\bIN WITNESS WHEREOF\b/i);
      expect(noticesRegion).not.toMatch(/^\s*CLIENT\s*:/im);
    }
  });
});
