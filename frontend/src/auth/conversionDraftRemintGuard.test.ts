import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { shouldMintNewDraftForConversion } from "./preAuthCheckoutAgreement";

const intake = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../components/agreements/AgreementBuilderIntake.tsx"),
  "utf8",
);
const checkout = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../launch/simpleProduct/SimpleCheckoutPage.tsx"),
  "utf8",
);
const billing = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../launch/billingCheckoutApi.ts"),
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

  it("ensureReviewAgreementWorkspaceId cannot remint when persist/resume exists", () => {
    const ensureIdx = intake.indexOf("const ensureReviewAgreementWorkspaceId = React.useCallback");
    expect(ensureIdx).toBeGreaterThan(-1);
    const remountIdx = intake.indexOf("resolveAgreementIdAfterAuthRemount", ensureIdx);
    const postIdx = intake.indexOf("await postNewDraft", ensureIdx);
    expect(remountIdx).toBeGreaterThan(ensureIdx);
    expect(postIdx).toBeGreaterThan(remountIdx);
    const ensureBlock = intake.slice(ensureIdx, postIdx);
    expect(ensureBlock).not.toContain("!isSupersededAgreementId(existingConversionId)");
    expect(ensureBlock).toContain("!remount.mustMint");
  });

  it("auto-persist treats resume/pre-auth as an existing persist so it does not remint", () => {
    expect(intake).toContain("readPreAuthCheckoutAgreementId()");
    expect(intake).toContain("hasReviewAgreementId: Boolean(");
    expect(intake).toContain("readCreateReviewAgreementResumeId()");
  });

  it("Continue with Pro and checkout session body use the persist id, not the create sentinel", () => {
    expect(intake).toContain("readPreAuthCheckoutAgreementId() ||");
    expect(intake).toContain("CREATE_FLOW_CHECKOUT_AGREEMENT_ID");
    expect(checkout).toContain("createBillingCheckoutSession({");
    expect(checkout).toContain("agreementId,");
    expect(checkout).toContain("pinCheckoutPathToPreAuthAgreement");
    expect(billing).toContain("agreement_id: args.agreementId");
    expect(billing).not.toContain("__claw_create_checkout__");
  });
});
