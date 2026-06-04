import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("paidProReviewVerticalLayout integration", () => {
  const intake = readFileSync(
    join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
    "utf8",
  );
  const createPage = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
  const reviewScreen = readFileSync(
    join(__dirname, "../../components/agreements/SimpleProFinalReviewScreen.tsx"),
    "utf8",
  );

  it("wires compact review layout through shell and intake", () => {
    expect(createPage).toContain("compactReviewHeader={paidProReviewReadyShell}");
    expect(createPage).not.toContain("SIMPLE_CREATE_PAID_PRO_REVIEW_CONTROL_LINE");
    expect(intake).toContain("suppressShellDuplicatedChrome={paidProReviewCompactChrome}");
    expect(intake).toContain('data-paid-pro-review-compact={paidProReviewCompactChrome ? "true" : undefined}');
    expect(reviewScreen).toContain("suppressShellDuplicatedChrome");
    expect(reviewScreen).toContain("documentFirst");
    expect(reviewScreen).toContain("compactDocumentTopPadding={hideInPanelTitleChrome}");
  });
});
