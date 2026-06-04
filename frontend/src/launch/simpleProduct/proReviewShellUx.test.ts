import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRO_REVIEW_DOCUMENT_PANEL_HEADING,
  PRO_REVIEW_DOCUMENT_PANEL_SUBCOPY,
  SIMPLE_CREATE_PAID_PRO_REVIEW_CONTROL_LINE,
  SIMPLE_CREATE_PAID_PRO_REVIEW_SUBTITLE,
  SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE,
} from "./simpleCreatePaidProReviewShell";

describe("Pro review shell UX", () => {
  const intake = readFileSync(
    join(__dirname, "../../components/agreements/AgreementBuilderIntake.tsx"),
    "utf8",
  );
  const createPage = readFileSync(join(__dirname, "SimpleCreatePage.tsx"), "utf8");
  const joy = readFileSync(join(__dirname, "../../joy/clawJoyCopy.ts"), "utf8");

  it("targets concise Pro review copy", () => {
    expect(SIMPLE_CREATE_PAID_PRO_REVIEW_TITLE).toBe("Review your Pro agreement");
    expect(SIMPLE_CREATE_PAID_PRO_REVIEW_SUBTITLE).toMatch(/Nothing is sent or signed/i);
    expect(SIMPLE_CREATE_PAID_PRO_REVIEW_CONTROL_LINE).toMatch(/Nothing is sent or signed/i);
    expect(PRO_REVIEW_DOCUMENT_PANEL_HEADING).toBe("Review your Pro agreement");
    expect(PRO_REVIEW_DOCUMENT_PANEL_SUBCOPY).toMatch(/Nothing is sent or signed/i);
  });

  it("highlights Review on paid Pro create shell and hides duplicate intake chrome", () => {
    expect(createPage).toContain("shellLifecycleStage");
    expect(createPage).toContain("lifecycleStepForStage(shellLifecycleStage)");
    expect(createPage).toContain("compactReviewHeader={paidProReviewReadyShell}");
    expect(intake).toContain("paidProReviewCompactChrome");
    expect(intake).toContain("PRO_REVIEW_DOCUMENT_PANEL_SUBCOPY");
    expect(intake).toContain("resolveSimpleCreateShellLifecycleStage");
    expect(intake).toContain("lifecycleStage: simpleCreateShellLifecycleStage");
    expect(intake).not.toContain("formatPremiumRevealDeltaRow(premiumFinalizeAudit)");
  });

  it("does not use Send in persistent lifecycle rails", () => {
    expect(joy).toContain('AGREEMENT_LIFECYCLE_PROGRESS_LABELS as SIMPLE_FLOW_PROGRESS_LABELS');
    expect(joy).not.toMatch(/SIMPLE_FLOW_PROGRESS_LABELS = \["Draft", "Send"/);
  });

  it("keeps document action buttons", () => {
    expect(intake).toContain("Send for review");
    expect(intake).toContain("Send for signature");
    expect(intake).toContain("Edit wording");
    expect(intake).toContain("handleProSendForSignature");
    expect(intake).toContain("logProReviewSendSignatureClick");
  });
});
