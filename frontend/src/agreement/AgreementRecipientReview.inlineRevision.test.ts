import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AgreementRecipientReview inline revision flow", () => {
  it("opens inline editing from Suggest revision instead of a paste-first workflow", () => {
    const source = readFileSync(join(__dirname, "AgreementRecipientReview.tsx"), "utf8");
    const actionIdx = source.indexOf('data-testid="recipient-review-propose-updated-draft"');
    const actionBlock = source.slice(actionIdx, actionIdx + 900);
    expect(source).toContain('const REVIEW_FIRST_PROPOSE_UPDATED_LABEL = "Suggest revision"');
    expect(actionBlock).toContain('setRevisedSubmode("edit")');
    expect(actionBlock).toContain('setRevisedIntakePhase("editing")');
    expect(actionBlock).not.toContain('setRevisedSubmode("paste")');
    expect(source).toContain('data-testid="recipient-edit-draft-textarea"');
    expect(source).toContain("recipient-review-change-visibility-summary");
  });
});
