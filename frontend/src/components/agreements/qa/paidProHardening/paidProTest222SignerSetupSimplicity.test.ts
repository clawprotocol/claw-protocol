import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  shouldHideAgreementChangeRequestForPaidPro,
  shouldShowPersistedRefineTextareaBox,
} from "../../agreementRefineBelowDocumentPolicy";
import { REFINE_FIELD_HEADING_PRO } from "../../draftPreviewLabels";

const INTAKE_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../AgreementBuilderIntake.tsx"),
  "utf8",
);

describe("paidPro Test222 signer setup policy and intake wiring", () => {
  it("policy hides persisted refine textarea during paid Pro signer setup", () => {
    expect(
      shouldHideAgreementChangeRequestForPaidPro({
        paidProInlineSignerSetupActive: true,
      }),
    ).toBe(true);
    expect(shouldShowPersistedRefineTextareaBox(true, true, true, true)).toBe(false);
    expect(shouldShowPersistedRefineTextareaBox(true, true, true, false)).toBe(true);
  });

  it("intake wires refine suppression and suppresses post-review edit during inline signer setup", () => {
    expect(INTAKE_SRC).toContain("shouldHideAgreementChangeRequestForPaidPro");
    expect(INTAKE_SRC).toContain("hideAgreementChangeRequestDuringPaidProSignerSetup");
    expect(INTAKE_SRC).toMatch(
      /showPersistedRefineBelowDocument[\s\S]{0,400}hideAgreementChangeRequestDuringPaidProSignerSetup/,
    );
    // Post-review edit chrome stays available; refine suppression is owned by
    // hideAgreementChangeRequestDuringPaidProSignerSetup (not suppressPostReviewEditUx).
    expect(INTAKE_SRC).toContain("suppressPostReviewEditUx={false}");
    expect(INTAKE_SRC).not.toMatch(/suppressPostReviewEditUx=\{paidProSignatureDetailsReady\}/);
    expect(INTAKE_SRC).not.toMatch(
      /suppressPostReviewEditUx=\{paidProCanonicalReviewSignerSetupActive\}/,
    );
    expect(REFINE_FIELD_HEADING_PRO).toMatch(/Request changes to your Pro agreement/i);
    expect(INTAKE_SRC).toContain("claw-refine-this-draft");
    expect(INTAKE_SRC).toMatch(
      /showPersistedRefineBelowDocument && !isFreeStarterReviewSurface/,
    );
    expect(INTAKE_SRC).toContain("Tool-assisted drafting only");
  });

  it("plain-text save path does not touch recipient email state setters", () => {
    const blockStart = INTAKE_SRC.indexOf("const handleSaveProFinalReviewPlainEdits");
    const blockEnd = INTAKE_SRC.indexOf("const proReviewSigningFlowState", blockStart);
    const block = INTAKE_SRC.slice(blockStart, blockEnd);
    expect(block).toContain("commitPaidProUserApprovedRevision");
    expect(block).not.toMatch(/setRecipient1Email|setPartySignerNames|setRecipient2Email/);
  });
});
