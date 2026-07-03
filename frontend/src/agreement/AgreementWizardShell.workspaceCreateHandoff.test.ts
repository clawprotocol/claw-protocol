import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AgreementWizardShell workspace create post-generation handoff", () => {
  const shellPath = join(__dirname, "AgreementWizardShell.tsx");

  it("navigates successful workspace create to the Pro-style send review flow", () => {
    const source = readFileSync(shellPath, "utf8");
    expect(source).toContain("buildWorkspaceCreateSimpleSendHandoff");
    expect(source).toContain("workspaceCreatePostSendPath");
    expect(source).toContain("simpleSendHandoff");
    expect(source).toContain("useLaunchNav");
    const onCreatedIdx = source.indexOf("const onCreated = useCallback");
    const onCreatedBlock = source.slice(onCreatedIdx, onCreatedIdx + 1800);
    expect(onCreatedBlock).toContain("navigate(");
    expect(onCreatedBlock).toContain("workspaceCreatePostSendPath");
    expect(onCreatedBlock).not.toContain("setStep(1)");
  });

  it("does not keep step-0 intake mounted after create success", () => {
    const source = readFileSync(shellPath, "utf8");
    expect(source).toContain('step === 0 ?');
    expect(source).toContain("AgreementBuilderIntake");
    expect(source).toContain("reviewSection && wizardDraftReady");
  });
});
