import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("paidProReviewPostCommitStability (source contract)", () => {
  const intakePath = join(__dirname, "AgreementBuilderIntake.tsx");
  const src = readFileSync(intakePath, "utf8");

  it("instruments post-commit review with paid-pro-review-stability", () => {
    expect(src).toContain('from "./paidProReviewStability"');
    expect(src).toContain("recordPaidProReviewRender");
    expect(src).toContain("notePaidProReviewHashFromPlain");
  });

  it("short-circuits preview rebuild when paid Pro SoT exists", () => {
    expect(src).toMatch(
      /buildPreviewForCurrentTier[\s\S]*?hasPaidProSourceOfTruth\(\)[\s\S]*?resolvePaidProAuthoritativeDisplayPlain\(\)/,
    );
    expect(src).toMatch(
      /renderedAgreementPreview = useMemo[\s\S]*?resolvePaidProAuthoritativeDisplayPlain\(\)/,
    );
  });

  it("dedupes review pipeline telemetry channels", () => {
    expect(src).toContain('logReviewPipelineTelemetryOnce("review-handoff"');
    expect(src).toContain('logReviewPipelineTelemetryOnce("review-gate"');
    expect(src).toContain('logReviewPipelineTelemetryOnce("review-model"');
  });

  it("does not force bypass payment scroll reset after authoritative apply", () => {
    const forcePaymentScroll = src.match(
      /resetPremiumReviewScrollToTop\(\{[^}]*reason:\s*"payment_success_authoritative_apply"[^}]*force:\s*true/g,
    );
    expect(forcePaymentScroll ?? []).toHaveLength(0);
  });

  it("suppresses embedded execution fields in final review html until signer setup", () => {
    expect(src).toMatch(
      /forceEmbedded\s*=[\s\S]*?!suppressProDocumentEmbeddedSignatures/,
    );
  });
});
