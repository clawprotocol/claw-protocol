import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shouldMintNewDraftForConversion } from "./preAuthCheckoutAgreement";

const intake = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/agreements/AgreementBuilderIntake.tsx"),
  "utf8",
);

describe("conversion draft remint guard", () => {
  it("postNewDraft reuses the conversion persist id and does not POST a second UUID", () => {
    const fnIdx = intake.indexOf("async function postNewDraft(");
    expect(fnIdx).toBeGreaterThan(-1);
    const reuseIdx = intake.indexOf("resolveExistingConversionAgreementId", fnIdx);
    const mintGuardIdx = intake.indexOf("shouldMintNewDraftForConversion", fnIdx);
    const postIdx = intake.indexOf('apiUrl("/api/agreements/draft")', fnIdx);
    expect(reuseIdx).toBeGreaterThan(fnIdx);
    expect(mintGuardIdx).toBeGreaterThan(fnIdx);
    expect(postIdx).toBeGreaterThan(mintGuardIdx);
    expect(shouldMintNewDraftForConversion("5e79c874-91bd-4d43-95f1-80a827e8b26a")).toBe(false);
  });

  it("ensureReviewAgreementWorkspaceId reuses resume/pre-auth before minting", () => {
    const ensureIdx = intake.indexOf("const ensureReviewAgreementWorkspaceId = React.useCallback");
    expect(ensureIdx).toBeGreaterThan(-1);
    const reuseIdx = intake.indexOf("resolveExistingConversionAgreementId", ensureIdx);
    const postIdx = intake.indexOf("await postNewDraft", ensureIdx);
    expect(reuseIdx).toBeGreaterThan(ensureIdx);
    expect(postIdx).toBeGreaterThan(reuseIdx);
  });

  it("auto-persist treats resume/pre-auth as an existing persist so it does not remint", () => {
    expect(intake).toContain("readPreAuthCheckoutAgreementId()");
    expect(intake).toContain("hasReviewAgreementId: Boolean(");
    expect(intake).toContain("readCreateReviewAgreementResumeId()");
  });
});
