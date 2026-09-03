/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  clearDisplayReviewSnapshotAuthority,
  storeVerifiedCommercialDisplayCorpus,
  sha256CorpusDigest,
} from "../../agreement/canonicalReviewSnapshotApi";
import {
  PaidProDocumentBodyForcedRoute,
  resolvePaidProDocumentBodyRouter,
} from "./paidProDocumentBodyRouter";
import { classifyPaidProDocumentBlocks } from "./paidProDocumentBlockClassifier";
import {
  preferCommittedRefineDisplayPlain,
  resolvePaidProFirstReviewVisibleDisplayPlain,
} from "./paidProFirstReviewDisplayAuthority";
import {
  applyDeterministicSurgicalRevisionFallback,
  parseQuotedSentenceInsertInstruction,
} from "./premiumRefineDeterministicSurgicalFallback";
import {
  reattachMissingCommittedPaintParagraphs,
  resolveCanonicalPlainForVisibleShell,
  resetPaidProVisibleDocumentShellLogsForTests,
} from "./paidProVisibleDocumentShell";
import {
  clearPaidProReviewSessionAuthorityForTests,
  establishPaidProReviewSessionAuthority,
} from "./paidProReviewSessionAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";

const AGREEMENT_ID = "4e18814c-c8fe-4eb9-85ae-a3e694cb596e";
const CERT_MARKER =
  "CERT_AI_REVISE_MARKER_POST176_PAINT — Notices for this agreement may also be delivered by confirmed electronic mail to the addresses on file.";
const CERT_INSTR = `In the Notices section, add this exact sentence as its own short paragraph (do not remove existing text): "${CERT_MARKER}" Keep all other sections unchanged.`;

function liveShapedServicesAgreement(opts?: { notices?: boolean; extraAfterGoverningLaw?: string }): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(40);
  const notices = opts?.notices === false
    ? []
    : [
        "10. Notices",
        "Any notice under this Agreement must be in writing and delivered to the addresses specified by the parties.",
      ];
  const afterGl = opts?.extraAfterGoverningLaw ? [opts.extraAfterGoverningLaw] : [];
  return [
    "SERVICES AGREEMENT",
    'This Agreement is entered into as of the Effective Date by and between Cedar Peak Design LLC ("Client") and Blue Harbor Media Inc ("Service Provider").',
    "1. Engagement and Scope of Services",
    "1.1 Services. Provider shall deliver a brand website refresh, including homepage redesign, style guide, and CMS handoff.",
    "5. Confidentiality",
    "5.4 Required Disclosure. A Receiving Party may disclose Confidential Information if required by law.",
    "6. Representations, Warranties, and Compliance",
    "6.1 Mutual Authority. Each party has the full right and authority to enter into this Agreement.",
    ...notices,
    "11. Governing Law",
    "This Agreement is governed by the laws of the State of Texas, without regard to conflict-of-laws principles.",
    ...afterGl,
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Cedar Peak Design LLC",
    "SERVICE PROVIDER:",
    "Blue Harbor Media Inc",
  ].join("\n\n");
}

async function seedCrs(corpus: string, snapshotId: string): Promise<void> {
  const sha = await sha256CorpusDigest(corpus);
  storeVerifiedCommercialDisplayCorpus({
    agreementId: AGREEMENT_ID,
    snapshotId,
    corpusSha256: sha,
    corpusLength: corpus.length,
    status: "pending",
    corpusPlain: corpus,
  });
}

describe("Ask LawDog forced-route paint after quoted-sentence insert", () => {
  afterEach(() => {
    cleanup();
    clearPaidProSourceOfTruth();
    clearPaidProReviewSessionAuthorityForTests();
    clearDisplayReviewSnapshotAuthority();
    resetPaidProVisibleDocumentShellLogsForTests();
  });

  it("parses the Notices-targeted instruction", () => {
    const parsed = parseQuotedSentenceInsertInstruction(CERT_INSTR);
    expect(parsed?.sentence).toBe(CERT_MARKER);
    expect(parsed?.section?.toLowerCase()).toBe("notices");
  });

  it("places a Notices-targeted insert inside Notices, not after Governing Law", () => {
    const base = liveShapedServicesAgreement();
    const surg = applyDeterministicSurgicalRevisionFallback({
      currentDocumentText: base,
      userInstruction: CERT_INSTR,
    });
    expect(surg.applied).toBe(true);
    expect(surg.text).toContain(CERT_MARKER);
    expect(surg.text.indexOf("10. Notices")).toBeLessThan(surg.text.indexOf(CERT_MARKER));
    expect(surg.text.indexOf(CERT_MARKER)).toBeLessThan(surg.text.indexOf("11. Governing Law"));
    expect(surg.text).toContain("Cedar Peak Design LLC");
    expect(surg.text).toContain("Blue Harbor Media Inc");
  });

  it("keeps a trailing orphan after the last heading in the forced-route projection", () => {
    const withOrphan = liveShapedServicesAgreement({ extraAfterGoverningLaw: CERT_MARKER });
    expect(withOrphan.indexOf("11. Governing Law")).toBeLessThan(withOrphan.indexOf(CERT_MARKER));
    expect(withOrphan.indexOf(CERT_MARKER)).toBeLessThan(withOrphan.indexOf("IN WITNESS WHEREOF"));

    const blocks = classifyPaidProDocumentBlocks(withOrphan);
    expect(blocks.some((b) => b.block.includes(CERT_MARKER))).toBe(true);

    const dropped = withOrphan.slice(0, withOrphan.indexOf("11. Governing Law") + "11. Governing Law".length);
    const reattached = reattachMissingCommittedPaintParagraphs(withOrphan, dropped);
    expect(reattached).toContain(CERT_MARKER);
    expect(reattached.indexOf("10. Notices")).toBeLessThan(reattached.indexOf(CERT_MARKER));
    expect(reattached.indexOf(CERT_MARKER)).toBeLessThan(reattached.indexOf("11. Governing Law"));
  });

  it("paints the committed refine marker on forced-route even when session authority is stale", async () => {
    const original = liveShapedServicesAgreement();
    const refined = applyDeterministicSurgicalRevisionFallback({
      currentDocumentText: original,
      userInstruction: CERT_INSTR,
    }).text;
    expect(refined).toContain(CERT_MARKER);

    establishPaidProSourceOfTruth({
      text: refined,
      source: "server_full_draft",
      allowShorterOverwrite: true,
    });
    await seedCrs(refined, "crs_bfddf5b4_after_refine");
    // Live fail: SoT/CRS advanced, but first-accept session authority was not replaced.
    clearPaidProReviewSessionAuthorityForTests();
    establishPaidProReviewSessionAuthority({
      corpusPlain: original,
      source: "server_full_document_text",
      agreementId: AGREEMENT_ID,
    });

    const preferred = preferCommittedRefineDisplayPlain({
      sessionAuthorityPlain: original,
      sotPlain: refined,
      crsPlain: refined,
    });
    expect(preferred?.plain).toContain(CERT_MARKER);

    const display = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
      acceptedCanonicalPlain: refined,
    });
    expect(display.plain).toContain(CERT_MARKER);

    const painted = resolveCanonicalPlainForVisibleShell({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
      acceptedCanonicalPlain: refined,
    });
    expect(painted.plain).toContain(CERT_MARKER);

    const router = resolvePaidProDocumentBodyRouter();
    render(
      <PaidProDocumentBodyForcedRoute
        router={router}
        html="<div></div>"
        compactDocumentTopPadding
        embedded
        displayContext={{
          agreementId: AGREEMENT_ID,
          premiumCheckoutCompleted: true,
          premiumPaidDocumentSurface: true,
          paidProActive: true,
          acceptedCanonicalPlain: original,
        }}
      />,
    );
    const forced = screen.getByTestId("paid-pro-document-body-forced-route");
    expect(forced.textContent || "").toContain(CERT_MARKER);
    expect(forced.textContent || "").toContain("Cedar Peak Design LLC");
    expect(forced.textContent || "").toContain("Blue Harbor Media Inc");
    expect(forced.textContent || "").not.toMatch(/\[ORG_[12]\]/);
  });

  it("does not let a hollow [ORG_n] remint displace resolved session authority", () => {
    const named = liveShapedServicesAgreement();
    const hollow = named
      .replace(/Cedar Peak Design LLC/g, "[ORG_1]")
      .replace(/Blue Harbor Media Inc/g, "[ORG_2]");
    const preferred = preferCommittedRefineDisplayPlain({
      sessionAuthorityPlain: named,
      sotPlain: hollow,
      crsPlain: hollow,
    });
    expect(preferred).toBeNull();
  });
});
