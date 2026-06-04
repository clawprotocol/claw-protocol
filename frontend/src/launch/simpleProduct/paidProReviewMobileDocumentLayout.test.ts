import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAID_PRO_REVIEW_MOBILE_ARTICLE_PADDING_AFTER_PX,
  PAID_PRO_REVIEW_MOBILE_BREAKPOINT_PX,
  PAID_PRO_REVIEW_MOBILE_VIEWPORT_PX,
  auditPaidProMobilePaperContainment,
  estimatePaidProMobileArticlePaddingSavingsPx,
} from "./paidProReviewMobileDocumentLayout";

const launchCss = readFileSync(join(__dirname, "../launch.css"), "utf8");
const readonlySrc = readFileSync(
  join(__dirname, "../../components/agreements/PremiumAgreementReadonlyView.tsx"),
  "utf8",
);

describe("paidProReviewMobileDocumentLayout", () => {
  it("documents mobile breakpoint and viewport targets", () => {
    expect(PAID_PRO_REVIEW_MOBILE_BREAKPOINT_PX).toBe(480);
    expect(PAID_PRO_REVIEW_MOBILE_VIEWPORT_PX).toBe(376);
    expect(estimatePaidProMobileArticlePaddingSavingsPx()).toBe(28);
    expect(PAID_PRO_REVIEW_MOBILE_ARTICLE_PADDING_AFTER_PX).toBe(16);
  });

  it("audit passes when paper, title, and signature fit 376px viewport", () => {
    const audit = auditPaidProMobilePaperContainment({
      viewportWidth: 376,
      paperLeft: 8,
      paperRight: 368,
      titleLeft: 24,
      titleRight: 352,
      signatureLeft: 24,
      signatureRight: 340,
    });
    expect(audit.pass).toBe(true);
    expect(audit.issues).toEqual([]);
  });

  it("audit fails when title or signature extends past viewport", () => {
    const titleOverflow = auditPaidProMobilePaperContainment({
      viewportWidth: 376,
      paperLeft: 0,
      paperRight: 400,
      titleLeft: 0,
      titleRight: 410,
      signatureLeft: 20,
      signatureRight: 350,
    });
    expect(titleOverflow.pass).toBe(false);
    expect(titleOverflow.issues.some((i) => i.includes("title"))).toBe(true);

    const paperOverflow = auditPaidProMobilePaperContainment({
      viewportWidth: 376,
      paperLeft: -4,
      paperRight: 380,
      titleLeft: 16,
      titleRight: 360,
      signatureLeft: 16,
      signatureRight: 360,
    });
    expect(paperOverflow.pass).toBe(false);
    expect(paperOverflow.issues.some((i) => i.includes("paper"))).toBe(true);
  });

  it("wires mobile overflow guards in launch.css and readonly view", () => {
    expect(launchCss).toContain("@media (max-width: 480px)");
    expect(launchCss).toContain("overflow-x: hidden");
    expect(launchCss).toContain("[data-paid-pro-review-document-shell=\"true\"]");
    expect(readonlySrc).toContain('data-paid-pro-review-paper="true"');
    expect(readonlySrc).toContain("@media (max-width:480px)");
    expect(readonlySrc).toContain("max-[480px]:px-4");
  });
});
