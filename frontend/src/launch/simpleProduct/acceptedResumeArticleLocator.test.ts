/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACCEPTED_RESUME_ARTICLE_CANDIDATES,
  selectVisibleAcceptedResumeArticle,
} from "./acceptedResumeArticleLocator";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("accepted resume article locator", () => {
  it("does not use union-plus-first and includes role=article", () => {
    const journey = readFileSync(join(__dirname, "../../../e2e/core-paid-journey-live/qualityEvalJourney.ts"), "utf8");
    expect(journey).toContain("ACCEPTED_RESUME_ARTICLE_CANDIDATES");
    expect(journey).toContain("selectVisibleAcceptedResumeArticle");
    expect(journey).not.toMatch(/getByTestId\("paid-pro-visible-document-shell"\)\s*\.or\(/);
    expect(ACCEPTED_RESUME_ARTICLE_CANDIDATES.map((row) => row.name)).toEqual([
      "simple-pro-final-review-document",
      "paid-pro-visible-document-shell",
      "premium-agreement-readonly-article",
      "article-tag-preview",
      "role-article-preview",
    ]);
  });

  it("selects the visible candidate that contains the party cue, not an empty earlier wrapper", () => {
    const chosen = selectVisibleAcceptedResumeArticle(
      [
        { name: "simple-pro-final-review-document", visible: true, text: "" },
        { name: "paid-pro-visible-document-shell", visible: false, text: "Harbor Peak Analytics LLC" },
        {
          name: "premium-agreement-readonly-article",
          visible: true,
          text: "Harbor Peak Analytics LLC and Ironvale",
        },
        { name: "role-article-preview", visible: true, text: "stale wrapper" },
      ],
      "Harbor Peak",
    );
    expect(chosen?.name).toBe("premium-agreement-readonly-article");
    expect(chosen?.text).toContain("Harbor Peak");
    expect(selectVisibleAcceptedResumeArticle([{ name: "empty", visible: true, text: "" }], "Harbor Peak")).toBeNull();
  });

  it("intake retries accepted GET after the access token arrives", () => {
    const intake = readFileSync(join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"), "utf8");
    expect(intake).toContain("authSession?.access_token");
    expect(intake).toContain("shouldAuthorizeAcceptedResumeGet");
    expect(intake).toMatch(/resumeAccessToken[\s\S]{0,400}fetchAgreementDraftWithSigningLock/);
  });
});
