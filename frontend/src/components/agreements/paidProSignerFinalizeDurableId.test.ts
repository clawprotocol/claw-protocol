/**
 * Universal GTM: paid Pro can paint a full draft and open signer setup before a durable
 * workspace agreement row exists — for any prompt / family / 2–4 party count.
 * Finalize must mint/bind that id (or offer Retry to save), never "reload from dashboard".
 * Demo fixture party seeds (ABC LLC / Sample Corp) must yield to whatever intake names arrived.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isRecipientHandoffSeedDisposable,
  pickRecipientNameForHandoff,
} from "./reviewPlaceholderGuard";

describe("paidPro signer finalize durable agreement id (universal)", () => {
  const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

  it("finalize ensures a workspace agreement id before snapshot/persist", () => {
    const fnStart = intake.indexOf(
      "const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback",
    );
    expect(fnStart).toBeGreaterThan(-1);
    const fnEnd = intake.indexOf(
      "finalizePaidProSignerMetadataAndOpenReviewDecisionRef.current",
      fnStart,
    );
    const block = intake.slice(fnStart, fnEnd);
    expect(block).toContain("ensureReviewAgreementWorkspaceId");
    expect(block).toContain("setCreateFlowDraftPersistError(null)");
    expect(block.indexOf("ensureReviewAgreementWorkspaceId")).toBeLessThan(
      block.indexOf("createAuthoritativeSigningSnapshot"),
    );
    expect(block).toMatch(/could not save this agreement before finalizing signers/i);
    expect(block).toMatch(/Tap Retry to save/i);
    expect(block).not.toMatch(/Reload from the dashboard and try again/i);
  });

  it("durable-id ensure path is product-wide — no prompt/family/party-count branching", () => {
    const fnStart = intake.indexOf(
      "const finalizePaidProSignerMetadataAndOpenReviewDecision = React.useCallback",
    );
    const fnEnd = intake.indexOf(
      "finalizePaidProSignerMetadataAndOpenReviewDecisionRef.current",
      fnStart,
    );
    const block = intake.slice(fnStart, fnEnd);
    // Must not gate minting on deal family, jurisdiction, or named fixture parties.
    expect(block).not.toMatch(/\b(?:nda|msa|sow|saas|florida|new york)\b/i);
    expect(block).not.toMatch(/Alpha LLC|Beacon Inc|Cedar LP|Anthem|PixelForge/i);
    expect(block).not.toMatch(/partyCount\s*===|agreement_family|dealFamily/i);
    // Arm-latch ensure is likewise unconditional on existing workspace id.
    const armEnsureIdx = intake.indexOf(
      "if (!existingWorkspaceId && !signerSetupWorkspaceEnsureStartedRef.current)",
    );
    expect(armEnsureIdx).toBeGreaterThan(-1);
    const armEnsureBlock = intake.slice(armEnsureIdx, armEnsureIdx + 400);
    expect(armEnsureBlock).toContain("ensureReviewAgreementWorkspaceId");
    expect(armEnsureBlock).not.toMatch(/Alpha LLC|Beacon Inc|agreement_family/i);
  });

  it("signer-setup arm also best-effort mints workspace id before finalize", () => {
    expect(intake).toContain("signerSetupWorkspaceEnsureStartedRef");
    const armEnsureIdx = intake.indexOf(
      "if (!existingWorkspaceId && !signerSetupWorkspaceEnsureStartedRef.current)",
    );
    expect(armEnsureIdx).toBeGreaterThan(-1);
    const armBlock = intake.slice(armEnsureIdx, armEnsureIdx + 400);
    expect(armBlock).toContain("ensureReviewAgreementWorkspaceId");
  });

  it("canonical review handoff prefers any intake legal names over disposable demo seeds", () => {
    expect(intake).toContain("pickRecipientNameForHandoff(prev, legalNames[0]!)");
    expect(intake).toContain("pickRecipientNameForHandoff(prev, legalNames[1]!)");
    expect(intake).toContain("pickRecipientNameForHandoff(next[i - 2] ?? \"\", legal)");

    // Disposable fixture seeds (product-wide), not tied to one retest prompt.
    for (const demo of ["ABC LLC", "Sample Corp", "Sample Corporation", "Acme Test Co", "LawDog Demo LLC"]) {
      expect(isRecipientHandoffSeedDisposable(demo)).toBe(true);
    }

    // Arbitrary real intake names across families / party counts win over demo seeds.
    const cases: Array<[string, string]> = [
      ["ABC LLC", "Anthem Blanchard"], // 2-party NDA human + entity
      ["Sample Corp", "Northstar Analytics LLC"], // SaaS
      ["ABC LLC", "Red Mesa Logistics LLC"], // services
      ["Sample Corp", "Harbor Peak Automation LLC"],
      ["ABC LLC", "Alpha LLC"], // 3-party services retest
      ["Sample Corp", "Beacon Inc"],
      ["ABC LLC", "Cedar LP"],
      ["Sample Corp", "PixelForge Labs"],
      ["LawDog Demo LLC", "Jordan Lee Consulting LLC"],
    ];
    for (const [demo, intakeName] of cases) {
      expect(isRecipientHandoffSeedDisposable(intakeName)).toBe(false);
      expect(pickRecipientNameForHandoff(demo, intakeName)).toBe(intakeName);
    }

    // Real user-typed names are not overwritten by a later derived name.
    expect(pickRecipientNameForHandoff("Alpha LLC", "Beacon Inc")).toBe("Alpha LLC");
    expect(pickRecipientNameForHandoff("Northstar Analytics LLC", "Sample Corp")).toBe(
      "Northstar Analytics LLC",
    );
  });
});
