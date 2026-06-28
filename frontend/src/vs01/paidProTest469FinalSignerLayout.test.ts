/** @vitest-environment jsdom */
/** TEST469 — final signer execution block Date line remains visible (no footer clip). */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEST440_BRIGHT_PEAK } from "../components/agreements/paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { buildVs01PrepareSigningRolesFromLegalParties } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningPacketModel,
  canonicalFlowStackBottomNorm,
  isWitnessSigningPacketPage,
  witnessPageTrailingBlankNorm,
} from "./buildVs01SigningPacketModel";
import {
  TEST463_LEGAL_PARTIES,
} from "./paidProTest463Fixtures";

describe("TEST469 final signer layout", () => {
  it("recipient signing scroll reserves space below the last witness execution block", () => {
    const css = readFileSync(join(__dirname, "vs01.css"), "utf8");
    expect(css).toContain("--vs01-recipient-footer-reserve");
    expect(css).toContain(".vs01-recipient-signing-view .vs01-sign-pages-inner");
    expect(css).toContain("scroll-padding-bottom: var(--vs01-recipient-footer-reserve)");

    const viewSrc = readFileSync(join(__dirname, "RecipientSigningView.tsx"), "utf8");
    expect(viewSrc).toContain("vs01-recipient-signing-scroll");
    expect(viewSrc).toContain("vs01-recipient-signing-footer-actions");
  });

  it("four-party witness page keeps BrightPeak Date line inside the content rect", () => {
    const roles = buildVs01PrepareSigningRolesFromLegalParties({
      agreementId: "ag_test469",
      parties: TEST463_LEGAL_PARTIES,
    });
    const corpus = `${"Operational clause with milestones and acceptance criteria. ".repeat(80)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

${roles
  .map(
    (r) =>
      `${r.entityName}\nBy: ______________________\nName: ${r.signerName ?? ""}\nTitle: ${r.signerTitle ?? ""}\nDate: ______________________`,
  )
  .join("\n\n")}`;

    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles,
      corpusGateArgs: { freeBaselinePlain: "x".repeat(735) },
    });
    expect(model.allowed).toBe(true);

    const witnessPage = model.pages.find((p) => isWitnessSigningPacketPage(p));
    expect(witnessPage).toBeTruthy();

    const brightPeakDateIdx = witnessPage!.flowLines.findIndex(
      (line, idx) =>
        /^\s*Date\s*:/i.test(line) &&
        witnessPage!.flowLines
          .slice(Math.max(0, idx - 6), idx)
          .some((prev) => prev.includes(TEST440_BRIGHT_PEAK)),
    );
    expect(brightPeakDateIdx).toBeGreaterThanOrEqual(0);

    const stackBottom = canonicalFlowStackBottomNorm(witnessPage!);
    const contentBottom = witnessPage!.contentRect.y + witnessPage!.contentRect.height;
    expect(stackBottom).toBeLessThanOrEqual(contentBottom + 0.002);
    expect(witnessPageTrailingBlankNorm(witnessPage!)).toBeGreaterThan(0);
  });

  it("separates fused notice address from IN WITNESS WHEREOF in normalization source", () => {
    const normalizationSrc = readFileSync(
      join(__dirname, "../components/agreements/paidProExecutionBlockNormalization.ts"),
      "utf8",
    );
    expect(normalizationSrc).toContain("ensureBlankLineBeforeWitnessBlock");
    expect(normalizationSrc).toContain("separate_fused_witness_heading");
    const fused = "Beavis, AK 98293IN WITNESS WHEREOF, the Parties execute this Agreement.";
    const repaired = fused.replace(/([^\n\s])(\s*IN WITNESS WHEREOF\b)/gi, "$1\n\n$2");
    expect(repaired).toMatch(/98293\n\nIN WITNESS WHEREOF/i);
  });
});
