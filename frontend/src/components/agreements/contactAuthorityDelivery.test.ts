import { describe, expect, it } from "vitest";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import { applyContactAuthorityExecutionBlockIntegrity } from "./contactAuthorityExecutionBlockIntegrity";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import {
  finalizePaidProSigningCorpusText,
  stripPaidProSignerSummaryBlocksFromCorpus,
} from "./paidProSignerSigningCorpusHygiene";
import { repairIncompleteIfToNoticeStanzas } from "./paidProPartyNoticeDetails";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

function test385Parties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "sarah@bluecanyonanalytics.com",
    recipient2Email: "michael@ironvale.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [
      "13 Firestane Ave., Billings, MT 65323",
      "934 Tree Trunk Blvd., Humboltstrand, CA 94032",
    ],
  }).parties;
}

function test385NoticesCorpus() {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Services Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    ...Array.from({ length: 8 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
    "",
    "10. Notices",
    "",
    "10.1 Delivery. Notices must be in writing.",
    "",
    "10.2 Notice Addresses. Notices must be sent to the following addresses:",
    "",
    "If to",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${BLUE}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    "Date: _____________________________",
  ].join("\n");
}

function completeIfToStanzasCorpus() {
  const parties = test385Parties();
  const stanzas = parties
    .map((p) =>
      [
        `If to ${p.partyLegalName}:`,
        p.partyLegalName,
        `Attn: ${p.signerName}, ${p.signerTitle}`,
        `Email: ${p.signerEmail}`,
        `Address: ${p.partyAddress}`,
      ].join("\n"),
    )
    .join("\n\n");
  return test385NoticesCorpus().replace(/\nIf to\s*\n/, `\n\n${stanzas}\n\n`);
}

describe("Contact Authority delivery", () => {
  it("does not strip operative If to notice stanzas as signer summary blocks", () => {
    const corpus = completeIfToStanzasCorpus();
    const { removed, text } = stripPaidProSignerSummaryBlocksFromCorpus(corpus);
    expect(removed).toBe(0);
    expect(text).toContain(`If to ${BLUE}:`);
    expect(text).toContain("sarah@bluecanyonanalytics.com");
    expect(text).toContain("Firestane");
  });

  it("delivers notice destinations through finalize after dangling If to intro", () => {
    const parties = test385Parties();
    const { text, repairs } = finalizePaidProSigningCorpusText(test385NoticesCorpus(), parties);
    expect(repairs.some((r) => r.includes("notice_delivery") || r.includes("notice:"))).toBe(true);
    expect(text).toContain(`If to ${BLUE}:`);
    expect(text).toContain(`If to ${IRON}:`);
    expect(text).toContain("sarah@bluecanyonanalytics.com");
    expect(text).toContain("michael@ironvale.com");
    expect(text).toContain("Firestane");
    expect(text).toContain("Tree Trunk");
    expect(text).not.toMatch(/Email for Notice:/i);
    expect(text).not.toMatch(/Address for Notice:/i);
  });

  it("repairIncompleteIfToNoticeStanzas handles 10.2 Notice Addresses subsection", () => {
    const { text, repairs } = repairIncompleteIfToNoticeStanzas(
      test385NoticesCorpus(),
      test385Parties(),
    );
    expect(repairs.length).toBeGreaterThan(0);
    expect(text).toMatch(/10\.2 Notice Addresses/i);
    expect(text).toContain("Attn: Sarah Mitchell, CEO");
  });

  it("review render sanitizer delivers notice contacts without execution-block leakage", () => {
    const sanitized = applyPaidProReviewRenderSanitizer(
      completeIfToStanzasCorpus(),
      test385Parties(),
    ).text;
    const witnessIdx = sanitized.search(/\bIN WITNESS WHEREOF\b/i);
    const tail = witnessIdx >= 0 ? sanitized.slice(witnessIdx) : sanitized;
    expect(sanitized).toContain("sarah@bluecanyonanalytics.com");
    expect(sanitized).toContain("Firestane");
    expect(tail).not.toMatch(/Email for Notice:/i);
    expect(tail).not.toMatch(/Address for Notice:/i);
    expect(tail).toMatch(/Name:\s*Sarah Mitchell/i);
  });

  it("contact authority integrity preserves delivered stanzas when ensuring LawDog notices clause", () => {
    const corpus = completeIfToStanzasCorpus().replace(
      /Notices must be sent to the addresses in the signature blocks/i,
      "Notices must be sent to the addresses in the signature blocks",
    );
    const withSigRef = corpus.replace(
      "10.1 Delivery. Notices must be in writing.",
      "10.1 Delivery. Notices must be sent to the addresses in the signature blocks.",
    );
    const result = applyContactAuthorityExecutionBlockIntegrity(withSigRef, {
      source: "test385",
      ensureNoticesClause: true,
    });
    expect(result.text).toContain("LawDog signing process");
    expect(result.text).toContain(`If to ${BLUE}:`);
    expect(result.text).toContain("sarah@bluecanyonanalytics.com");
  });
});
