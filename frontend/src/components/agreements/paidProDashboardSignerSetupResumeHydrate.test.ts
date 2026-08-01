import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");
const createPageSrc = readFileSync(
  join(here, "../../launch/simpleProduct/SimpleCreatePage.tsx"),
  "utf8",
);
const launchNavSrc = readFileSync(join(here, "../../launch/LaunchNavContext.tsx"), "utf8");

describe("dashboard signer-setup resume hydrate (source invariants)", () => {
  it("create page keeps resume_signer_setup query until intake consumes it", () => {
    expect(createPageSrc).toContain("resumeSignerSetupAgreementId");
    expect(createPageSrc).toContain("Keep resume_signer_setup in the URL");
    expect(createPageSrc).not.toMatch(
      /searchParams\.delete\(\s*["']resume_signer_setup["']\s*\)/,
    );
  });

  it("LaunchNav marks resume source instead of fresh dashboard_paid_create", () => {
    expect(launchNavSrc).toContain("resumeSignerSetupAgreementId");
    expect(launchNavSrc).toContain("DASHBOARD_SIGNER_SETUP_RESUME_SOURCE");
    expect(launchNavSrc).toContain("Must win over authenticated-workspace auto-mark");
  });

  it("intake forces signer_setup_required and skips body party re-derivation on resume hydrate", () => {
    expect(intakeSrc).toContain("dashboard_signer_setup_resume_hydrate");
    expect(intakeSrc).toContain('signerSetupResume ? "signer_setup_required"');
    expect(intakeSrc).toContain("never re-derive");
    expect(intakeSrc).toContain("setPaidProInlineSignerSetupLatched(true)");
    expect(intakeSrc).toContain("PAID_PRO_FIRST_REVIEW_INLINE_SIGNER_SETUP_DOM_ID");
    expect(intakeSrc).toContain("stripResumeSignerSetupQueryFromCreateUrl");
  });

  it("suppresses Retry Pro draft recovery while signer setup resume is active", () => {
    expect(intakeSrc).toContain("!openSignerSetupOnResume");
    expect(intakeSrc).toContain('createFlowPhase !== "signer_setup_required"');
  });
});
