/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  clearDisplayReviewSnapshotAuthority,
  sha256CorpusDigest,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import {
  classifyPaidProDocumentBlocks,
  isMainSectionHeadingLine,
} from "./paidProDocumentBlockClassifier";
import { PaidProCanonicalPlainReviewDocument } from "./paidProCanonicalPlainReviewDocument";
import {
  resetPaidProTest310BlockClassificationLogsForTests,
  resetPaidProTest310DisplaySourceLogsForTests,
  resolvePaidProFirstReviewVisibleDisplayPlain,
} from "./paidProFirstReviewDisplayAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
  resolveCanonicalPlainForVisibleShell,
  resolvePaidProVisibleShellRenderBranch,
} from "./paidProVisibleDocumentShell";
import { isForbiddenPaidProDisplayRenderSource } from "./premiumGenerationApiAvailability";

function buildProAuthorityCorpus(): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(80);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "This Agreement is entered into as of the Effective Date by and between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
    "1. SCOPE OF SERVICES",
    "1.1 Provider shall deliver consulting and implementation services.",
    "8. GENERAL PROVISIONS",
    "8.1 Notices shall be delivered as set forth herein.",
    "9. MISCELLANEOUS",
    "Survival and severability apply as stated.",
    "10. INDEPENDENT CONTRACTOR AND ACCESS",
    "Each party is an independent contractor and not an agent of the other.",
    "11. WARRANTIES AND COMPLIANCE",
    "Each party represents compliance with applicable law.",
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Blue Canyon Analytics LLC",
    "By: __________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "SERVICE PROVIDER:",
    "Iron Vale Systems Inc.",
    "By: __________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n\n");
}

const LIVE_PREVIEW_CORPUS = [
  "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
  "This is a simplified starter preview for review.",
  "9. MISCELLANEOUS",
  "10. INDEPENDENT CONTRACTOR AND ACCESS. Each party is an independent contractor.",
  "11. WARRANTIES AND COMPLIANCE. Each party represents compliance.",
].join("\n\n");

async function seedVerified(corpus: string, agreementId = "ag_test310"): Promise<void> {
  const sha = await sha256CorpusDigest(corpus);
  storeVerifiedCommercialDisplayCorpus({
    agreementId,
    snapshotId: "crs_test310",
    corpusSha256: sha,
    corpusLength: corpus.length,
    status: "pending",
    corpusPlain: corpus,
  });
}

describe("paidProFirstReviewDisplayAuthority", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearDisplayReviewSnapshotAuthority();
    resetPaidProTest310DisplaySourceLogsForTests();
    resetPaidProTest310BlockClassificationLogsForTests();
    cleanup();
  });

  it("blocks live_generated_preview picker source after paid Pro checkout is active", () => {
    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: "ag_test310",
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      pickerPlain: LIVE_PREVIEW_CORPUS,
      pickerSource: "live_generated_preview",
      paidProActive: true,
    });
    expect(resolution.plain).toBe("");
    expect(resolution.fallbackReason).toBe("awaiting_server_display_authority");
    expect(isForbiddenPaidProDisplayRenderSource("live_generated_preview")).toBe(true);
  });

  it("does not paint local SoT before verified server GET authority", () => {
    const authority = buildProAuthorityCorpus();
    establishPaidProSourceOfTruth({
      text: authority,
      source: "server_full_draft",
    });
    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: "ag_test310",
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      pickerPlain: LIVE_PREVIEW_CORPUS,
      pickerSource: "live_generated_preview",
      paidProActive: true,
    });
    expect(resolution.plain).toBe("");
    expect(resolution.fallbackReason).toBe("awaiting_server_display_authority");
  });

  it("paints verified server GET corpus (not local SoT / live preview) when authority matches", async () => {
    const authority = buildProAuthorityCorpus();
    establishPaidProSourceOfTruth({
      text: authority,
      source: "server_full_draft",
    });
    await seedVerified(authority);
    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: "ag_test310",
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      pickerPlain: LIVE_PREVIEW_CORPUS,
      pickerSource: "live_generated_preview",
      paidProActive: true,
    });
    expect(resolution.plain.length).toBeGreaterThanOrEqual(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);
    expect(resolution.source).toBe("verified_server_canonical_review_snapshot");
    expect(resolution.plain).toContain("Sarah Mitchell");
    expect(resolution.plain).toContain("Michael Torres");
  });

  it("classifies sections 9/10/11 as main headings and 8.1/9.1 as body paragraphs", () => {
    const authority = buildProAuthorityCorpus();
    expect(isMainSectionHeadingLine("9. MISCELLANEOUS")).toBe(true);
    expect(isMainSectionHeadingLine("10. INDEPENDENT CONTRACTOR AND ACCESS")).toBe(true);
    expect(isMainSectionHeadingLine("11. WARRANTIES AND COMPLIANCE")).toBe(true);
    expect(isMainSectionHeadingLine("8.1 Notices shall be delivered")).toBe(false);
    expect(isMainSectionHeadingLine("1.1 Provider shall deliver")).toBe(false);

    const blocks = classifyPaidProDocumentBlocks(authority);
    const mainHeadings = blocks.filter((b) => b.kind === "main_section_heading").map((b) => b.firstLine);
    expect(mainHeadings).toEqual(
      expect.arrayContaining([
        "9. MISCELLANEOUS",
        "10. INDEPENDENT CONTRACTOR AND ACCESS",
        "11. WARRANTIES AND COMPLIANCE",
      ]),
    );
    expect(blocks.find((b) => b.firstLine.startsWith("8.1"))?.kind).toBe("body_paragraph");
    expect(blocks.find((b) => b.firstLine.startsWith("1.1"))?.kind).toBe("body_paragraph");
  });

  it("renders sections 9/10/11 consistently as h2 section headings on first review", async () => {
    const authority = buildProAuthorityCorpus();
    await seedVerified(authority);
    const { container, unmount } = render(
      <PaidProCanonicalPlainReviewDocument
        plain={resolveCanonicalPlainForVisibleShell({
          paidProActive: true,
          agreementId: "ag_test310",
          premiumCheckoutCompleted: true,
        }).plain}
        tailPaddingClass="pb-12"
        compactTopPadding
        authoritativeSource="test310"
      />,
    );
    const headings = Array.from(container.querySelectorAll("h2.premium-doc-section-heading")).map(
      (el) => el.textContent?.trim() ?? "",
    );
    expect(headings).toEqual(
      expect.arrayContaining([
        "9. MISCELLANEOUS",
        "10. INDEPENDENT CONTRACTOR AND ACCESS",
        "11. WARRANTIES AND COMPLIANCE",
      ]),
    );
    unmount();
  });

  it("does not route paid first review to HTML when only live preview html exists", () => {
    const branch = resolvePaidProVisibleShellRenderBranch({
      hasSoT: false,
      sotLen: 0,
      htmlLen: 5000,
      canonicalPlainLen: 0,
      paidProFirstReviewActive: true,
    });
    expect(branch.branch).toBe("empty");
    expect(branch.reason).toBe("paid_pro_awaiting_display_authority");
  });
});
