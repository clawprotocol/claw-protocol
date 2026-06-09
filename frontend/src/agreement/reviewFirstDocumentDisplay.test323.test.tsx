/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { buildReviewFirstDocumentDisplayHtml } from "./reviewFirstDocumentDisplay";
import { polishProAgreementDisplayLayer, normalizeAgreementOpeningStructure } from "../components/agreements/polishProAgreementDisplayLayer";
import { formatAgreementPlainTextForEditing } from "./formatAgreementPlainTextForEditing";
import {
  analyzeReviewerVisibleClauseParity,
  extractVisiblePlainFromReviewHtml,
} from "./reviewFirstDocumentDisplayParity";
import {
  SECTION_9_BODY_TEXT,
  section9BodyBetweenHeadings,
  section9HeadingImmediatelyPrecedesSection10,
} from "./reviewFirstDocumentDisplaySection9Trace";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "../components/agreements/paidProSourceOfTruth";
import { PremiumAgreementReadonlyView } from "../components/agreements/PremiumAgreementReadonlyView";
import { cleanup, render } from "@testing-library/react";

export const SECTION_9_BODY = SECTION_9_BODY_TEXT;

export function buildTest323ConsultingCorpus(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "This Agreement is entered into between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
    "1. SCOPE OF SERVICES",
    "Provider shall deliver consulting and implementation services.",
    "2. COMPENSATION",
    "Client shall pay fees according to the agreed schedule.",
    "3. OWNERSHIP OF WORK PRODUCT",
    "Client owns deliverables after payment.",
    "4. CONFIDENTIALITY",
    "Each party shall protect confidential information.",
    "5. TERMINATION",
    "Either party may terminate with thirty days written notice.",
    "6. LIMITATION OF LIABILITY",
    "Neither party is liable for indirect damages except as required by law.",
    "7. GOVERNING LAW",
    "This Agreement is governed by the laws of the State of Nevada.",
    "8. NOTICES",
    "Notices shall be delivered electronically to the designated contacts.",
    "9. MISCELLANEOUS",
    SECTION_9_BODY,
    "10. ELECTRONIC SIGNATURES",
    "The parties may execute this Agreement in counterparts, including by electronic signature.",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Blue Canyon Analytics LLC",
    "By: ______________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Email for Notices: owner@example.test",
    "Address for Notices: 1027 S. Rainbow Blvd., Las Vegas, NV",
    "SERVICE PROVIDER:",
    "Iron Vale Systems Inc",
    "By: ______________________",
    "Name: Michael Torres",
    "Title: President",
    "Email for Notices: cp@example.test",
    "Address for Notices: 12 Reese Ave., Metairie, MS",
  ].join("\n\n");
}

describe("TEST323 reviewer visible clause parity", () => {
  it("reviewer visible HTML contains Section 9 heading and full body", () => {
    const corpus = buildTest323ConsultingCorpus();
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: corpus,
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc"],
      surface: "reviewer",
      selectedCorpusSource: "server_full_document_text",
    });
    expect(html).toMatch(/entire agreement between the parties/i);
    expect(html).toMatch(/by their nature should survive termination/i);
    const visiblePlain = extractVisiblePlainFromReviewHtml(html);
    expect(visiblePlain).toMatch(/9\.\s+MISCELLANEOUS/i);
    expect(visiblePlain).toMatch(/entire agreement between the parties/i);
    expect(visiblePlain).toMatch(/by their nature should survive termination/i);
    expect(section9HeadingImmediatelyPrecedesSection10(visiblePlain)).toBe(false);
    expect(section9BodyBetweenHeadings(visiblePlain)).toBe(true);
  });

  it("PremiumAgreementReadonlyView mounted DOM contains Section 9 body between headings 9 and 10", () => {
    const corpus = buildTest323ConsultingCorpus();
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: corpus,
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc"],
      surface: "reviewer",
    });
    const { container, unmount } = render(
      <PremiumAgreementReadonlyView html={html} fullDocumentFlow compactDocumentTopPadding />,
    );
    const domText = container.textContent ?? "";
    expect(domText).toMatch(/9\.\s+MISCELLANEOUS/i);
    expect(domText).toMatch(/entire agreement between the parties/i);
    expect(domText).toMatch(/10\.\s+ELECTRONIC SIGNATURES/i);
    expect(section9BodyBetweenHeadings(domText)).toBe(true);
    expect(section9HeadingImmediatelyPrecedesSection10(domText)).toBe(false);
    unmount();
    cleanup();
  });

  it("review track HTML preserves Section 9 when paid Pro source of truth is active", () => {
    const corpus = buildTest323ConsultingCorpus();
    establishPaidProSourceOfTruth({ text: corpus, source: "server_full_draft" });
    try {
      const html = buildReviewFirstDocumentDisplayHtml({
        serverHtml: "",
        corpusText: corpus,
        partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc"],
        surface: "reviewer",
      });
      const visiblePlain = extractVisiblePlainFromReviewHtml(html);
      expect(visiblePlain).toMatch(/entire agreement between the parties/i);
      expect(section9BodyBetweenHeadings(visiblePlain)).toBe(true);
    } finally {
      clearPaidProSourceOfTruth();
    }
  });

  it("copy/export plain retains Section 9 heading and body", () => {
    const corpus = buildTest323ConsultingCorpus();
    const copyExport = formatAgreementPlainTextForEditing(corpus);
    expect(copyExport).toMatch(/9\.\s+MISCELLANEOUS/i);
    expect(copyExport).toMatch(/entire agreement between the parties/i);
  });

  it("visible HTML and copy/export share clause-number parity for sections 1–10", () => {
    const corpus = buildTest323ConsultingCorpus();
    const copyExport = formatAgreementPlainTextForEditing(corpus);
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: corpus,
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc"],
      surface: "reviewer",
    });
    const parity = analyzeReviewerVisibleClauseParity({
      corpusPlain: corpus,
      copyExportPlain: copyExport,
      visibleHtml: html,
    });
    expect(parity.hasSection9HeadingInCopyExport).toBe(true);
    expect(parity.hasSection9BodyInCopyExport).toBe(true);
    expect(parity.hasSection9HeadingInVisibleHtml).toBe(true);
    expect(parity.hasSection9BodyInVisibleHtml).toBe(true);
    expect(parity.droppedHeadingNumbers).toEqual([]);
    for (let n = 1; n <= 10; n += 1) {
      expect(parity.sectionNumbersInCopyExport).toContain(n);
      expect(parity.sectionNumbersInVisibleHtml).toContain(n);
    }
  });

  it("Section 10 and execution block still render after Section 9", () => {
    const corpus = buildTest323ConsultingCorpus();
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: corpus,
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc"],
      surface: "reviewer",
    });
    const visiblePlain = extractVisiblePlainFromReviewHtml(html);
    const idx9 = visiblePlain.search(/9\.\s+MISCELLANEOUS/i);
    const idx10 = visiblePlain.search(/10\.\s+ELECTRONIC SIGNATURES/i);
    const idxWitness = visiblePlain.search(/IN WITNESS WHEREOF/i);
    expect(idx9).toBeGreaterThanOrEqual(0);
    expect(idx10).toBeGreaterThan(idx9);
    expect(idxWitness).toBeGreaterThan(idx10);
    expect(visiblePlain).toMatch(/Sarah Mitchell/i);
    expect(visiblePlain).toMatch(/Michael Torres/i);
  });

  it("display polish does not drop Section 9 body before numbered section 10", () => {
    const corpus = buildTest323ConsultingCorpus();
    const polished = polishProAgreementDisplayLayer(corpus, {
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    }).text;
    expect(polished).toMatch(/entire agreement between the parties/i);
    const idx9 = polished.search(/9\.\s+MISCELLANEOUS/i);
    const idx10 = polished.search(/10\.\s+ELECTRONIC SIGNATURES/i);
    const idxBody = polished.search(/entire agreement between the parties/i);
    expect(idx9).toBeGreaterThanOrEqual(0);
    expect(idxBody).toBeGreaterThan(idx9);
    expect(idxBody).toBeLessThan(idx10);
  });

  it("retains exactly one execution block with hydrated signer metadata", () => {
    const corpus = buildTest323ConsultingCorpus();
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: corpus,
      partyNames: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc"],
      surface: "reviewer",
    });
    const visiblePlain = extractVisiblePlainFromReviewHtml(html);
    expect(visiblePlain.match(/\bIN WITNESS WHEREOF\b/gi)?.length ?? 0).toBe(1);
    expect(visiblePlain).toMatch(/Sarah Mitchell/i);
    expect(visiblePlain).toMatch(/CEO/i);
    expect(visiblePlain).toMatch(/owner@example\.test/i);
    expect(visiblePlain).toMatch(/Michael Torres/i);
    expect(visiblePlain).toMatch(/President/i);
    expect(visiblePlain).toMatch(/cp@example\.test/i);
    expect(visiblePlain).toMatch(/1027 S\. Rainbow Blvd/i);
    expect(visiblePlain).toMatch(/12 Reese Ave/i);
  });

  it("normalizeAgreementOpeningStructure keeps miscellaneous integration clause", () => {
    const structured = normalizeAgreementOpeningStructure(buildTest323ConsultingCorpus(), {
      reviewDisplayMode: true,
      retainSignatureExecutionBlock: true,
    }).text;
    expect(structured).toMatch(/entire agreement between the parties/i);
  });
});
